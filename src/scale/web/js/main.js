import { AudioEngine, VOLUME_STEPS } from "./audio/engine.js";
import { TIMBRES } from "./audio/timbres.js";
import { NOTE_NAMES, SCALE_MODES, BASE_NOTE, MAX_OCTAVE_SHIFT, keyLights, describeScale, noteName } from "./theory.js";
import { createKeyboard } from "./keyboard.js";
import { createSlider } from "./slider.js";
import { Midi } from "./midi.js";

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------- state

const STORAGE_KEY = "scale-pocket:v1";
const DEFAULTS = { timbre: 0, root: 0, mode: 1, octave: 0, fixVel: false, volume: 7 };

function loadState() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode etc.): settings just won't persist.
  }
}

const state = loadState();
let sustain = false;
const held = new Map(); // key index -> { note, channel } played from this page
const midiHeld = new Map(); // incoming MIDI note -> key index it lights, or null

const audio = new AudioEngine();
audio.setVolume(state.volume);

// ---------------------------------------------------------------- playing

const keyboard = createKeyboard($("#keys"), { onPress: press, onRelease: release });

function refreshPressed(i) {
  const down = held.has(i) || [...midiHeld.values()].includes(i);
  keyboard.setPressed(i, down);
}

function press(i, velocity) {
  if (held.has(i)) return;
  const note = BASE_NOTE + 12 * state.octave + i;
  const vel = state.fixVel ? 127 : velocity;
  held.set(i, { note, channel: state.timbre });
  audio.noteOn(`k${i}`, note, vel, state.timbre);
  midi.noteOn(state.timbre, note, vel);
  refreshPressed(i);
  renderPlaying();
}

function release(i) {
  const h = held.get(i);
  if (!h) return;
  held.delete(i);
  audio.noteOff(`k${i}`);
  midi.noteOff(h.channel, h.note);
  refreshPressed(i);
  renderPlaying();
}

function releaseAll() {
  [...held.keys()].forEach(release);
  setSustain(false);
}

function setSustain(on, { fromMidi = false } = {}) {
  if (sustain === on) return;
  sustain = on;
  audio.setSustain(on);
  if (!fromMidi) midi.sustain(state.timbre, on);
  const btn = $('[data-action="sustain"]');
  btn.classList.toggle("is-lit", on);
  btn.setAttribute("aria-pressed", on);
}

// ---------------------------------------------------------------- MIDI

const midi = new Midi({
  onNote(on, note, velocity) {
    const id = `m${note}`;
    const index = note - (BASE_NOTE + 12 * state.octave);
    if (on) {
      audio.noteOn(id, note, state.fixVel ? 127 : velocity, state.timbre);
      midiHeld.set(note, index >= 0 && index < 24 ? index : null);
    } else {
      audio.noteOff(id);
      midiHeld.delete(note);
    }
    if (index >= 0 && index < 24) refreshPressed(index);
    renderPlaying();
  },
  onSustain: (on) => setSustain(on, { fromMidi: true }),
  onChange: renderMidi,
});

function fillSelect(select, ports, selected) {
  select.replaceChildren(new Option("None", ""), ...ports.map((p) => new Option(p.name, p.id)));
  select.value = selected?.id ?? "";
  select.disabled = ports.length === 0;
}

function renderMidi() {
  const status = $("#midi-status");
  if (!midi.supported) {
    $("#midi-connect").disabled = true;
    status.textContent = "Web MIDI isn't available in this browser. Try Chrome, Edge or Firefox.";
    return;
  }
  if (!midi.access) return;
  $("#midi-connect").hidden = true;
  $("#midi-ports").hidden = false;
  fillSelect($("#midi-out"), midi.outputs, midi.output);
  fillSelect($("#midi-in"), midi.inputs, midi.input);
  status.textContent = midi.outputs.length || midi.inputs.length
    ? `Sending on channel ${state.timbre + 1} — the voice slider picks the channel.`
    : "No MIDI devices found. Plug one in and it will appear here.";
}

$("#midi-connect").addEventListener("click", async () => {
  try {
    await midi.enable();
  } catch (err) {
    $("#midi-status").textContent = `MIDI access was blocked (${err.message || err.name}).`;
  }
});
$("#midi-out").addEventListener("change", (e) => {
  // Don't leave notes hanging on the device we're switching away from.
  for (const h of held.values()) midi.noteOff(h.channel, h.note);
  midi.selectOutput(e.target.value);
});
$("#midi-in").addEventListener("change", (e) => midi.selectInput(e.target.value));

// ---------------------------------------------------------------- controls

const sliders = {
  timbre: createSlider($("#slider-timbre"), {
    name: "Voice and MIDI channel",
    labels: TIMBRES.map((t) => t.short),
    describe: (i) => `${TIMBRES[i].name}, MIDI channel ${i + 1}`,
    value: state.timbre,
    onChange: (i) => update({ timbre: i }),
  }),
  root: createSlider($("#slider-root"), {
    name: "Scale root",
    labels: NOTE_NAMES,
    value: state.root,
    onChange: (i) => update({ root: i }),
  }),
  mode: createSlider($("#slider-mode"), {
    name: "Scale mode",
    labels: SCALE_MODES.map((m) => m.short),
    describe: (i) => SCALE_MODES[i].name,
    value: state.mode,
    onChange: (i) => update({ mode: i }),
  }),
};

