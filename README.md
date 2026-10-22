# Scale Pocket (web)

A browser version of the [Synido Scale Pocket](https://www.synido.com/en-eu/products/scale-pocket-portable-mini-piano-midi-controller-learn-scales-play-music),
a two-octave mini keyboard whose backlit keys show the notes of a scale.

```sh
uv run scale            # serves the app on http://localhost:8000 and opens it
uv run scale --port 9000 --no-browser
```

The app itself is plain HTML/CSS/JS in `src/scale/web/` with no build step; the Python package only serves it.

## What it does

Mirrors the controls in the device's user manual:

| Control | Behaviour |
| --- | --- |
| 24 keys | Two octaves (C3–B4 at octave 0). Strike nearer the front edge for higher velocity; pen/force-touch pressure is used when available. |
| Voice slider | 12 voices: Grand Piano, Music Box, Accordion, Guitar, Marimba, Harmonica, Glockenspiel, Violin, Vibraphone, Drum Kit, Sax, Square Synth. Also sets the MIDI out channel (1–12). |
| Root slider | C … B |
| Mode slider | Off, Major, Minor, Dorian, Phrygian, Lydian, Mixolydian, Locrian, Major/Minor Pentatonic, Minor/Major Blues |
| Key lights | Root **green**, scale notes in the main octave (root upwards) **red**, scale notes elsewhere **blue** |
| SUSTAIN | Hold: notes ring on and decay naturally; release to stop them |
| FIX VEL | Every note at velocity 127 |
| OCT+ / OCT− | Shift ±4 octaves |
| VOL+ / VOL− | Built-in sound level, down to mute (mute it when driving a DAW) |

All voices are synthesized with the Web Audio API (no samples). The Drum Kit maps keys to General MIDI drums 36–59.

**MIDI** (Chrome, Edge, Firefox): "Connect MIDI" lets the page send notes/sustain to a DAW or synth, and receive
notes from a MIDI keyboard so the page works as a sound module. Web MIDI needs a secure context, so use
`localhost`, not a LAN IP.

**Computer keyboard:** `Z`–`M` lower octave, `Q`–`U` upper octave, `Shift` for full velocity, `Space` sustain,
`-`/`=` octave, `[`/`]` volume, `\` fixed velocity.

## Layout

```
src/scale/__init__.py      local static server (`scale` entry point)
src/scale/web/
  index.html, css/style.css
  js/main.js               state, controls, shortcuts, readout
  js/theory.js             scales and the key-light rules
  js/keyboard.js           SVG keyboard and pointer input
  js/slider.js             detented sliders
  js/midi.js               Web MIDI in/out
  js/audio/engine.js       polyphony, sustain, volume, reverb
  js/audio/timbres.js      the 12 voices
  js/audio/drums.js        drum kit
```
