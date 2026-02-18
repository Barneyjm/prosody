import * as Tone from "tone";
import { parseAllLines, NoteEvent, parseInstrumentPrefix, parseSampleDeclarations, registerCustomInstrument, unregisterCustomInstrument } from "./parser";
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
  piano:   -8,
  synth:   -8,
  bass:    -12,
  strings: -10,
  pad:     -13,
  pluck:   -9,
  organ:   -10,
  lead:    -10,
  bell:    -13,
  kick:    -6,
  snare:   -7,
  hihat:   -10,
  clap:    -8,
  tom:     -7,
  cymbal:  -14,
};

// Piano sampler
let sampler: Tone.Sampler | null = null;
let samplerLoaded = false;

// Synth instruments
let synthInst: Tone.PolySynth | null = null;
let bassInst: Tone.MonoSynth | null = null;
let stringsInst: Tone.PolySynth | null = null;
let padInst: Tone.PolySynth | null = null;
let pluckInst: Tone.PolySynth | null = null;
let organInst: Tone.PolySynth | null = null;
let leadInst: Tone.PolySynth | null = null;
let bellInst: Tone.PolySynth | null = null;

// Percussion instruments
let snareInst: Tone.NoiseSynth | null = null;
let kickInst: Tone.MembraneSynth | null = null;
let hihatInst: Tone.NoiseSynth | null = null;
let clapInst: Tone.NoiseSynth | null = null;
let tomInst: Tone.MembraneSynth | null = null;
let cymbalInst: Tone.MetalSynth | null = null;

// URL-based sample players: name → { url, player }
const urlSampleRegistry: Record<string, { url: string; player: Tone.Player }> = {};

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
    piano:   sampler,
    synth:   synthInst,
    bass:    bassInst,
    strings: stringsInst,
    pad:     padInst,
    pluck:   pluckInst,
    organ:   organInst,
    lead:    leadInst,
    bell:    bellInst,
    kick:    kickInst,
    snare:   snareInst,
    hihat:   hihatInst,
    clap:    clapInst,
    tom:     tomInst,
    cymbal:  cymbalInst,
  };
  const inst = instMap[instrument] ?? urlSampleRegistry[instrument]?.player ?? null;
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

