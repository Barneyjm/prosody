import YAML from "yaml";

/**
 * YAML song format for Prosody.
 *
 * Example:
 * ```yaml
 * bpm: 120
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
 * Returns plain-text notation compatible with the existing parser.
 */

interface ProsodyYaml {
  bpm?: number;
  sections?: Record<string, Record<string, string>>;
  song?: string[];
}

export interface YamlParseResult {
  text: string;
  bpm?: number;
}

/**
 * Detect whether input looks like YAML (has `sections:` or `song:` keys).
 */
export function isYamlFormat(input: string): boolean {
  const trimmed = input.trim();
  // Quick heuristic: YAML song files contain "sections:" or "song:" at the start of a line
  return /^(sections|song|bpm)\s*:/m.test(trimmed);
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
  const sections = doc.sections ?? {};
  const songOrder = doc.song ?? [];

  // If no song order, just render all sections in document order
  const sectionNames =
    songOrder.length > 0 ? expandSongOrder(songOrder) : Object.keys(sections);

  // Collect all instrument lines across all referenced sections
  const outputLines: string[] = [];

  for (const sectionName of sectionNames) {
    const section = sections[sectionName];
    if (!section) {
      // Might be a raw text line passed through
      continue;
    }

    for (const [instrument, pattern] of Object.entries(section)) {
      outputLines.push(`${instrument}: ${pattern}`);
    }
  }

  return {
    text: outputLines.join("\n"),
    bpm,
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
