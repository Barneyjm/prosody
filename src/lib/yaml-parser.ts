import YAML, { parseDocument, YAMLMap, isMap, isScalar } from "yaml";
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
  samples?: Record<string, string>;
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
  return /^(sections|song|bpm|volumes|instruments|samples)\s*:/m.test(trimmed);
}

/**
 * Parse a YAML section map via the AST, preserving duplicate instrument keys.
 * e.g. two `piano:` lines in the same section → ["melody pattern", "chord pattern"]
 */
function parseSectionMap(sectionNode: YAMLMap): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const item of sectionNode.items) {
    if (!isScalar(item.key) || !item.value || !isScalar(item.value)) continue;
    const key = String(item.key.value);
    const value = item.value.value;
    if (value == null) continue;
    if (!result.has(key)) result.set(key, []);
    result.get(key)!.push(String(value));
  }
  return result;
}

/**
 * Parse all sections from the YAML AST, collecting duplicate instrument keys.
 * Returns a map of section name → (instrument → array of patterns).
 */
function parseSectionsFromAst(input: string): Record<string, Map<string, string[]>> {
  const doc = parseDocument(input);
  const result: Record<string, Map<string, string[]>> = {};

  if (!isMap(doc.contents)) return result;

  for (const topPair of doc.contents.items) {
    if (!isScalar(topPair.key) || String(topPair.key.value) !== "sections") continue;
    if (!isMap(topPair.value)) continue;

    for (const sectionPair of (topPair.value as YAMLMap).items) {
      if (!isScalar(sectionPair.key) || !isMap(sectionPair.value)) continue;
      const sectionName = String(sectionPair.key.value);
      result[sectionName] = parseSectionMap(sectionPair.value as YAMLMap);
    }
    break;
  }

  return result;
}

/** Count the total beats in a section by parsing each instrument line. */
function getSectionBeats(section: Map<string, string[]>): number {
  let maxBeats = 0;
  for (const [inst, patterns] of section) {
    for (const pattern of patterns) {
      const { events } = parseLine(`${inst}: ${pattern}`, 0);
      if (events.length > 0) {
        const last = events[events.length - 1];
        const beats = last.beat + last.duration;
        if (beats > maxBeats) maxBeats = beats;
      }
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
  // Use YAML.parse for the top-level scalar fields (bpm, volumes, instruments, samples, song).
  // Use AST parsing (parseDocument) for sections to preserve duplicate instrument keys.
  const doc = YAML.parse(input) as ProsodyYaml;

  if (!doc || typeof doc !== "object") {
    throw new Error("Invalid YAML: expected an object");
  }

  const bpm = doc.bpm;
  const volumes = doc.volumes;
  const instruments = doc.instruments;
  const songOrder = doc.song ?? [];

  // Collect sample URL declarations from the `samples:` key, e.g.:
  //   samples:
  //     gong: https://tonejs.github.io/audio/berklee/gong_1.mp3
  // These are emitted as flat text declaration lines so the audio engine
  // picks them up via parseSampleDeclarations().
  const sampleLines: string[] = [];
  for (const [name, url] of Object.entries(doc.samples ?? {})) {
    sampleLines.push(`${name}: ${url}`);
  }

  // Parse sections via AST to capture duplicate instrument keys
  const sections = parseSectionsFromAst(input);

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
    for (const inst of section.keys()) {
      if (!seenInstruments.has(inst)) {
        seenInstruments.add(inst);
        allInstruments.push(inst);
      }
    }
  }

  // Determine the maximum number of pattern lines per instrument across all sections.
  // This handles duplicate keys: if verse has two `piano:` lines, instMaxLines["piano"] = 2.
  const instMaxLines: Record<string, number> = {};
  for (const section of Object.values(sections)) {
    for (const [inst, patterns] of section) {
      instMaxLines[inst] = Math.max(instMaxLines[inst] ?? 0, patterns.length);
    }
  }

  // Build per-instrument, per-line-index pattern segments across the whole song.
  // instrumentLineSegments[inst][lineIndex] = array of per-section-occurrence strings.
  // Sections where a given line index doesn't exist are padded with rests.
  const instrumentLineSegments: Record<string, string[][]> = {};
  for (const inst of allInstruments) {
    const numLines = instMaxLines[inst] ?? 1;
    instrumentLineSegments[inst] = Array.from({ length: numLines }, () => []);
  }

  for (const sectionName of sectionNames) {
    const section = sections[sectionName];
    if (!section) continue;
    const beats = sectionBeatCounts[sectionName] ?? 0;

    for (const inst of allInstruments) {
      const patterns = section.get(inst);
      const numLines = instMaxLines[inst] ?? 1;
      for (let i = 0; i < numLines; i++) {
        if (patterns && patterns[i] !== undefined) {
          instrumentLineSegments[inst][i].push(patterns[i]);
        } else {
          // Instrument absent (or has fewer patterns than max) — pad with rests
          instrumentLineSegments[inst][i].push(generateRests(beats));
        }
      }
    }
  }

  // Emit sample declaration lines first, then one flat-text line per instrument per line index.
  // Multiple lines for the same instrument (e.g. piano melody + piano chords) play simultaneously.
  const outputLines: string[] = [...sampleLines];
  for (const inst of allInstruments) {
    for (const segments of instrumentLineSegments[inst]) {
      outputLines.push(`${inst}: ${segments.filter(Boolean).join(" ")}`);
    }
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
