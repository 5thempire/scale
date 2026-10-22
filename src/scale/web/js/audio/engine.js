// Polyphonic voice manager: note on/off, sustain pedal, volume and a light room reverb.

import { TIMBRES } from "./timbres.js";

const MAX_VOICES = 32;
export const VOLUME_STEPS = 10;
// Sustained notes fade out like a ringing string instead of droning forever.
const SUSTAIN_FADE_TAU = 1.4;

function impulseResponse(ctx, seconds = 1.8, decay = 3) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return ir;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 7;
    this.sustain = false;
    this.voices = []; // every sounding voice, oldest first
    this.byId = new Map(); // id of the key currently holding a voice -> voice
  }

  /** Create/resume the AudioContext. Must be called from a user gesture the first time. */
  ensure() {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      this.ctx = ctx;
      this.bus = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      const reverb = ctx.createConvolver();
      reverb.buffer = impulseResponse(ctx);
      const wet = ctx.createGain();
      wet.gain.value = 0.16;
      this.master = ctx.createGain();
      this.bus.connect(comp);
      this.bus.connect(reverb).connect(wet).connect(comp);
      comp.connect(this.master).connect(ctx.destination);
      this.applyVolume();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  setVolume(level) {
    this.volume = Math.max(0, Math.min(VOLUME_STEPS, level));
    this.applyVolume();
  }

  applyVolume() {
    if (!this.ctx) return;
    const g = Math.pow(this.volume / VOLUME_STEPS, 2) * 1.4;
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.02);
  }

  noteOn(id, midi, velocity, timbreIndex) {
    this.ensure();
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    if (this.byId.has(id)) this.stopVoice(this.byId.get(id), t, 0.015);
    while (this.voices.length >= MAX_VOICES) this.stopVoice(this.voices[0], t, 0.015);

    const damper = ctx.createGain();
    damper.connect(this.bus);
    const v = { ctx, out: damper, midi, freq: 440 * Math.pow(2, (midi - 69) / 12), vel: velocity / 127, t, srcs: [] };
    const { end, release } = TIMBRES[timbreIndex].play(v);
    const voice = { id, damper, srcs: v.srcs, end, release, held: true, stopped: false };
    this.voices.push(voice);
    this.byId.set(id, voice);
    if (Number.isFinite(end)) this.scheduleCleanup(voice, end);
  }

  noteOff(id) {
    const voice = this.byId.get(id);
    if (!voice) return;
    this.byId.delete(id);
    voice.held = false;
    if (voice.release === null) return; // one-shot (drums)
    const t = this.ctx.currentTime;
    if (this.sustain) {
      // Pedal down: percussive voices keep their natural decay, held instruments fade slowly.
      if (!Number.isFinite(voice.end)) voice.damper.gain.setTargetAtTime(0, t, SUSTAIN_FADE_TAU);
      return;
    }
    this.stopVoice(voice, t, voice.release);
  }

  setSustain(on) {
    this.sustain = on;
    if (on || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (const voice of [...this.voices]) {
      if (!voice.held && voice.release !== null) this.stopVoice(voice, t, voice.release);
    }
  }

  stopVoice(voice, t, tau) {
    if (voice.stopped) return;
    voice.stopped = true;
    if (this.byId.get(voice.id) === voice) this.byId.delete(voice.id);
    const g = voice.damper.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
    else {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
    }
    g.setTargetAtTime(0, t, tau);
    this.scheduleCleanup(voice, Math.min(voice.end, t + tau * 7));
  }

  scheduleCleanup(voice, when) {
    for (const s of voice.srcs) s.stop(when);
    clearTimeout(voice.timer);
    voice.timer = setTimeout(() => {
      voice.damper.disconnect();
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
      if (this.byId.get(voice.id) === voice) this.byId.delete(voice.id);
    }, (when - this.ctx.currentTime) * 1000 + 50);
  }

  /** Silence everything immediately (e.g. when the page loses focus). */
  panic() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const voice of [...this.voices]) this.stopVoice(voice, t, 0.02);
  }
}