const actions = {
  fixvel: () => update({ fixVel: !state.fixVel }),
  "oct+": () => shiftOctave(1),
  "oct-": () => shiftOctave(-1),
  "vol+": () => changeVolume(1),
  "vol-": () => changeVolume(-1),
};

function shiftOctave(delta) {
  const octave = Math.max(-MAX_OCTAVE_SHIFT, Math.min(MAX_OCTAVE_SHIFT, state.octave + delta));
  update({ octave });
}

function changeVolume(delta) {
  update({ volume: Math.max(0, Math.min(VOLUME_STEPS, state.volume + delta)) });
  audio.setVolume(state.volume);
}

function flash(action) {
  const btn = $(`[data-action="${action}"]`);
  btn.classList.remove("is-flash");
  void btn.offsetWidth; // restart the animation
  btn.classList.add("is-flash");
}

function trigger(action) {
  audio.ensure();
  actions[action]();
  flash(action);
}

for (const btn of document.querySelectorAll(".pad")) {
  const action = btn.dataset.action;
  if (action === "sustain") {
    // Momentary, like a sustain pedal: on while held.
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      audio.ensure();
      setSustain(true);
    });
    btn.addEventListener("pointerup", () => setSustain(false));
    btn.addEventListener("pointercancel", () => setSustain(false));
  } else {
    btn.addEventListener("click", () => trigger(action));
  }
}

function update(patch) {
  Object.assign(state, patch);
  saveState();
  render();
}

// ---------------------------------------------------------------- computer keyboard

// Physical key positions (layout independent): Z-row is the lower octave, Q-row the upper.
const NOTE_KEYS = [
  "KeyZ", "KeyS", "KeyX", "KeyD", "KeyC", "KeyV", "KeyG", "KeyB", "KeyH", "KeyN", "KeyJ", "KeyM",
  "KeyQ", "Digit2", "KeyW", "Digit3", "KeyE", "KeyR", "Digit5", "KeyT", "Digit6", "KeyY", "Digit7", "KeyU",
];
const ACTION_KEYS = { Minus: "oct-", Equal: "oct+", BracketLeft: "vol-", BracketRight: "vol+", Backslash: "fixvel" };
const COMPUTER_VELOCITY = 100;

function ignoreKey(e) {
  return e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.("select, input, textarea");
}

window.addEventListener("keydown", (e) => {
  if (ignoreKey(e)) return;
  const index = NOTE_KEYS.indexOf(e.code);
  if (index >= 0) {
    e.preventDefault();
    if (!e.repeat) press(index, e.shiftKey ? 127 : COMPUTER_VELOCITY);
  } else if (e.code === "Space") {
    e.preventDefault();
    audio.ensure();
    setSustain(true);
  } else if (ACTION_KEYS[e.code] && !e.repeat) {
    e.preventDefault();
    trigger(ACTION_KEYS[e.code]);
  }
});

window.addEventListener("keyup", (e) => {
  const index = NOTE_KEYS.indexOf(e.code);
  if (index >= 0) release(index);
  else if (e.code === "Space") setSustain(false);
});

window.addEventListener("blur", releaseAll);
document.addEventListener("visibilitychange", () => document.hidden && releaseAll());

// ---------------------------------------------------------------- rendering

function renderPlaying() {
  const notes = [...new Set([...[...held.values()].map((h) => h.note), ...midiHeld.keys()])].sort((a, b) => a - b);
  $("#readout-playing").textContent = notes.length ? notes.map(noteName).join("  ") : "—";
}

function render() {
  keyboard.setLights(keyLights(state.root, state.mode));

  const fix = $('[data-action="fixvel"]');
  fix.classList.toggle("is-lit", state.fixVel);
  fix.setAttribute("aria-pressed", state.fixVel);
  for (const [action, on] of [["oct+", state.octave > 0], ["oct-", state.octave < 0]]) {
    const btn = $(`[data-action="${action}"]`);
    btn.classList.toggle("is-lit", on);
    btn.style.setProperty("--level", Math.abs(state.octave) / MAX_OCTAVE_SHIFT);
  }

  const timbre = TIMBRES[state.timbre];
  $("#readout-voice").textContent = timbre.name;
  $("#readout-channel").textContent = `MIDI channel ${state.timbre + 1}`;

  const scale = describeScale(state.root, state.mode);
  $("#readout-scale").textContent = scale
    ? `${NOTE_NAMES[state.root]} ${SCALE_MODES[state.mode].name}`
    : "Scale lights off";
  $("#readout-notes").textContent = scale ? scale.notes.join(" ") : "Pick a mode to light up a scale";
  $("#readout-formula").textContent = scale ? scale.formula : "";

  const base = BASE_NOTE + 12 * state.octave;
  const sign = state.octave > 0 ? "+" : "";
  $("#readout-octave").textContent = `${sign}${state.octave}`;
  $("#readout-range").textContent = `${noteName(base)} – ${noteName(base + 23)}`;
  $("#readout-volume").textContent = state.volume ? `${state.volume} / ${VOLUME_STEPS}` : "Muted";
  $("#readout-velocity").textContent = state.fixVel ? "Fixed (127)" : "Touch";

  renderMidi();
}

render();
renderPlaying();
