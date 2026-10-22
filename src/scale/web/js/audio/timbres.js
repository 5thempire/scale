// The 12 built-in voices, in slider order. Everything is synthesized; no samples.
//
// play(v) builds the sound into v.out and returns:
//   end      – time the sound has naturally died away (Infinity for held instruments)
//   release  – damper time-constant when the key is let go (null = ignore note-off)

import {
  clamp, velGain, periodicWave, cachedBuffer, gain, filter, osc, noise,
  strike, swell, partials, vibrato, click,
} from "./synth.js";
import { playDrum } from "./drums.js";

const piano = (v) => {
  const { ctx, freq, vel, t } = v;
  const tau = clamp(1.7 * Math.sqrt(262 / freq), 0.3, 4.5);
  const peak = 0.32 * velGain(vel);
  const amp = gain(ctx, 0, v.out);
  const lp = filter(ctx, "lowpass", freq * (3 + 14 * vel), { Q: 0.4, dest: amp });
  lp.frequency.setTargetAtTime(Math.max(freq * 2.2, 500), t + 0.01, tau * 0.5);
  const wave = periodicWave(ctx, "piano", Array.from({ length: 18 }, (_, i) => (i === 6 ? 0.05 : 1) / Math.pow(i + 1, 1.15)));
  osc(v, wave, freq, lp, { detune: -1.6, level: 0.5 });
  osc(v, wave, freq, lp, { detune: 1.6, level: 0.5 });
  // Two-stage decay: quick initial drop, then the long string ring.
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.003);
  amp.gain.setTargetAtTime(peak * 0.45, t + 0.003, 0.09);
  amp.gain.setTargetAtTime(0, t + 0.3, tau);
  click(v, v.out, { freq: Math.min(freq * 4, 7000), level: 0.1 * vel, tau: 0.006 });
  return { end: t + 0.3 + tau * 7, release: 0.08 };
};

const musicBox = (v) => {
  const peak = 0.3 * velGain(v.vel);
  const k = Math.sqrt(523 / v.freq);
  const end = partials(v, [[1, 1, 1.4 * k], [3, 0.12, 0.25 * k], [6.27, 0.06, 0.07]], v.out, peak, 0.001);
  click(v, v.out, { type: "highpass", freq: 6000, level: 0.05 * v.vel, tau: 0.003 });
  return { end, release: 0.35 };
};

const accordion = (v) => {
  const { ctx, freq, vel, t } = v;
  const amp = gain(ctx, 0, v.out);
  swell(amp.gain, t, 0.2 * velGain(vel), 0.035, 0.85);
  // Bellows tremolo.
  const trem = gain(ctx, 1, amp);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.2;
  lfo.connect(gain(ctx, 0.05, trem.gain));
  lfo.start(t);
  v.srcs.push(lfo);
  const body = filter(ctx, "peaking", 1300, { Q: 1.2, gain: 5, dest: trem });
  const lp = filter(ctx, "lowpass", 2600 + 2000 * vel, { dest: body });
  // Musette tuning: two reeds slightly apart, plus a hollow lower reed.
  osc(v, "sawtooth", freq, lp, { detune: -7, level: 0.35 });
  osc(v, "sawtooth", freq, lp, { detune: 7, level: 0.35 });
  osc(v, "square", freq, lp, { level: 0.15 });
  return { end: Infinity, release: 0.06 };
};

