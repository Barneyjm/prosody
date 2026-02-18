export interface Example {
  name: string;
  bpm: number;
  text: string;
  yaml?: boolean; // true if this example uses YAML format
}

export const EXAMPLES: Example[] = [
  {
    name: "Simple Arpeggio",
    bpm: 120,
    text: `piano: C4 E4 G4 C5 G4 E4 C4 -
bass: C2 - - C2 - - E2 -
kick: x - x - x - x -
hihat: x x x x x x x x`,
  },
  {
    name: "Chord Progression",
    bpm: 90,
    text: `piano: [C4 E4 G4] - [F4 A4 C5] - [G4 B4 D5] - [C4 E4 G4] -
synth: C5 E5 F5 A5 G5 B5 C6 -
bass: C2 - F2 - G2 - C2 -
kick: x - x - x - x -
snare: - - x - - - x -
hihat: x x x x x x x x`,
  },
  {
    name: "Synth Lead",
    bpm: 130,
    text: `synth: E5 E5 - E5 - C5 E5 - G5 - - - G4 - - -
bass: C2 - - C3 C2 - - C3 G1 - - G2 G1 - - G2
kick: x - x - x - x - x - x - x - x -
snare: - - - - x - - - - - - - x - - -
hihat: x x x x x x x x x x x x x x x x`,
  },
  {
    name: "Soft Ballad",
    bpm: 72,
    text: `piano: [c4 e4 g4] - [c4 e4 g4] - [f4 a4 c5] - [f4 a4 c5] -
piano: e5 d5 c5 - g4 a4 g4 -
synth: c3 - g3 - f3 - c3 -
kick: x - - - x - - -
hihat: - x - x - x - x`,
  },
  {
    name: "Dotted Rhythm",
    bpm: 110,
    text: `piano: C4. E4 G4. C5 E5. G4 C4. -
synth: G5. E5 C5. G4 E4. C4 G3. -
bass: C2 - - C2 - - G1 -
kick: x - - x - - x -
snare: - - x - - x - -
hihat: x x x x x x x x`,
  },
  {
    name: "Tied Notes",
    bpm: 100,
    text: `piano: C4~ ~ E4 G4 C4~ ~ ~ G3
synth: G5~ ~ ~ - E5~ ~ ~ -
bass: C2~ ~ ~ ~ G1~ ~ ~ ~
kick: x - - - x - - -
snare: - - x - - - x -`,
  },
  {
    name: "Percussion Only",
    bpm: 140,
    text: `kick: x - - x - - x - x - - x - - x -
snare: - - x - - - x - - - x - - - x -
hihat: x x x x x x x x x x x x x x x x
kick: - - x - x - - - - - x - x - - -
snare: x - - - - - - x x - - - - - - x`,
  },
  {
    name: "Minor Key",
    bpm: 95,
    text: `piano: [A3 C4 E4] - [D4 F4 A4] - [E4 G#4 B4] - [A3 C4 E4] -
synth: A4 B4 C5 E5 D5 C5 B4 A4
bass: A1 - D2 - E2 - A1 -
kick: x - x - x - x -
snare: - - - - x - - -
hihat: x - x x x - x x`,
  },
  {
    name: "Velocity Dynamics",
    bpm: 108,
    text: `piano: c4 c4 C4 C4 c4 c4 C4 C4
piano: [c4 e4 g4] [c4 e4 g4] [C4 E4 G4] [C4 E4 G4] [c4 e4 g4] [c4 e4 g4] [C4 E4 G4] [C4 E4 G4]
synth: e5 e5 E5 E5 g5 g5 G5 G5
bass: C2 - C2 - C2 - C2 -
kick: x - x - x - x -
hihat: x x x x x x x x`,
  },
  {
    name: "Full Band",
    bpm: 120,
    text: `piano: [C4 E4 G4] - [C4 E4 G4] - [F4 A4 C5] - [G4 B4 D5] -
piano: E5 D5 C5 G4 A4 G4 F4 E4
synth: c5 - e5 - f5 - g5. -
bass: C2 C2 C3 C2 F2 F2 G2 G2
kick: x - x - x - x -
snare: - - x - - - x -
hihat: x x x x x x x x`,
  },
  {
    name: "808 Drum Samples",
    bpm: 95,
    text: `kick808: https://tonejs.github.io/audio/drum-samples/CR78/kick.mp3
snare808: https://tonejs.github.io/audio/drum-samples/CR78/snare.mp3
hat808: https://tonejs.github.io/audio/drum-samples/CR78/hihat.mp3
gong: https://tonejs.github.io/audio/berklee/gong_1.mp3

kick808: x - - x - - x -
snare808: - - x - - - x -
hat808: x x x x x x x x
gong: x - - - - - - -
bass: C2 - - C2 G1 - - G1
pluck: C4 E4 G4 E4 C4 G4 E4 C4`,
  },
  {
    name: "Strings & Pluck",
    bpm: 88,
    text: `strings: [C4 E4 G4] - [A3 C4 E4] - [F3 A3 C4] - [G3 B3 D4] -
pad: C3 - A2 - F2 - G2 -
pluck: C5 E5 G5 E5 A4 C5 E5 C5
pluck: F4 A4 C5 A4 G4 B4 D5 B4
bass: C2 - A1 - F1 - G1 -
kick: x - - - x - - -
tom: - - x - - - x -
clap: - - x - - - x -
hihat: x x x x x x x x`,
  },
  {
    name: "Organ & Lead",
    bpm: 100,
    text: `organ: [C4 E4 G4 B4] - - - [F4 A4 C5 E5] - - -
lead: E5 D5 C5 B4 A4 G4 F4 E4
lead: C5~ ~ E5 G5 F5~ ~ - -
bass: C2 - G1 - F1 - G1 -
kick: x - x - x - x -
snare: - - x - - - x -
cymbal: x - - - x - - -
hihat: x x x x x x x x`,
  },
  {
    name: "Bell Garden",
    bpm: 76,
    text: `bell: C5 - E5 - G5 - E5 -
bell: G4 - B4 - D5 - B4 -
bell: E4 - G4 - C5 - G4 -
pad: [C3 E3 G3] - - - [G2 B2 D3] - - -
strings: C4~ ~ ~ ~ G3~ ~ ~ ~
pluck: c5 e5 g5 c6 b4 d5 g4 b4`,
  },
  {
    name: "YAML Song (Verse/Chorus)",
    bpm: 210,
    yaml: true,
    text: `bpm: 210

volumes:
  bass: -3
  hihat: -4

instruments:
  synth:
    oscillator: triangle
    attack: 0.05
    release: 1.5
  bass:
    filter: 200

sections:
  verse:
    piano: "[C4 E4 G4] - [C4 E4 G4] - [F4 A4 C5] - [F4 A4 C5] -"
    synth: "E5 D5 C5 - G4 A4 G4 -"
    bass: "C2 - C2 - F2 - F2 -"
    kick: "x - x - x - x -"
    hihat: "x x x x x x x x"

  chorus:
    piano: "[G4 B4 D5] - [G4 B4 D5] - [C4 E4 G4] - [C4 E4 G4] -"
    synth: "G5 A5 B5 G5 E5 D5 C5 -"
    bass: "G2 G2 G2 G2 C2 C2 C2 C2"
    kick: "x - x - x - x -"
    snare: "- - x - - - x -"
    hihat: "x x x x x x x x"

  bridge:
    piano: "[A3 C4 E4] - [D4 F4 A4] - [E4 G#4 B4] - [A3 C4 E4] -"
    synth: "A4 B4 C5 E5 D5 C5 B4 A4"
    bass: "A1 - D2 - E2 - A1 -"
    kick: "x - x - x - x -"
    snare: "- - - - x - - -"

song:
  - verse
  - verse
  - chorus
  - verse
  - chorus
  - bridge
  - chorus x2`,
  },
];
