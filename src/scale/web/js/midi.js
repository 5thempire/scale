// Web MIDI: send what the keyboard plays, and receive notes so the page acts as a sound module.

export class Midi {
  constructor({ onNote, onSustain, onChange }) {
    this.access = null;
    this.output = null;
    this.input = null;
    this.onNote = onNote;
    this.onSustain = onSustain;
    this.onChange = onChange;
  }

  get supported() {
    return typeof navigator.requestMIDIAccess === "function";
  }

  async enable() {
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.access.onstatechange = () => this.refresh();
    this.refresh();
  }

  get outputs() {
    return this.access ? [...this.access.outputs.values()] : [];
  }

  get inputs() {
    return this.access ? [...this.access.inputs.values()] : [];
  }

  // Drop selections whose device went away, and auto-pick the only device if there is one.
  refresh() {
    if (this.output && !this.access.outputs.has(this.output.id)) this.output = null;
    if (this.input && !this.access.inputs.has(this.input.id)) this.selectInput(null);
    if (!this.output && this.outputs.length === 1) this.output = this.outputs[0];
    this.onChange?.();
  }

  selectOutput(id) {
    this.output = (id && this.access.outputs.get(id)) || null;
    this.onChange?.();
  }

  selectInput(id) {
    if (this.input) this.input.onmidimessage = null;
    this.input = (id && this.access.inputs.get(id)) || null;
    if (this.input) this.input.onmidimessage = (e) => this.receive(e.data);
    this.onChange?.();
  }

  receive([status, a, b]) {
    const type = status & 0xf0;
    if (type === 0x90 && b > 0) this.onNote?.(true, a, b);
    else if (type === 0x80 || type === 0x90) this.onNote?.(false, a, 0);
    else if (type === 0xb0 && a === 64) this.onSustain?.(b >= 64);
  }

  // `channel` is 0-based (slider position), sent as MIDI channels 1..12.
  noteOn(channel, note, velocity) {
    this.output?.send([0x90 | channel, note, velocity]);
  }

  noteOff(channel, note) {
    this.output?.send([0x80 | channel, note, 0]);
  }

  sustain(channel, on) {
    this.output?.send([0xb0 | channel, 64, on ? 127 : 0]);
  }
}
