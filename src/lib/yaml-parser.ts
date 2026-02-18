import YAML from "yaml";
import { parseLine } from "./parser";

/**
 * YAML song format for Prosody.
 *
 * Example:
 * ```yaml
 * bpm: 120
 *
 * volumes:
 *   bass: -5
 *   hihat: -3
 *
 * instruments:
 *   synth:
 *     oscillator: fatsawtooth
 *     attack: 0.05
 *     release: 1.5
 *   bass:
 *     oscillator: square
 *     filter: 300
 *
 * sections:
 *   verse:
 *     piano: "[C4 E4 G4] - [F4 A4 C5] -"
 *     bass:  "C2 - F2 -"
 *     kick:  "x - x -"
 *
 *   chorus:
 *     piano: "[G4 B4 D5] - [C4 E4 G4] -"
 *     synth: "G5 E5 C5 G4"
 *     bass:  "G2 - C2 -"
 *     kick:  "x - x -"
 *     snare: "- - x -"
 *
 * song:
 *   - verse
 *   - verse
 *   - chorus
 *   - chorus
 *   - verse
 *   - chorus x3
 * ```
 *
 * Returns plain-text notation compatible with the existing parser,
 * plus volume offsets and instrument configs for the audio engine.
 */

/** Per-instrument synth parameter overrides from YAML */
export interface InstrumentConfig {
  oscillator?: string;  // e.g. "fatsawtooth", "triangle", "square", "sine", "sawtooth"
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  filter?: number;      // lowpass cutoff frequency in Hz
  filterQ?: number;     // filter resonance
}

interface ProsodyYaml {
  bpm?: number;
  volumes?: Record<string, number>;
  instruments?: Record<string, InstrumentConfig>;
  sections?: Record<string, Record<string, string>>;
  song?: string[];
}

export interface YamlParseResult {
  text: string;
  bpm?: number;
  volumes?: Record<string, number>;
  instruments?: Record<string, InstrumentConfig>;
}

/**
 * Detect whether input looks like YAML (has `sections:` or `song:` keys).
 */
export function isYamlFormat(input: string): boolean {
  const trimmed = input.trim();
  // Quick heuristic: YAML song files contain these keys at the start of a line
  return /^(sections|song|bpm|volumes|instruments)\s*:/m.test(trimmed);
}

/** Count the total beats in a section by parsing each instrument line. */
function getSectionBeats(section: Record<string, string>): number {
  let maxBeats = 0;
  for (const [inst, pattern] of Object.entries(section)) {
    const { events } = parseLine(`${inst}: ${pattern}`, 0);
    if (events.length > 0) {
      const last = events[events.length - 1];
      const beats = last.beat + last.duration;
      if (beats > maxBeats) maxBeats = beats;
    }
  }
  return maxBeats;
}

/** Generate a string of N rest tokens to pad a silent section. */
function generateRests(beats: number): string {
  const count = Math.round(beats);
  if (count <= 0) return "";
  return Array(count).fill("-").join(" ");
}

/**
 * Parse a YAML song definition into flat text notation.
 */
export function parseYamlSong(input: string): YamlParseResult {
  const doc = YAML.parse(input) as ProsodyYaml;

  if (!doc || typeof doc !== "object") {
    throw new Error("Invalid YAML: expected an object");
  }

  const bpm = doc.bpm;
  const volumes = doc.volumes;
  const instruments = doc.instruments;
  const sections = doc.sections ?? {};
  const songOrder = doc.song ?? [];

  // If no song order, just render all sections in document order
  const sectionNames =
    songOrder.length > 0 ? expandSongOrder(songOrder) : Object.keys(sections);

  // Pre-compute beat counts for each unique section
  const sectionBeatCounts: Record<string, number> = {};
  for (const [name, section] of Object.entries(sections)) {
    sectionBeatCounts[name] = getSectionBeats(section);
  }

  // Collect all instruments referenced across all sections in the song
  const allInstruments: string[] = [];
  const seenInstruments = new Set<string>();
  for (const sectionName of sectionNames) {
    const section = sections[sectionName];
    if (!section) continue;
    for (const inst of Object.keys(section)) {
      if (!seenInstruments.has(inst)) {
        seenInstruments.add(inst);
        allInstruments.push(inst);
      }
    }
  }

  // Build one concatenated pattern per instrument spanning the whole song.
  // Sections where an instrument is absent are padded with rests so beat
  // positions stay aligned across all instruments.
  const instrumentPatterns: Record<string, string[]> = {};
  for (const inst of allInstruments) {
    instrumentPatterns[inst] = [];
  }

  for (const sectionName of sectionNames) {
    const section = sections[sectionName];
    if (!section) continue;
    const beats = sectionBeatCounts[sectionName] ?? 0;

    for (const inst of allInstruments) {
      if (section[inst] !== undefined) {
        instrumentPatterns[inst].push(section[inst]);
      } else {
        instrumentPatterns[inst].push(generateRests(beats));
      }
    }
  }

  // Emit exactly one line per instrument
  const outputLines: string[] = [];
  for (const inst of allInstruments) {
    outputLines.push(`${inst}: ${instrumentPatterns[inst].filter(Boolean).join(" ")}`);
  }

  return {
    text: outputLines.join("\n"),
    bpm,
    volumes,
    instruments,
  };
}

/**
 * Expand song order entries like "chorus x3" into repeated section names.
 */
function expandSongOrder(order: string[]): string[] {
  const result: string[] = [];

  for (const entry of order) {
    const repeatMatch = entry.match(/^(\S+)\s*[xX*](\d+)$/);
    if (repeatMatch) {
      const name = repeatMatch[1];
      const count = parseInt(repeatMatch[2], 10);
      for (let i = 0; i < count; i++) {
        result.push(name);
      }
    } else {
      result.push(entry.trim());
    }
  }

  return result;
}

/**
 * Try to parse as YAML; if it doesn't look like YAML, return null.
 */
export function tryParseYaml(input: string): YamlParseResult | null {
  if (!isYamlFormat(input)) return null;
  try {
    return parseYamlSong(input);
  } catch {
    return null;
  }
}