function ensureExtendedSynths() {
  if (!stringsInst) {
    const gain = getInstrumentGain("strings");
    const cfg = instrumentConfigs["strings"];
    stringsInst = new Tone.PolySynth(Tone.Synth).connect(gain);
    stringsInst.set({
      oscillator: oscType("strings", cfg, { type: "sawtooth" }),
      envelope: {
        attack: cfg?.attack ?? 0.4,
        decay: cfg?.decay ?? 0.1,
        sustain: cfg?.sustain ?? 0.7,
        release: cfg?.release ?? 1.5,
      },
    });
    applyVolume("strings", stringsInst);
  }
  if (!padInst) {
    const gain = getInstrumentGain("pad");
    const cfg = instrumentConfigs["pad"];
    padInst = new Tone.PolySynth(Tone.Synth).connect(gain);
    padInst.set({
      oscillator: oscType("pad", cfg, { type: "triangle" }),
      envelope: {
        attack: cfg?.attack ?? 0.5,
        decay: cfg?.decay ?? 0.2,
        sustain: cfg?.sustain ?? 0.6,
        release: cfg?.release ?? 2.0,
      },
    });
    applyVolume("pad", padInst);
  }
  if (!pluckInst) {
    const gain = getInstrumentGain("pluck");
    const cfg = instrumentConfigs["pluck"];
    pluckInst = new Tone.PolySynth(Tone.Synth).connect(gain);
    pluckInst.set({
      oscillator: oscType("pluck", cfg, { type: "triangle" }),
      envelope: {
        attack: cfg?.attack ?? 0.001,
        decay: cfg?.decay ?? 0.4,
        sustain: cfg?.sustain ?? 0.0,
        release: cfg?.release ?? 0.5,
      },
    });
    applyVolume("pluck", pluckInst);
  }
  if (!organInst) {
    const gain = getInstrumentGain("organ");
    const cfg = instrumentConfigs["organ"];
    organInst = new Tone.PolySynth(Tone.Synth).connect(gain);
    organInst.set({
      oscillator: oscType("organ", cfg, { type: "square" }),
      envelope: {
        attack: cfg?.attack ?? 0.01,
        decay: cfg?.decay ?? 0.01,
        sustain: cfg?.sustain ?? 0.9,
        release: cfg?.release ?? 0.05,
      },
    });
    applyVolume("organ", organInst);
  }
  if (!leadInst) {
    const gain = getInstrumentGain("lead");
    const cfg = instrumentConfigs["lead"];
    leadInst = new Tone.PolySynth(Tone.Synth).connect(gain);
    leadInst.set({
      oscillator: oscType("lead", cfg, { type: "sawtooth" }),
      envelope: {
        attack: cfg?.attack ?? 0.01,
        decay: cfg?.decay ?? 0.1,
        sustain: cfg?.sustain ?? 0.8,
        release: cfg?.release ?? 0.3,
      },
    });
    applyVolume("lead", leadInst);
  }
  if (!bellInst) {
    const gain = getInstrumentGain("bell");
    const cfg = instrumentConfigs["bell"];
    bellInst = new Tone.PolySynth(Tone.Synth).connect(gain);
    bellInst.set({
      oscillator: oscType("bell", cfg, { type: "sine" }),
      envelope: {
        attack: cfg?.attack ?? 0.001,
        decay: cfg?.decay ?? 1.5,
        sustain: cfg?.sustain ?? 0.0,
        release: cfg?.release ?? 0.5,
      },
    });
    applyVolume("bell", bellInst);
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
  if (!clapInst) {
    const gain = getInstrumentGain("clap");
    clapInst = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0.0, release: 0.05 },
    }).connect(gain);
    applyVolume("clap", clapInst);
  }
  if (!tomInst) {
    const gain = getInstrumentGain("tom");
    tomInst = new Tone.MembraneSynth({
      pitchDecay: 0.1,
      octaves: 4,
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.5 },
    }).connect(gain);
    applyVolume("tom", tomInst);
  }
  if (!cymbalInst) {
    const gain = getInstrumentGain("cymbal");
    cymbalInst = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.4, release: 0.2 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).connect(gain);
    cymbalInst.frequency.value = 400;
    applyVolume("cymbal", cymbalInst);
  }
}

export function getSamplerLoadState(): boolean {
  return samplerLoaded;
}

// --- URL-based sample management ---

/**
 * Load samples declared in text as URL lines (e.g. "drum: https://...").
 * Already-loaded samples with the same URL are skipped.
 * Channels whose URL changed are re-loaded.
 */
/**
 * Loads URL-declared sample channels from the text.
 * Returns names of any channels that failed to load so the caller can warn the user.
 */
export async function loadUrlSamples(text: string): Promise<string[]> {
  const declarations = parseSampleDeclarations(text);

  // Purge channels whose URL was removed from the text
  const activeNames = new Set(declarations.map((d) => d.name));
  for (const name of Object.keys(urlSampleRegistry)) {
    if (!activeNames.has(name)) {
      urlSampleRegistry[name].player.dispose();
      delete urlSampleRegistry[name];
      unregisterCustomInstrument(name);
      if (instrumentGains[name]) {
        instrumentGains[name].dispose();
        delete instrumentGains[name];
      }
    }
  }

  if (declarations.length === 0) return [];

  const loaders: Promise<{ name: string; ok: boolean }>[] = [];

  for (const { name, url } of declarations) {
    if (urlSampleRegistry[name]?.url === url) continue; // already loaded

    // Dispose stale player if URL changed
    if (urlSampleRegistry[name]) {
      urlSampleRegistry[name].player.dispose();
      delete urlSampleRegistry[name];
    }

    registerCustomInstrument(name, "percussion");
    if (!(name in DEFAULT_INSTRUMENT_DB)) {
      (DEFAULT_INSTRUMENT_DB as Record<string, number>)[name] = -8;
    }

    const gain = getInstrumentGain(name);

    loaders.push(
      new Promise<{ name: string; ok: boolean }>((resolve) => {
        const player = new Tone.Player({
          url,
          onload: () => {
            urlSampleRegistry[name] = { url, player };
            applyVolume(name, player);
            resolve({ name, ok: true });
          },
          onerror: (err: Error) => {
            console.warn(`[prosody] Failed to load sample "${name}" from ${url}:`, err);
            resolve({ name, ok: false });
          },
        }).connect(gain);
      })
    );
  }

  const results = await Promise.all(loaders);
  return results.filter((r) => !r.ok).map((r) => r.name);
}