function pluckBuffer(ctx, freq, bright) {
  const sr = ctx.sampleRate;
  const dur = clamp(3.2 * Math.sqrt(196 / freq), 1.2, 4);
  const len = Math.floor(sr * dur);
  const out = new Float32Array(len);
  // Karplus–Strong: the two-point average adds half a sample of delay.
  const D = sr / freq - 0.5;
  const g = Math.pow(10, -3 / (dur * 0.85 * freq));
  const P = Math.floor(D);
  const a = 0.2 + 0.7 * bright;
  const excite = new Float32Array(P);
  let lp = 0, mean = 0;
  for (let i = 0; i < P; i++) {
    lp += a * (Math.random() * 2 - 1 - lp);
    excite[i] = lp;
    mean += lp / P;
  }
  const at = (pos) => {
    if (pos < 0) return 0;
    const i = Math.floor(pos), f = pos - i;
    return out[i] * (1 - f) + out[i + 1] * f;
  };
  for (let n = 0; n < len; n++) {
    const pos = n - D;
    out[n] = (n < P ? excite[n] - mean : 0) + g * 0.5 * (at(pos) + at(pos - 1));
  }
  const buf = ctx.createBuffer(1, len, sr);
  buf.copyToChannel(out, 0);
  return buf;
}

const guitar = (v) => {
  const { ctx, freq, vel, t } = v;
  const bucket = Math.round(vel * 3);
  const buf = cachedBuffer(ctx, `pluck:${freq.toFixed(2)}:${bucket}`, () => pluckBuffer(ctx, freq, bucket / 3));
  const amp = gain(ctx, 0.5 * velGain(vel), v.out);
  const lp = filter(ctx, "lowpass", 5000, { dest: amp });
  const body = filter(ctx, "peaking", 220, { Q: 1.4, gain: 4, dest: lp });
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.connect(body);
  s.start(t);
  v.srcs.push(s);
  return { end: t + buf.duration, release: 0.07 };
};

const marimba = (v) => {
  const k = clamp(Math.sqrt(262 / v.freq), 0.4, 2.2);
  const peak = 0.4 * velGain(v.vel);
  const end = partials(v, [[1, 1, 0.5 * k], [4, 0.22, 0.07], [9.9, 0.05, 0.015]], v.out, peak, 0.003);
  click(v, v.out, { type: "lowpass", freq: 2000, level: 0.12 * v.vel, tau: 0.004 });
  return { end, release: 0.12 };
};

const harmonica = (v) => {
  const { ctx, freq, vel, t } = v;
  const amp = gain(ctx, 0, v.out);
  swell(amp.gain, t, 0.22 * velGain(vel), 0.03, 0.85);
  const reed = filter(ctx, "peaking", 1500, { Q: 1, gain: 4, dest: amp });
  const lp = filter(ctx, "lowpass", 2400 + 1500 * vel, { dest: reed });
  const wave = periodicWave(ctx, "harmonica", [1, 0.8, 0.6, 0.45, 0.35, 0.25, 0.18, 0.12, 0.08, 0.05]);
  const { o } = osc(v, wave, freq, lp);
  o.detune.setValueAtTime(-20, t);
  o.detune.linearRampToValueAtTime(0, t + 0.05);
  vibrato(v, [o], { rate: 5.5, depth: 9, delay: 0.3 });
  noise(v, filter(ctx, "bandpass", 2200, { Q: 0.8, dest: gain(ctx, 0.04, amp) }));
  return { end: Infinity, release: 0.06 };
};

const glockenspiel = (v) => {
  const peak = 0.26 * velGain(v.vel);
  const end = partials(v, [[1, 1, 2.0], [2.756, 0.3, 0.4], [5.404, 0.12, 0.12], [8.933, 0.05, 0.05]], v.out, peak, 0.001);
  click(v, v.out, { type: "highpass", freq: 5000, level: 0.08 * v.vel, tau: 0.003 });
  return { end, release: 0.5 };
};

const violin = (v) => {
  const { ctx, freq, vel, t } = v;
  const amp = gain(ctx, 0, v.out);
  swell(amp.gain, t, 0.18 * velGain(vel), 0.12 - 0.07 * vel, 0.9, 0.3);
  const bright = filter(ctx, "peaking", 2800, { Q: 1.5, gain: 5, dest: amp });
  const wood = filter(ctx, "peaking", 280, { Q: 1.5, gain: 4, dest: bright });
  const lp = filter(ctx, "lowpass", 2000 + 2500 * vel, { dest: wood });
  const a = osc(v, "sawtooth", freq, lp, { detune: -4, level: 0.5 });
  const b = osc(v, "sawtooth", freq, lp, { detune: 4, level: 0.5 });
  vibrato(v, [a.o, b.o], { rate: 5.8, depth: 14, delay: 0.25, fade: 0.45 });
  noise(v, filter(ctx, "bandpass", 3000, { Q: 0.7, dest: gain(ctx, 0.02, amp) }));
  return { end: Infinity, release: 0.12 };
};

