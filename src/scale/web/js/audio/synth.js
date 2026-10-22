// Small building blocks shared by the voice definitions.
//
// Every voice receives a "voice context" `v`:
//   { ctx, out, freq, vel (0..1), t (start time), srcs: [] }
// Sources are pushed onto v.srcs so the engine can stop them on release.

const caches = new WeakMap();

function cacheFor(ctx) {
  let c = caches.get(ctx);
  if (!c) {
    c = { noise: null, waves: new Map(), buffers: new Map() };
    caches.set(ctx, c);
  }
  return c;
}

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Perceptual velocity curve: soft notes stay audible, hard notes punch. */
export const velGain = (vel) => 0.06 + 0.94 * Math.pow(vel, 1.6);

export function noiseBuffer(ctx) {
  const c = cacheFor(ctx);
  if (!c.noise) {
    const len = ctx.sampleRate * 2;
    c.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = c.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return c.noise;
}

/** PeriodicWave from a list of sine-harmonic amplitudes (index 0 = fundamental). */
export function periodicWave(ctx, name, amps) {
  const c = cacheFor(ctx);
  if (!c.waves.has(name)) {
    const imag = new Float32Array(amps.length + 1);
    amps.forEach((a, i) => (imag[i + 1] = a));
    c.waves.set(name, ctx.createPeriodicWave(new Float32Array(amps.length + 1), imag));
  }
  return c.waves.get(name);
}

export function cachedBuffer(ctx, key, make) {
  const c = cacheFor(ctx);
  if (!c.buffers.has(key)) c.buffers.set(key, make());
  return c.buffers.get(key);
}

export function gain(ctx, value, dest) {
  const g = ctx.createGain();
  g.gain.value = value;
  if (dest) g.connect(dest);
  return g;
}

export function filter(ctx, type, freq, { Q = 0.7, gain: dB = 0, dest } = {}) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = Math.min(freq, ctx.sampleRate * 0.45);
  f.Q.value = Q;
  f.gain.value = dB;
  if (dest) f.connect(dest);
  return f;
}

/** Oscillator (type string or PeriodicWave) started at v.t, routed through its own gain. */
export function osc(v, type, freq, dest, { detune = 0, level = 1 } = {}) {
  const o = v.ctx.createOscillator();
  if (typeof type === "string") o.type = type;
  else o.setPeriodicWave(type);
  o.frequency.value = freq;
  o.detune.value = detune;
  const g = gain(v.ctx, level, dest);
  o.connect(g);
  o.start(v.t);
  v.srcs.push(o);
  return { o, g };
}

/** Looping white noise source started at v.t + offset. Untracked sources must stop themselves. */
export function noise(v, dest, offset = 0, track = true) {
  const s = v.ctx.createBufferSource();
  s.buffer = noiseBuffer(v.ctx);
  s.loop = true;
  s.loopStart = Math.random();
  s.connect(dest);
  s.start(v.t + offset, Math.random() * 1.5);
  if (track) v.srcs.push(s);
  return s;
}

/** Instant attack then exponential decay; returns the time it is effectively silent. */
export function strike(param, t, peak, tau, attack = 0.002) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.setTargetAtTime(0, t + attack, tau);
  return t + attack + tau * 7;
}

/** Attack to peak, then settle to a sustain level (for held instruments). */
export function swell(param, t, peak, attack, sustain, decayTau = 0.15) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.setTargetAtTime(peak * sustain, t + attack, decayTau);
}

/** Bank of decaying sine partials: [[ratio, amplitude, tau], ...]. Returns end time. */
export function partials(v, list, dest, peak, attack = 0.002) {
  const nyquist = v.ctx.sampleRate * 0.45;
  let end = v.t;
  for (const [ratio, amp, tau] of list) {
    if (v.freq * ratio > nyquist) continue;
    const { g } = osc(v, "sine", v.freq * ratio, dest, { level: 0 });
    end = Math.max(end, strike(g.gain, v.t, peak * amp, tau, attack));
  }
  return end;
}

/** Vibrato LFO that fades in after `delay`, applied to each oscillator's detune (cents). */
export function vibrato(v, oscs, { rate = 5.5, depth = 10, delay = 0.25, fade = 0.4 } = {}) {
  const lfo = v.ctx.createOscillator();
  lfo.frequency.value = rate;
  const d = gain(v.ctx, 0);
  d.gain.setValueAtTime(0, v.t + delay);
  d.gain.linearRampToValueAtTime(depth, v.t + delay + fade);
  lfo.connect(d);
  oscs.forEach((o) => d.connect(o.detune));
  lfo.start(v.t);
  v.srcs.push(lfo);
}

/** Short filtered noise burst, e.g. hammer, mallet or breath onset. */
export function click(v, dest, { type = "bandpass", freq = 3000, Q = 1, level = 0.2, tau = 0.008, offset = 0 } = {}) {
  const g = gain(v.ctx, 0, dest);
  const f = filter(v.ctx, type, freq, { Q, dest: g });
  const s = noise(v, f, offset, false);
  const end = strike(g.gain, v.t + offset, level, tau, 0.001);
  s.stop(end);
  return end;
}
