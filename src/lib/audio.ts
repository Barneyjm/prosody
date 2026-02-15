import * as Tone from "tone";
import { parseAllLines, NoteEvent, parseInstrumentPrefix } from "./parser";
import type { InstrumentConfig } from "./yaml-parser";

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

// Default instrument volumes in dB (balanced mix)
const DEFAULT_INSTRUMENT_DB: Record<string, number> = {
  piano: -8,
  synth: -8,
  bass: -12,
  kick: -6,
  snare: -7,
  hihat: -10,
};

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

// Per-instrument gain nodes for volume control
let instrumentGains: Record<string, Tone.Gain> = {};

// Effects chain — shared bus
let reverb: Tone.Reverb | null = null;
let chorus: Tone.Chorus | null = null;
let compressor: Tone.Compressor | null = null;
let effectsReady = false;

let parts: Tone.Part[] = [];
let onActiveNote: ActiveNoteCallback | null = null;

// User volume offsets (dB, from UI sliders — 0 = default)
let userVolumeOffsets: Record<string, number> = {};

// YAML instrument config overrides
let instrumentConfigs: Record<string, InstrumentConfig> = {};

export function setActiveNoteCallback(cb: ActiveNoteCallback | null) {
  onActiveNote = cb;
}

function ensureEffects() {
  if (effectsReady) return;

  // Master compressor to glue the mix
  compressor = new Tone.Compressor({
    threshold: -18,
    ratio: 3,
    attack: 0.01,
    release: 0.15,
  }).toDestination();

  // Convolution-style reverb for depth
  reverb = new Tone.Reverb({
    decay: 2.2,
    wet: 0.18,
    preDelay: 0.01,
  }).connect(compressor);

  // Subtle chorus for warmth
  chorus = new Tone.Chorus({
    frequency: 1.5,
    delayTime: 3.5,
    depth: 0.4,
    wet: 0.15,
    spread: 180,
  }).connect(reverb);
  chorus.start();

  effectsReady = true;
}

function getInstrumentGain(name: string): Tone.Gain {
  if (instrumentGains[name]) return instrumentGains[name];

  ensureEffects();

  const gain = new Tone.Gain(1).connect(chorus!);
  instrumentGains[name] = gain;
  return gain;
}

function applyVolume(name: string, inst: { volume: { value: number } }) {
  const base = DEFAULT_INSTRUMENT_DB[name] ?? -8;
  const offset = userVolumeOffsets[name] ?? 0;
  inst.volume.value = base + offset;
}

export function setInstrumentVolume(instrument: string, offsetDb: number) {
  userVolumeOffsets[instrument] = offsetDb;

  // Apply in real time to live instruments
  const instMap: Record<string, { volume: { value: number } } | null> = {
    piano: sampler,
    synth: synthInst,
    bass: bassInst,
    kick: kickInst,
    snare: snareInst,
    hihat: hihatInst,
  };
  const inst = instMap[instrument];
  if (inst) applyVolume(instrument, inst);
}

export async function ensureSampler(): Promise<Tone.Sampler> {
  if (sampler && samplerLoaded) return sampler;

  const gain = getInstrumentGain("piano");

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
    }).connect(gain);
    applyVolume("piano", sampler!);
  });
}

/** Build oscillator options from a config string like "fatsawtooth" or "triangle" */
function oscType(name: string, cfg?: InstrumentConfig, defaults?: { type: string; count?: number; spread?: number }) {
  const d = defaults ?? { type: "fatsawtooth" };
  const type = cfg?.oscillator ?? d.type;
  // "fat" oscillator types support count/spread
  if (type.startsWith("fat")) {
    return { type, count: d.count ?? 3, spread: d.spread ?? 20 } as unknown as Tone.OmniOscillatorOptions;
  }
  return { type } as unknown as Tone.OmniOscillatorOptions;
}

function ensureSynths() {
  if (!synthInst) {
    const gain = getInstrumentGain("synth");
    const cfg = instrumentConfigs["synth"];
    synthInst = new Tone.PolySynth(Tone.Synth).connect(gain);
    synthInst.set({
      oscillator: oscType("synth", cfg, { type: "fatsawtooth", count: 3, spread: 20 }),
      envelope: {
        attack: cfg?.attack ?? 0.03,
        decay: cfg?.decay ?? 0.2,
        sustain: cfg?.sustain ?? 0.4,
        release: cfg?.release ?? 1.2,
      },
    });
    applyVolume("synth", synthInst);
  }
  if (!bassInst) {
    const gain = getInstrumentGain("bass");
    const cfg = instrumentConfigs["bass"];
    const filterFreq = cfg?.filter ?? 120;
    const filterQ = cfg?.filterQ ?? 2;
    bassInst = new Tone.MonoSynth({
      oscillator: oscType("bass", cfg, { type: "fatsawtooth", count: 2, spread: 10 }),
      filter: { Q: filterQ, type: "lowpass", rolloff: -24 },
      envelope: {
        attack: cfg?.attack ?? 0.01,
        decay: cfg?.decay ?? 0.15,
        sustain: cfg?.sustain ?? 0.7,
        release: cfg?.release ?? 0.3,
      },
      filterEnvelope: {
        attack: 0.01,
        decay: 0.1,
        sustain: 0.3,
        release: 1.5,
        baseFrequency: filterFreq,
        octaves: 3.5,
      },
    }).connect(gain);
    applyVolume("bass", bassInst);
  }
}

