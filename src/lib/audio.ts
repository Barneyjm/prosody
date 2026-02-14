import * as Tone from "tone";
import { parseAllLines, NoteEvent, parseInstrumentPrefix } from "./parser";

const SALAMANDER_BASE_URL =
  "https://tonejs.github.io/audio/salamander/";

// Sparse sample map — Tone.Sampler interpolates between these
const SAMPLE_MAP: Record<string, string> = {
  A0: "A0.mp3",
  C1: "C1.mp3",
  "D#1": "Ds1.mp3",
  "F#1": "Fs1.mp3",
  A1: "A1.mp3",
  C2: "C2.mp3",
  "D#2": "Ds2.mp3",
  "F#2": "Fs2.mp3",
  A2: "A2.mp3",
  C3: "C3.mp3",
  "D#3": "Ds3.mp3",
  "F#3": "Fs3.mp3",
  A3: "A3.mp3",
  C4: "C4.mp3",
  "D#4": "Ds4.mp3",
  "F#4": "Fs4.mp3",
  A4: "A4.mp3",
  C5: "C5.mp3",
  "D#5": "Ds5.mp3",
  "F#5": "Fs5.mp3",
  A5: "A5.mp3",
  C6: "C6.mp3",
  "D#6": "Ds6.mp3",
  "F#6": "Fs6.mp3",
  A6: "A6.mp3",
  C7: "C7.mp3",
  "D#7": "Ds7.mp3",
  "F#7": "Fs7.mp3",
  A7: "A7.mp3",
  C8: "C8.mp3",
};

export type PlaybackState = "stopped" | "started" | "loading";
export type ActiveNoteCallback = (
  lineIndex: number,
  tokenIndex: number
) => void;

// Piano sampler
let sampler: Tone.Sampler | null = null;
let samplerLoaded = false;

// Synth instruments
let synthInst: Tone.PolySynth | null = null;
let bassInst: Tone.MonoSynth | null = null;

// Percussion instruments
let snareInst: Tone.NoiseSynth | null = null;
let kickInst: Tone.MembraneSynth | null = null;
let hihatInst: Tone.MetalSynth | null = null;

let parts: Tone.Part[] = [];
let onActiveNote: ActiveNoteCallback | null = null;

export function setActiveNoteCallback(cb: ActiveNoteCallback | null) {
  onActiveNote = cb;
}

export async function ensureSampler(): Promise<Tone.Sampler> {
  if (sampler && samplerLoaded) return sampler;

  return new Promise((resolve, reject) => {
    sampler = new Tone.Sampler({
      urls: SAMPLE_MAP,
      baseUrl: SALAMANDER_BASE_URL,
      onload: () => {
        samplerLoaded = true;
        resolve(sampler!);
      },
      onerror: (err: Error) => {
        reject(err);
      },
      release: 1,
    }).toDestination();
  });
}

function ensureSynths() {
  if (!synthInst) {
    synthInst = new Tone.PolySynth(Tone.Synth).toDestination();
    synthInst.set({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 },
    });
    synthInst.volume.value = -8;
  }
  if (!bassInst) {
    bassInst = new Tone.MonoSynth({
      oscillator: { type: "sawtooth" },
      filter: { Q: 1, type: "lowpass", rolloff: -24 },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.4 },
      filterEnvelope: {
        attack: 0.01,
        decay: 0.06,
        sustain: 0.5,
        release: 2,
        baseFrequency: 200,
        octaves: 7,
      },
    }).toDestination();
    bassInst.volume.value = -5;
  }
}

function ensurePercussion() {
  if (!snareInst) {
    snareInst = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0 },
    }).toDestination();
    snareInst.volume.value = -10;
  }
  if (!kickInst) {
    kickInst = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 10,
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 },
    }).toDestination();
    kickInst.volume.value = -5;
  }
  if (!hihatInst) {
    hihatInst = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).toDestination();
    hihatInst.frequency.setValueAtTime(200, 0);
    hihatInst.volume.value = -15;
  }
}

export function getSamplerLoadState(): boolean {
  return samplerLoaded;
}

