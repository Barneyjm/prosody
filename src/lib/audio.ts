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
let hihatInst: Tone.NoiseSynth | null = null;

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
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0.02, release: 0.1 },
    }).toDestination();
    snareInst.volume.value = -6;
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
    hihatInst = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
    }).toDestination();
    hihatInst.volume.value = -8;
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
      if (snareInst) snareInst.triggerAttackRelease("8n", time, velocity);
      break;
    case "kick":
      if (kickInst) kickInst.triggerAttackRelease("C1", "8n", time, velocity);
      break;
    case "hihat":
      if (hihatInst) hihatInst.triggerAttackRelease("16n", time, velocity);
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
  if (bassInst) {
    bassInst.triggerRelease();
  }
  if (snareInst) {
    snareInst.triggerRelease();
  }
  if (kickInst) {
    kickInst.triggerRelease();
  }
  if (hihatInst) {
    hihatInst.triggerRelease();
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

// --- Offline rendering & WAV export ---

interface OfflineInstruments {
  sampler: Tone.Sampler | null;
  synth: Tone.PolySynth | null;
  bass: Tone.MonoSynth | null;
  snare: Tone.NoiseSynth | null;
  kick: Tone.MembraneSynth | null;
  hihat: Tone.NoiseSynth | null;
}

function playEventOffline(
  ev: NoteEvent,
  time: number,
  bpmValue: number,
  inst: OfflineInstruments
) {
  const velocity = ev.soft ? 0.4 : 0.8;
  const durationSeconds = (60 / bpmValue) * ev.duration;

  switch (ev.instrument) {
    case "piano":
      inst.sampler?.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
      break;
    case "synth":
      inst.synth?.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
      break;
    case "bass":
      inst.bass?.triggerAttackRelease(ev.notes[0], durationSeconds, time, velocity);
      break;
    case "snare":
      inst.snare?.triggerAttackRelease("8n", time, velocity);
      break;
    case "kick":
      inst.kick?.triggerAttackRelease("C1", "8n", time, velocity);
      break;
    case "hihat":
      inst.hihat?.triggerAttackRelease("16n", time, velocity);
      break;
  }
}

export async function renderOffline(text: string, bpm: number): Promise<Blob> {
  const { lines, maxBeats } = parseAllLines(text);
  if (maxBeats === 0) throw new Error("Nothing to render");

  const durationSeconds = (maxBeats * 60) / bpm + 0.5; // brief tail for release envelopes
  const instrumentsNeeded = detectInstruments(text);

  const buffer = await Tone.Offline(async ({ transport }) => {
    const inst: OfflineInstruments = {
      sampler: null,
      synth: null,
      bass: null,
      snare: null,
      kick: null,
      hihat: null,
    };

    // Create instruments within the offline context
    if (instrumentsNeeded.has("piano")) {
      inst.sampler = await new Promise<Tone.Sampler>((resolve, reject) => {
        const s = new Tone.Sampler({
          urls: SAMPLE_MAP,
          baseUrl: SALAMANDER_BASE_URL,
          onload: () => resolve(s),
          onerror: (err: Error) => reject(err),
          release: 1,
        }).toDestination();
      });
    }

    if (instrumentsNeeded.has("synth")) {
      inst.synth = new Tone.PolySynth(Tone.Synth).toDestination();
      inst.synth.set({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 },
      });
      inst.synth.volume.value = -8;
    }

    if (instrumentsNeeded.has("bass")) {
      inst.bass = new Tone.MonoSynth({
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
      inst.bass.volume.value = -5;
    }

    if (instrumentsNeeded.has("snare")) {
      inst.snare = new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.001, decay: 0.15, sustain: 0.02, release: 0.1 },
      }).toDestination();
      inst.snare.volume.value = -6;
    }

    if (instrumentsNeeded.has("kick")) {
      inst.kick = new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 10,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 },
      }).toDestination();
      inst.kick.volume.value = -5;
    }

    if (instrumentsNeeded.has("hihat")) {
      inst.hihat = new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
      }).toDestination();
      inst.hihat.volume.value = -8;
    }

    // Schedule all events on the offline transport
    transport.bpm.value = bpm;

    for (const line of lines) {
      for (const ev of line.events) {
        const beatTime = `0:${ev.beat}:0`;
        transport.schedule((time) => {
          playEventOffline(ev, time, bpm, inst);
        }, beatTime);
      }
    }

    transport.start();
  }, durationSeconds);

  return audioBufferToWav(buffer.get() as AudioBuffer);
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const length = buffer.length * numChannels;

  // Interleave channels
  const interleaved = new Float32Array(length);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < buffer.length; i++) {
      interleaved[i * numChannels + ch] = channelData[i];
    }
  }

  const dataLength = length * (bitsPerSample / 8);
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < interleaved.length; i++) {
    const sample = Math.max(-1, Math.min(1, interleaved[i]));
    view.setInt16(
      offset,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true
    );
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
