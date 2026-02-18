# Prosody — Quick Reference

## Instruments

Prefix any line with an instrument name. Default is `piano` if omitted.

### Pitched

| Prefix | Sound | Notes |
|---|---|---|
| `piano:` | Sampled piano | Polyphonic, range A0–C8 |
| `synth:` | Fat sawtooth | Polyphonic |
| `bass:` | Filtered sawtooth | Monophonic |
| `strings:` | Bowed strings | Polyphonic, slow attack |
| `pad:` | Ambient pad | Polyphonic, very slow attack |
| `pluck:` | Plucked string | Polyphonic, instant attack, decays away |
| `organ:` | Square wave organ | Polyphonic, instant start/stop |
| `lead:` | Lead synth | Monophonic, bright filter |
| `bell:` | Bell / glockenspiel | Polyphonic, long decay |

### Percussion

| Prefix | Sound | Trigger |
|---|---|---|
| `kick:` | Kick drum | `x` |
| `snare:` | Snare drum | `x` |
| `hihat:` | Hi-hat | `x` |
| `clap:` | Hand clap | `x` |
| `tom:` | Tom drum | `x` |
| `cymbal:` | Cymbal / ride | `x` |

## Custom Samples (URL)

Load any remote audio file as a named channel by declaring its URL on a line by itself:

```
# Declare the sample (silent line — just registers the channel)
gong: https://tonejs.github.io/audio/berklee/gong_1.mp3
# Use it like any other instrument
gong: x - - - x - - -
```

The declaration line is silent — it just registers the sample. Subsequent lines with the same name play the sample.

- Trigger with `x` for percussion-style playback
- Use note names to pitch-shift the sample relative to C4 base pitch
- Any audio format the browser supports works (MP3, WAV, OGG, FLAC…)
- The channel appears in the mixer (orange faders) once it's declared

### Free sample library (Tone.js CDN)

These are all publicly hosted and work without sign-up:

**Drum kits** — CR78, KPR77, R8, Techno, LINN, Stark, Kit3, Kit8…
```
kick: https://tonejs.github.io/audio/drum-samples/CR78/kick.mp3
snare: https://tonejs.github.io/audio/drum-samples/CR78/snare.mp3
hihat: https://tonejs.github.io/audio/drum-samples/CR78/hihat.mp3
tom1: https://tonejs.github.io/audio/drum-samples/CR78/tom1.mp3
```

**Berklee sound library** (800+ MP3s: percussion, voice, SFX…)
```
gong: https://tonejs.github.io/audio/berklee/gong_1.mp3
chime: https://tonejs.github.io/audio/berklee/chime_1.mp3
```

Full list: `https://github.com/Tonejs/audio`

## Notes

Each space-separated token is **one beat** (quarter note at your BPM).

```
C4          → middle C, normal volume
D#5         → D sharp, octave 5
Ab3         → A flat, octave 3
c4          → middle C, soft (lowercase = 40% velocity)
C4          → middle C, loud (uppercase = 80% velocity)
```

Octave is optional — defaults to 4 if omitted. Range: 0–8.

## Rests

```
-           → silence for one beat
_           → same thing, alternate style
```

## Chords

Square brackets group notes that play simultaneously:

```
[C4 E4 G4]      → C major chord
[A3 C4 E4]      → A minor chord
```

## Dotted Notes (1.5 beats)

Add `.` after a note to extend it to 1.5 beats:

```
C4.         → plays for 1.5 beats instead of 1
[C4. E4 G4] → whole chord lasts 1.5 beats
```

## Tied Notes (sustain across beats)

Add `~` to hold a note across multiple beats:

```
C4~ ~ ~     → C4 held for 3 beats total
E4~ ~       → E4 held for 2 beats
```

Each `~` continuation adds one more beat of duration.

## Percussion

Use `x` or `X` on drum lines:

```
kick:  x - x - x - x -
snare: - - x - - - x -
hihat: x x x x x x x x
```