const vibraphone = (v) => {
  const { ctx, t } = v;
  // Motor-driven tremolo.
  const trem = gain(ctx, 0.75, v.out);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5;
  lfo.connect(gain(ctx, 0.25, trem.gain));
  lfo.start(t);
  v.srcs.push(lfo);
  const peak = 0.3 * velGain(v.vel);
  const end = partials(v, [[1, 1, 2.6], [4, 0.18, 0.12], [10, 0.03, 0.03]], trem, peak, 0.002);
  lfo.stop(end);
  return { end, release: 0.18 };
};

const drumKit = (v) => ({ end: playDrum(v), release: null });

const sax = (v) => {
  const { ctx, freq, vel, t } = v;
  const amp = gain(ctx, 0, v.out);
  swell(amp.gain, t, 0.2 * velGain(vel), 0.04, 0.85);
  const formant = filter(ctx, "peaking", 1100, { Q: 1.2, gain: 6, dest: amp });
  const lp = filter(ctx, "lowpass", freq * 1.5, { Q: 2, dest: formant });
  lp.frequency.setValueAtTime(freq * 1.5, t);
  lp.frequency.linearRampToValueAtTime(Math.min(freq * (2 + 8 * vel), 7000), t + 0.06);
  lp.frequency.setTargetAtTime(Math.min(freq * (1.8 + 5 * vel), 6000), t + 0.06, 0.3);
  const a = osc(v, "sawtooth", freq, lp, { level: 0.6 });
  const b = osc(v, "square", freq, lp, { level: 0.25 });
  for (const { o } of [a, b]) {
    o.detune.setValueAtTime(-35, t);
    o.detune.linearRampToValueAtTime(0, t + 0.07);
  }
  vibrato(v, [a.o, b.o], { rate: 5.2, depth: 12, delay: 0.35 });
  noise(v, filter(ctx, "bandpass", 1600, { Q: 0.9, dest: gain(ctx, 0.03 + 0.03 * vel, amp) }));
  return { end: Infinity, release: 0.08 };
};

const squareSynth = (v) => {
  const { ctx, freq, vel, t } = v;
  const amp = gain(ctx, 0, v.out);
  swell(amp.gain, t, 0.16 * velGain(vel), 0.004, 0.65, 0.2);
  const lp = filter(ctx, "lowpass", Math.min(800 + 7000 * vel, 12000), { Q: 5, dest: amp });
  lp.frequency.setTargetAtTime(Math.min(freq * 3 + 600, 16000), t + 0.005, 0.25);
  osc(v, "square", freq, lp, { detune: -6, level: 0.4 });
  osc(v, "square", freq, lp, { detune: 6, level: 0.4 });
  osc(v, "square", freq / 2, lp, { level: 0.25 });
  return { end: Infinity, release: 0.12 };
};

export const TIMBRES = [
  { name: "Grand Piano", short: "Piano", play: piano },
  { name: "Music Box", short: "M.Box", play: musicBox },
  { name: "Accordion", short: "Accordion", play: accordion },
  { name: "Guitar", short: "Guitar", play: guitar },
  { name: "Marimba", short: "Marimba", play: marimba },
  { name: "Harmonica", short: "Harmonica", play: harmonica },
  { name: "Glockenspiel", short: "Glock", play: glockenspiel },
  { name: "Violin", short: "Violin", play: violin },
  { name: "Vibraphone", short: "Vib", play: vibraphone },
  { name: "Drum Kit", short: "Drum Kit", play: drumKit },
  { name: "Sax", short: "Sax", play: sax },
  { name: "Square Synth", short: "Square", play: squareSynth },
];