export function getUrlSampleNames(): string[] {
  return Object.keys(urlSampleRegistry);
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

/** Pitch-shift a Tone.Player relative to C4 and start it at the given time. */
function triggerSamplePlayer(player: Tone.Player, note: string | undefined, time: number): void {
  if (note && note !== "C4") {
    const semitones = Tone.Frequency(note).toMidi() - Tone.Frequency("C4").toMidi();
    player.playbackRate = Math.pow(2, semitones / 12);
  } else {
    player.playbackRate = 1;
  }
  player.start(time);
}

function playEvent(ev: NoteEvent, time: number, bpmValue: number) {
  const velocity = ev.soft ? 0.4 : 0.8;
  const durationSeconds = (60 / bpmValue) * ev.duration;

  // URL sample registry takes priority — allows samples: to override built-in instruments
  const urlEntry = urlSampleRegistry[ev.instrument];
  if (urlEntry) {
    triggerSamplePlayer(urlEntry.player, ev.notes[0], time);
    return;
  }

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
    case "strings":
      if (stringsInst) stringsInst.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
      break;
    case "pad":
      if (padInst) padInst.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
      break;
    case "pluck":
      if (pluckInst) pluckInst.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
      break;
    case "organ":
      if (organInst) organInst.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
      break;
    case "lead":
      if (leadInst) leadInst.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
      break;
    case "bell":
      if (bellInst) bellInst.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
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
    case "clap":
      if (clapInst) clapInst.triggerAttackRelease("16n", time, velocity);
      break;
    case "tom":
      if (tomInst) tomInst.triggerAttackRelease("G1", "8n", time, velocity);
      break;
    case "cymbal":
      if (cymbalInst) cymbalInst.triggerAttackRelease("16n", time, velocity);
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

  // Instruments that use a monophonic synth and cannot play two notes at the
  // exact same timestamp without Tone.js throwing a timeline ordering error.
  const MONO_INSTRUMENTS = new Set(["bass"]);

  // Merge all events for the same instrument into a single Part.
  // This avoids having multiple Parts start at t=0 for the same instrument.
  const byInstrument = new Map<string, { time: string; event: NoteEvent }[]>();
  for (const line of lines) {
    for (const ev of line.events) {
      if (!byInstrument.has(ev.instrument)) byInstrument.set(ev.instrument, []);
      byInstrument.get(ev.instrument)!.push({ time: beatToTime(ev.beat), event: ev });
    }
  }

  for (const [instrument, evList] of byInstrument) {
    if (evList.length === 0) continue;

    // Sort ascending so Tone.Part sees events in time order.
    evList.sort((a, b) => a.event.beat - b.event.beat);

    // For monophonic instruments, deduplicate same-beat events (keep the last
    // declaration at each beat) to prevent the "Start time must be strictly
    // greater than previous start time" error.
    const partEvents = MONO_INSTRUMENTS.has(instrument)
      ? [...new Map(evList.map((e) => [e.event.beat, e])).values()]
      : evList;

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
  if (synthInst)   { synthInst.dispose();   synthInst = null; }
  if (bassInst)    { bassInst.dispose();    bassInst = null; }
  if (stringsInst) { stringsInst.dispose(); stringsInst = null; }
  if (padInst)     { padInst.dispose();     padInst = null; }
  if (pluckInst)   { pluckInst.dispose();   pluckInst = null; }
  if (organInst)   { organInst.dispose();   organInst = null; }
  if (leadInst)    { leadInst.dispose();    leadInst = null; }
  if (bellInst)    { bellInst.dispose();    bellInst = null; }
}

export async function startPlayback(
  text: string,
  bpm: number,
  loop: boolean,
  volumeOffsets?: Record<string, number>,
  instConfigs?: Record<string, InstrumentConfig>
): Promise<{ maxBeats: number; failedSamples: string[] }> {
  await Tone.start();

  // Load any URL-based sample declarations in the text; collect failures
  const failedSamples = await loadUrlSamples(text);

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
  if (
    instrumentsNeeded.has("strings") || instrumentsNeeded.has("pad") ||
    instrumentsNeeded.has("pluck") || instrumentsNeeded.has("organ") ||
    instrumentsNeeded.has("lead") || instrumentsNeeded.has("bell")
  ) {
    ensureExtendedSynths();
  }
  if (
    instrumentsNeeded.has("snare") || instrumentsNeeded.has("kick") || instrumentsNeeded.has("hihat") ||
    instrumentsNeeded.has("clap") || instrumentsNeeded.has("tom") || instrumentsNeeded.has("cymbal")
  ) {
    ensurePercussion();
  }

  const transport = Tone.getTransport();
  transport.bpm.value = bpm;
  transport.position = 0;

  const result = scheduleMusic(text, loop);

  transport.start();
  return { ...result, failedSamples };
}

export function stopPlayback() {
  const transport = Tone.getTransport();
  transport.stop();
  transport.position = 0;
  clearParts();
  transport.cancel();
  sampler?.releaseAll();
  synthInst?.releaseAll();
  stringsInst?.releaseAll();
  padInst?.releaseAll();
  pluckInst?.releaseAll();
  organInst?.releaseAll();
  bellInst?.releaseAll();
  bassInst?.triggerRelease();
  leadInst?.releaseAll();
  snareInst?.triggerRelease();
  kickInst?.triggerRelease();
  hihatInst?.triggerRelease();
  clapInst?.triggerRelease();
  tomInst?.triggerRelease();
  cymbalInst?.triggerRelease();
  for (const { player } of Object.values(urlSampleRegistry)) {
    player.stop();
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
  sampler:  Tone.Sampler | null;
  synth:    Tone.PolySynth | null;
  bass:     Tone.MonoSynth | null;
  strings:  Tone.PolySynth | null;
  pad:      Tone.PolySynth | null;
  pluck:    Tone.PolySynth | null;
  organ:    Tone.PolySynth | null;
  lead:     Tone.PolySynth | null;
  bell:     Tone.PolySynth | null;
  snare:    Tone.NoiseSynth | null;
  kick:     Tone.MembraneSynth | null;
  hihat:    Tone.NoiseSynth | null;
  clap:     Tone.NoiseSynth | null;
  tom:      Tone.MembraneSynth | null;
  cymbal:   Tone.MetalSynth | null;
  custom:   Record<string, Tone.Player>;
}

function playEventOffline(
  ev: NoteEvent,
  time: number,
  bpmValue: number,
  inst: OfflineInstruments
) {
  const velocity = ev.soft ? 0.4 : 0.8;
  const durationSeconds = (60 / bpmValue) * ev.duration;

  // Custom sample players take priority over built-in synthesizers
  const customPlayer = inst.custom[ev.instrument];
  if (customPlayer) {
    triggerSamplePlayer(customPlayer, ev.notes[0], time);
    return;
  }

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
    case "strings":
      inst.strings?.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
      break;
    case "pad":
      inst.pad?.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
      break;
    case "pluck":
      inst.pluck?.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
      break;
    case "organ":
      inst.organ?.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
      break;
    case "lead":
      inst.lead?.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
      break;
    case "bell":
      inst.bell?.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);
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
    case "clap":
      inst.clap?.triggerAttackRelease("16n", time, velocity);
      break;
    case "tom":
      inst.tom?.triggerAttackRelease("G1", "8n", time, velocity);
      break;
    case "cymbal":
      inst.cymbal?.triggerAttackRelease("16n", time, velocity);
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
      sampler: null, synth: null, bass: null,
      strings: null, pad: null, pluck: null, organ: null, lead: null, bell: null,
      snare: null, kick: null, hihat: null, clap: null, tom: null, cymbal: null,
      custom: {},
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
        envelope: { attack: cfg?.attack ?? 0.03, decay: cfg?.decay ?? 0.2, sustain: cfg?.sustain ?? 0.4, release: cfg?.release ?? 1.2 },
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
        envelope: { attack: cfg?.attack ?? 0.01, decay: cfg?.decay ?? 0.15, sustain: cfg?.sustain ?? 0.7, release: cfg?.release ?? 0.3 },
        filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 1.5, baseFrequency: filterFreq, octaves: 3.5 },
      }).connect(getGain("bass"));
      applyVol("bass", inst.bass);
    }

    if (instrumentsNeeded.has("strings")) {
      const cfg = configs["strings"];
      inst.strings = new Tone.PolySynth(Tone.Synth).connect(getGain("strings"));
      inst.strings.set({
        oscillator: oscType("strings", cfg, { type: "sawtooth" }),
        envelope: { attack: cfg?.attack ?? 0.4, decay: cfg?.decay ?? 0.1, sustain: cfg?.sustain ?? 0.7, release: cfg?.release ?? 1.5 },
      });
      applyVol("strings", inst.strings);
    }

    if (instrumentsNeeded.has("pad")) {
      const cfg = configs["pad"];
      inst.pad = new Tone.PolySynth(Tone.Synth).connect(getGain("pad"));
      inst.pad.set({
        oscillator: oscType("pad", cfg, { type: "triangle" }),
        envelope: { attack: cfg?.attack ?? 0.5, decay: cfg?.decay ?? 0.2, sustain: cfg?.sustain ?? 0.6, release: cfg?.release ?? 2.0 },
      });
      applyVol("pad", inst.pad);
    }

    if (instrumentsNeeded.has("pluck")) {
      const cfg = configs["pluck"];
      inst.pluck = new Tone.PolySynth(Tone.Synth).connect(getGain("pluck"));
      inst.pluck.set({
        oscillator: oscType("pluck", cfg, { type: "triangle" }),
        envelope: { attack: cfg?.attack ?? 0.001, decay: cfg?.decay ?? 0.4, sustain: cfg?.sustain ?? 0.0, release: cfg?.release ?? 0.5 },
      });
      applyVol("pluck", inst.pluck);
    }

    if (instrumentsNeeded.has("organ")) {
      const cfg = configs["organ"];
      inst.organ = new Tone.PolySynth(Tone.Synth).connect(getGain("organ"));
      inst.organ.set({
        oscillator: oscType("organ", cfg, { type: "square" }),
        envelope: { attack: cfg?.attack ?? 0.01, decay: cfg?.decay ?? 0.01, sustain: cfg?.sustain ?? 0.9, release: cfg?.release ?? 0.05 },
      });
      applyVol("organ", inst.organ);
    }

    if (instrumentsNeeded.has("lead")) {
      const cfg = configs["lead"];
      inst.lead = new Tone.PolySynth(Tone.Synth).connect(getGain("lead"));
      inst.lead.set({
        oscillator: oscType("lead", cfg, { type: "sawtooth" }),
        envelope: { attack: cfg?.attack ?? 0.01, decay: cfg?.decay ?? 0.1, sustain: cfg?.sustain ?? 0.8, release: cfg?.release ?? 0.3 },
      });
      applyVol("lead", inst.lead);
    }

    if (instrumentsNeeded.has("bell")) {
      const cfg = configs["bell"];
      inst.bell = new Tone.PolySynth(Tone.Synth).connect(getGain("bell"));
      inst.bell.set({
        oscillator: oscType("bell", cfg, { type: "sine" }),
        envelope: { attack: cfg?.attack ?? 0.001, decay: cfg?.decay ?? 1.5, sustain: cfg?.sustain ?? 0.0, release: cfg?.release ?? 0.5 },
      });
      applyVol("bell", inst.bell);
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
        pitchDecay: 0.06, octaves: 8,
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

    if (instrumentsNeeded.has("clap")) {
      inst.clap = new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.1, sustain: 0.0, release: 0.05 },
      }).connect(getGain("clap"));
      applyVol("clap", inst.clap);
    }

    if (instrumentsNeeded.has("tom")) {
      inst.tom = new Tone.MembraneSynth({
        pitchDecay: 0.1, octaves: 4,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.5 },
      }).connect(getGain("tom"));
      applyVol("tom", inst.tom);
    }

    if (instrumentsNeeded.has("cymbal")) {
      inst.cymbal = new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.4, release: 0.2 },
        harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
      }).connect(getGain("cymbal"));
      inst.cymbal.frequency.value = 400;
      applyVol("cymbal", inst.cymbal);
    }

    // Create players for URL-based sample channels and wait for them to load
    for (const [name, { url }] of Object.entries(urlSampleRegistry)) {
      if (instrumentsNeeded.has(name)) {
        const player = new Tone.Player(url).connect(getGain(name));
        applyVol(name, player);
        inst.custom[name] = player;
      }
    }
    if (Object.keys(inst.custom).length > 0) {
      await Tone.loaded();
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