function clearParts() {
  for (const part of parts) {
    part.dispose();
  }
  parts = [];
}

// Detect which instruments are needed in the text (lightweight, no full parse)
function detectInstruments(text: string): Set<string> {
  const instruments = new Set<string>();
  for (const line of text.split("\n")) {
    const { instrument } = parseInstrumentPrefix(line);
    instruments.add(instrument);
  }
  return instruments;
}

function playEvent(ev: NoteEvent, time: number, bpmValue: number) {
  const velocity = ev.soft ? 0.4 : 0.8;
  const durationSeconds = (60 / bpmValue) * ev.duration;

  switch (ev.instrument) {
    case "piano":
      if (sampler) sampler.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
      break;
    case "synth":
      if (synthInst) synthInst.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
      break;
    case "bass":
      if (bassInst) bassInst.triggerAttackRelease(ev.notes[0], durationSeconds, time, velocity);
      break;
    case "snare":
      if (snareInst) snareInst.triggerAttackRelease("16n", time, velocity);
      break;
    case "kick":
      if (kickInst) kickInst.triggerAttackRelease("C1", "8n", time, velocity);
      break;
    case "hihat":
      if (hihatInst) hihatInst.triggerAttackRelease("32n", time, velocity);
      break;
  }
}

export function scheduleMusic(
  text: string,
  loop: boolean
): { maxBeats: number } {
  const transport = Tone.getTransport();
  clearParts();
  transport.cancel();

  const { lines, maxBeats } = parseAllLines(text);

  if (maxBeats === 0) return { maxBeats: 0 };

  // Convert beat duration to Tone.js time notation
  // Each beat = one quarter note ("4n")
  const beatToTime = (beat: number): string => {
    return `0:${beat}:0`;
  };

  for (const line of lines) {
    if (line.events.length === 0) continue;

    const partEvents: { time: string; event: NoteEvent }[] = line.events.map(
      (ev) => ({
        time: beatToTime(ev.beat),
        event: ev,
      })
    );

    const part = new Tone.Part((time, value: { event: NoteEvent }) => {
      const ev = value.event;
      playEvent(ev, time, transport.bpm.value);

      // Schedule visual feedback on the draw loop
      Tone.getDraw().schedule(() => {
        if (onActiveNote) {
          onActiveNote(ev.lineIndex, ev.tokenIndex);
        }
      }, time);
    }, partEvents);

    if (loop) {
      part.loop = true;
      part.loopEnd = beatToTime(maxBeats);
    }

    part.start(0);
    parts.push(part);
  }

  if (loop) {
    transport.loop = true;
    transport.loopStart = 0;
    transport.loopEnd = beatToTime(maxBeats);
  } else {
    transport.loop = false;
  }

  return { maxBeats };
}

export async function startPlayback(
  text: string,
  bpm: number,
  loop: boolean
): Promise<{ maxBeats: number }> {
  await Tone.start();

  // Initialize instruments based on what's in the text
  const instrumentsNeeded = detectInstruments(text);

  if (instrumentsNeeded.has("piano")) {
    await ensureSampler();
  }
  if (instrumentsNeeded.has("synth") || instrumentsNeeded.has("bass")) {
    ensureSynths();
  }
  if (instrumentsNeeded.has("snare") || instrumentsNeeded.has("kick") || instrumentsNeeded.has("hihat")) {
    ensurePercussion();
  }

  const transport = Tone.getTransport();
  transport.bpm.value = bpm;
  transport.position = 0;

  const result = scheduleMusic(text, loop);

  transport.start();
  return result;
}

export function stopPlayback() {
  const transport = Tone.getTransport();
  transport.stop();
  transport.position = 0;
  clearParts();
  transport.cancel();
  if (sampler) {
    sampler.releaseAll();
  }
  if (synthInst) {
    synthInst.releaseAll();
  }
}

export function setBpm(bpm: number) {
  Tone.getTransport().bpm.value = bpm;
}

export function getTransportState(): string {
  return Tone.getTransport().state;
}

export function getTransportPosition(): number {
  return Tone.getTransport().seconds;
}