function ensurePercussion() {
  if (!snareInst) {
    const gain = getInstrumentGain("snare");
    snareInst = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.18, sustain: 0.02, release: 0.12 },
    }).connect(gain);
    applyVolume("snare", snareInst);
  }
  if (!kickInst) {
    const gain = getInstrumentGain("kick");
    kickInst = new Tone.MembraneSynth({
      pitchDecay: 0.06,
      octaves: 8,
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.5, sustain: 0.01, release: 1.0 },
    }).connect(gain);
    applyVolume("kick", kickInst);
  }
  if (!hihatInst) {
    const gain = getInstrumentGain("hihat");
    hihatInst = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.06, sustain: 0 },
    }).connect(gain);
    applyVolume("hihat", hihatInst);
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

/** Dispose synths so they're re-created with fresh configs */
function disposeSynths() {
  if (synthInst) { synthInst.dispose(); synthInst = null; }
  if (bassInst) { bassInst.dispose(); bassInst = null; }
}

export async function startPlayback(
  text: string,
  bpm: number,
  loop: boolean,
  volumeOffsets?: Record<string, number>,
  instConfigs?: Record<string, InstrumentConfig>
): Promise<{ maxBeats: number }> {
  await Tone.start();

  // Apply user volume offsets
  if (volumeOffsets) {
    userVolumeOffsets = { ...volumeOffsets };
  }

  // Apply instrument configs — dispose old synths so they're rebuilt
  const newConfigs = instConfigs ?? {};
  if (JSON.stringify(newConfigs) !== JSON.stringify(instrumentConfigs)) {
    instrumentConfigs = newConfigs;
    disposeSynths();
  }

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

export async function renderOffline(
  text: string,
  bpm: number,
  volumeOffsets?: Record<string, number>,
  instConfigs?: Record<string, InstrumentConfig>
): Promise<Blob> {
  const { lines, maxBeats } = parseAllLines(text);
  if (maxBeats === 0) throw new Error("Nothing to render");

  const offsets = volumeOffsets ?? userVolumeOffsets;
  const configs = instConfigs ?? instrumentConfigs;
  const durationSeconds = (maxBeats * 60) / bpm + 0.5; // brief tail for release envelopes
  const instrumentsNeeded = detectInstruments(text);

  const buffer = await Tone.Offline(async ({ transport }) => {
    // Create effects chain inside offline context
    const offComp = new Tone.Compressor({
      threshold: -18,
      ratio: 3,
      attack: 0.01,
      release: 0.15,
    }).toDestination();

    const offReverb = new Tone.Reverb({
      decay: 2.2,
      wet: 0.18,
      preDelay: 0.01,
    }).connect(offComp);

    const offChorus = new Tone.Chorus({
      frequency: 1.5,
      delayTime: 3.5,
      depth: 0.4,
      wet: 0.15,
      spread: 180,
    }).connect(offReverb);
    offChorus.start();

    const getGain = (name: string) => {
      const g = new Tone.Gain(1).connect(offChorus);
      return g;
    };

    const applyVol = (name: string, inst: { volume: { value: number } }) => {
      const base = DEFAULT_INSTRUMENT_DB[name] ?? -8;
      const offset = offsets[name] ?? 0;
      inst.volume.value = base + offset;
    };

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
        }).connect(getGain("piano"));
        applyVol("piano", s);
      });
    }

    if (instrumentsNeeded.has("synth")) {
      const cfg = configs["synth"];
      inst.synth = new Tone.PolySynth(Tone.Synth).connect(getGain("synth"));
      inst.synth.set({
        oscillator: oscType("synth", cfg, { type: "fatsawtooth", count: 3, spread: 20 }),
        envelope: {
          attack: cfg?.attack ?? 0.03,
          decay: cfg?.decay ?? 0.2,
          sustain: cfg?.sustain ?? 0.4,
          release: cfg?.release ?? 1.2,
        },
      });
      applyVol("synth", inst.synth);
    }

    if (instrumentsNeeded.has("bass")) {
      const cfg = configs["bass"];
      const filterFreq = cfg?.filter ?? 120;
      const filterQ = cfg?.filterQ ?? 2;
      inst.bass = new Tone.MonoSynth({
        oscillator: oscType("bass", cfg, { type: "fatsawtooth", count: 2, spread: 10 }),
        filter: { Q: filterQ, type: "lowpass", rolloff: -24 },
        envelope: {
          attack: cfg?.attack ?? 0.01,
          decay: cfg?.decay ?? 0.15,
          sustain: cfg?.sustain ?? 0.7,
          release: cfg?.release ?? 0.3,
        },
        filterEnvelope: {
          attack: 0.01,
          decay: 0.1,
          sustain: 0.3,
          release: 1.5,
          baseFrequency: filterFreq,
          octaves: 3.5,
        },
      }).connect(getGain("bass"));
      applyVol("bass", inst.bass);
    }

    if (instrumentsNeeded.has("snare")) {
      inst.snare = new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.001, decay: 0.18, sustain: 0.02, release: 0.12 },
      }).connect(getGain("snare"));
      applyVol("snare", inst.snare);
    }

    if (instrumentsNeeded.has("kick")) {
      inst.kick = new Tone.MembraneSynth({
        pitchDecay: 0.06,
        octaves: 8,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.5, sustain: 0.01, release: 1.0 },
      }).connect(getGain("kick"));
      applyVol("kick", inst.kick);
    }

    if (instrumentsNeeded.has("hihat")) {
      inst.hihat = new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.06, sustain: 0 },
      }).connect(getGain("hihat"));
      applyVol("hihat", inst.hihat);
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