## Putting It Together

Each line is one instrument. Lines play in parallel. Spaces align beats across lines.

```
piano: [C4 E4 G4] - [F4 A4 C5] - [G4 B4 D5] - [C4 E4 G4] -
synth: c5 - e5 - f5 - g5. -
bass:  C2 C2 C3 C2 F2 F2 G2 G2
kick:  x - x - x - x -
snare: - - x - - - x -
hihat: x x x x x x x x
```

## YAML Format

For longer compositions, use YAML to define reusable sections and arrange them into a song:

```yaml
bpm: 120

volumes:
  bass: -5
  hihat: -3

instruments:
  synth:
    oscillator: triangle
    attack: 0.05
    release: 1.5
  bass:
    oscillator: square
    filter: 300

sections:
  verse:
    piano: "[C4 E4 G4] - [F4 A4 C5] -"
    bass: "C2 - F2 -"
    kick: "x - x -"

  chorus:
    piano: "[G4 B4 D5] - [C4 E4 G4] -"
    synth: "G5 E5 C5 G4"
    bass: "G2 - C2 -"
    kick: "x - x -"
    snare: "- - x -"

song:
  - verse
  - verse
  - chorus
  - verse
  - chorus x3
```

### YAML Keys

| Key | Description |
|---|---|
| `bpm` | Tempo (overrides the BPM slider) |
| `volumes` | Per-instrument volume offsets in dB (e.g. `bass: -5`) |
| `instruments` | Per-instrument synth parameters (see below) |
| `samples` | URL-based sample channels (see below) |
| `sections` | Named groups of instrument lines |
| `song` | Ordered list of section names to play |

### Custom Samples in YAML

Declare URL-based sample channels under `samples:`, then use them as instrument lines in your sections:

```yaml
samples:
  gong: https://tonejs.github.io/audio/berklee/gong_1.mp3
  kick: https://tonejs.github.io/audio/drum-samples/CR78/kick.mp3

sections:
  verse:
    gong: "x - - - - - - -"
    kick: "x - x - x - x -"
```

### Instrument Parameters

Under the `instruments` key you can configure per-instrument synthesis:

```yaml
instruments:
  synth:
    oscillator: fatsawtooth  # sine, triangle, square, sawtooth, fatsawtooth, etc.
    attack: 0.03             # seconds
    decay: 0.2
    sustain: 0.4             # 0–1
    release: 1.2             # seconds
  bass:
    oscillator: square
    filter: 200              # lowpass cutoff in Hz
    filterQ: 3               # filter resonance
    attack: 0.01
    sustain: 0.7
```

### Repeats

Append `x3` (or `*3`, `X3`) to repeat a section multiple times:

```yaml
song:
  - intro
  - verse x2
  - chorus x4
  - outro
```

## Mixer

Click the mixer icon (sliders) in the transport bar to reveal per-instrument volume controls. The mixer only shows channels that are active in the current composition. Each slider adjusts volume in dB relative to the default mix.

URL-based custom sample channels appear highlighted in orange.

## Tips

- **Dynamics**: Alternate `c4` (soft) and `C4` (loud) for crescendo/decrescendo effects
- **Multiple lines per instrument**: You can have two `piano:` lines for melody + chords separately
- **Bass is mono**: Only the first note plays if you write a chord on a `bass:` line
- **Sharps/flats**: Use `#` for sharp, `b` for flat — `F#4`, `Bb3`, `Eb5`
- **BPM range**: 40–240, adjustable in the transport bar
- **Keyboard shortcut**: Ctrl+Enter (or Cmd+Enter) to play/stop
- **Slow instruments**: `strings:` and `pad:` have slow attacks — leave sustain time so notes bloom
- **Bell arpeggios**: `bell:` with no sustain creates natural decay; great for melodic patterns
- **YAML format**: Use `sections:` and `song:` for verse/chorus structure with repeats
