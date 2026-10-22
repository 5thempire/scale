// Note names, scale modes and the key-backlight rules of the Scale Pocket.

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Slider position 0 is "Off"; positions 1..11 are the modes in device order.
export const SCALE_MODES = [
  { name: "Off", short: "Off", steps: null },
  { name: "Major", short: "Major", steps: [0, 2, 4, 5, 7, 9, 11] },
  { name: "Minor", short: "Minor", steps: [0, 2, 3, 5, 7, 8, 10] },
  { name: "Dorian", short: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: "Phrygian", short: "Phry", steps: [0, 1, 3, 5, 7, 8, 10] },
  { name: "Lydian", short: "Lydian", steps: [0, 2, 4, 6, 7, 9, 11] },
  { name: "Mixolydian", short: "Mixolydian", steps: [0, 2, 4, 5, 7, 9, 10] },
  { name: "Locrian", short: "Locrian", steps: [0, 1, 3, 5, 6, 8, 10] },
  { name: "Major Pentatonic", short: "Maj Pent", steps: [0, 2, 4, 7, 9] },
  { name: "Minor Pentatonic", short: "Min Pent", steps: [0, 3, 5, 7, 10] },
  { name: "Minor Blues", short: "Min Blues", steps: [0, 3, 5, 6, 7, 10] },
  { name: "Major Blues", short: "Maj Blues", steps: [0, 2, 3, 4, 7, 9] },
];

export const KEY_COUNT = 24;
// Lowest key at octave shift 0. C3 lets the ±4 octave range land exactly on MIDI 0..119.
export const BASE_NOTE = 48;
export const MAX_OCTAVE_SHIFT = 4;

export const isBlack = (pc) => [1, 3, 6, 8, 10].includes(pc);

export function noteName(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * Backlight colour for each of the 24 keys.
 * The main octave runs from the root in the lower row up to (not including) its octave:
 * root keys glow green, other scale notes in the main octave red, the rest blue.
 */
export function keyLights(root, modeIndex) {
  const steps = SCALE_MODES[modeIndex].steps;
  if (!steps) return new Array(KEY_COUNT).fill(null);
  const pcs = new Set(steps.map((s) => (root + s) % 12));
  return Array.from({ length: KEY_COUNT }, (_, i) => {
    const pc = i % 12;
    if (!pcs.has(pc)) return null;
    if (pc === root) return "green";
    return i > root && i < root + 12 ? "red" : "blue";
  });
}

/** Note names and whole/half-step formula for display, e.g. "W W H W W W H". */
export function describeScale(root, modeIndex) {
  const steps = SCALE_MODES[modeIndex].steps;
  if (!steps) return null;
  const notes = [...steps, 12].map((s) => NOTE_NAMES[(root + s) % 12]);
  const gaps = steps.map((s, i) => (steps[i + 1] ?? 12) - s);
  const label = { 1: "H", 2: "W", 3: "W+H", 4: "2W" };
  return { notes, formula: gaps.map((g) => label[g]).join(" ") };
}
