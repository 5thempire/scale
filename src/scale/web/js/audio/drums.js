// Drum Kit voice: the 24 keys map onto General MIDI drums 36 (kick) .. 59 (ride 2),
// repeating every two octaves so every key makes a sound at any octave shift.

import { velGain, gain, filter, osc, noise, strike, click } from "./synth.js";

// Pitched body with a falling pitch envelope (kick, toms, snare shell).
function tone(v, { type = "sine", f0, f1, pitchTau = 0.05, level, tau, dest = v.out }) {
  const { o, g } = osc(v, type, f0, dest, { level: 0 });
  o.frequency.setValueAtTime(f0, v.t);
  o.frequency.setTargetAtTime(f1, v.t, pitchTau);
  const end = strike(g.gain, v.t, level, tau, 0.001);
  o.stop(end);
  return end;
}

// Six detuned square waves: the classic analog cymbal/hi-hat "metal" source.
function metal(v, { scale = 1, bp = 10000, hp = 7000, level, tau }) {
  const out = gain(v.ctx, 0, v.out);
  const high = filter(v.ctx, "highpass", hp, { dest: out });
  const band = filter(v.ctx, "bandpass", bp, { Q: 0.6, dest: high });
  const end = strike(out.gain, v.t, level, tau, 0.001);
  for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
    osc(v, "square", f * scale, band, { level: 0.25 }).o.stop(end);
  }
  return end;
}

function hiss(v, { type = "highpass", freq, Q = 0.7, level, tau, offset = 0 }) {
  const g = gain(v.ctx, 0, v.out);
  const s = noise(v, filter(v.ctx, type, freq, { Q, dest: g }), offset, false);
  const end = strike(g.gain, v.t + offset, level, tau, 0.001);
  s.stop(end);
  return end;
}

const tom = (f) => (v, a) =>
  Math.max(
    tone(v, { f0: f * 1.6, f1: f, pitchTau: 0.05, level: 0.8 * a, tau: 0.22 + 20 / f }),
    click(v, v.out, { type: "lowpass", freq: 1500, level: 0.2 * a, tau: 0.01 }),
  );

const crash = (scale, tau) => (v, a) =>
  Math.max(
    metal(v, { scale, hp: 4000, bp: 8000, level: 0.28 * a, tau }),
    hiss(v, { freq: 5000, level: 0.15 * a, tau: tau * 0.8 }),
  );

const ride = (scale) => (v, a) => {
  const end = metal(v, { scale: scale * 1.3, bp: 9000, level: 0.15 * a, tau: 0.8 });
  for (const f of [3200, 4800]) {
    const { o, g } = osc(v, "sine", f * scale, v.out, { level: 0 });
    o.stop(strike(g.gain, v.t, 0.04 * a, 0.5));
  }
  return end;
};

const KIT = [
  // 36 Kick
  (v, a) => Math.max(
    tone(v, { f0: 160, f1: 48, pitchTau: 0.035, level: 1.0 * a, tau: 0.22 }),
    click(v, v.out, { type: "lowpass", freq: 3000, level: 0.25 * a, tau: 0.006 }),
  ),
  // 37 Side stick
  (v, a) => Math.max(
    tone(v, { type: "triangle", f0: 820, f1: 820, level: 0.4 * a, tau: 0.025 }),
    click(v, v.out, { freq: 2000, Q: 3, level: 0.4 * a, tau: 0.02 }),
  ),
  // 38 Acoustic snare
  (v, a) => Math.max(
    tone(v, { type: "triangle", f0: 190, f1: 170, level: 0.5 * a, tau: 0.07 }),
    hiss(v, { freq: 1200, level: 0.55 * a, tau: 0.13 }),
  ),
  // 39 Hand clap: three quick bursts and a short tail
  (v, a) => Math.max(
    ...[0, 0.012, 0.024].map((offset) => hiss(v, { type: "bandpass", freq: 1100, Q: 1.4, level: 0.6 * a, tau: 0.006, offset })),
    hiss(v, { type: "bandpass", freq: 1100, Q: 1.4, level: 0.5 * a, tau: 0.12, offset: 0.036 }),
  ),
  // 40 Electric snare
  (v, a) => Math.max(
    tone(v, { f0: 240, f1: 200, level: 0.45 * a, tau: 0.05 }),
    hiss(v, { type: "bandpass", freq: 3500, level: 0.6 * a, tau: 0.16 }),
  ),
  tom(82), // 41 Low floor tom
  (v, a) => metal(v, { level: 0.35 * a, tau: 0.035 }), // 42 Closed hi-hat
  tom(98), // 43 High floor tom
  (v, a) => metal(v, { bp: 8000, level: 0.25 * a, tau: 0.06 }), // 44 Pedal hi-hat
  tom(116), // 45 Low tom
  (v, a) => metal(v, { level: 0.3 * a, tau: 0.3 }), // 46 Open hi-hat
  tom(135), // 47 Low-mid tom
  tom(155), // 48 Hi-mid tom
  crash(1, 1.1), // 49 Crash 1
  tom(180), // 50 High tom
  ride(1), // 51 Ride 1
  // 52 China
  (v, a) => Math.max(
    metal(v, { scale: 0.8, bp: 4500, hp: 2500, level: 0.25 * a, tau: 0.7 }),
    hiss(v, { type: "bandpass", freq: 4000, level: 0.12 * a, tau: 0.5 }),
  ),
  // 53 Ride bell
  (v, a) => {
    let end = metal(v, { scale: 1.5, level: 0.08 * a, tau: 0.2 });
    for (const r of [1, 1.48, 2.11, 2.69]) {
      const { o, g } = osc(v, "sine", 900 * r, v.out, { level: 0 });
      const e = strike(g.gain, v.t, 0.1 * a / r, 0.9);
      o.stop(e);
      end = Math.max(end, e);
    }
    return end;
  },
  // 54 Tambourine
  (v, a) => Math.max(
    ...[0, 0.01, 0.025].map((offset) => hiss(v, { freq: 7000, level: 0.35 * a, tau: 0.05, offset })),
    metal(v, { scale: 2, level: 0.12 * a, tau: 0.2 }),
  ),
  // 55 Splash
  (v, a) => Math.max(
    metal(v, { scale: 1.2, hp: 5000, level: 0.25 * a, tau: 0.45 }),
    hiss(v, { freq: 6000, level: 0.12 * a, tau: 0.35 }),
  ),
  // 56 Cowbell
  (v, a) => {
    const out = gain(v.ctx, 0, v.out);
    const band = filter(v.ctx, "bandpass", 1000, { Q: 0.8, dest: out });
    const end = strike(out.gain, v.t, 0.35 * a, 0.12, 0.001);
    for (const f of [540, 800]) osc(v, "square", f, band, { level: 0.5 }).o.stop(end);
    return end;
  },
  crash(1.1, 1.3), // 57 Crash 2
  // 58 Vibraslap: rattling noise
  (v, a) => {
    const out = gain(v.ctx, 0, v.out);
    const rattle = gain(v.ctx, 0.5, out);
    const lfo = osc(v, "square", 28, rattle.gain, { level: 0.5 }).o;
    const s = noise(v, filter(v.ctx, "bandpass", 2500, { Q: 1.5, dest: rattle }), 0, false);
    const end = strike(out.gain, v.t, 0.4 * a, 0.5, 0.001);
    s.stop(end);
    lfo.stop(end);
    return end;
  },
  ride(1.15), // 59 Ride 2
];

export function playDrum(v) {
  const index = (((v.midi - 36) % 24) + 24) % 24;
  // Drums are scaled down to sit level with the melodic voices.
  return KIT[index](v, 0.45 * velGain(v.vel));
}
