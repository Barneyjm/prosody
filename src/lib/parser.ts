export type TokenType = "note" | "rest" | "chord" | "hit" | "invalid";

export interface NoteToken {
  type: "note";
  raw: string;
  note: string; // e.g. "C#4"
  pitchClass: string; // e.g. "C#"
  octave: number;
  dotted: boolean;
  tied: boolean;
  soft: boolean;
}

export interface RestToken {
  type: "rest";
  raw: string;
}

export interface ChordToken {
  type: "chord";
  raw: string;
  notes: NoteToken[];
}

export interface HitToken {
  type: "hit";
  raw: string;
}

export interface InvalidToken {
  type: "invalid";
  raw: string;
}

export type Token = NoteToken | RestToken | ChordToken | HitToken | InvalidToken;

export interface NoteEvent {
  notes: string[]; // pitch names like ["C4", "E4", "G4"]
  beat: number;
  duration: number; // in beats
  lineIndex: number;
  tokenIndex: number;
  soft: boolean;
  instrument: string;
}

// Supported instruments
export const INSTRUMENTS: Record<string, { type: "pitched" | "percussion"; label: string }> = {
  piano: { type: "pitched", label: "Piano" },
  synth: { type: "pitched", label: "Synth" },
  bass: { type: "pitched", label: "Bass" },
  kick: { type: "percussion", label: "Kick" },
  snare: { type: "percussion", label: "Snare" },
  hihat: { type: "percussion", label: "Hi-Hat" },
};

// Regex for a single note: C#4. or c4~ etc.
const NOTE_REGEX = /^([A-Ga-g])([#b]?)(\d)?(\.)?(~)?$/;

export function parseInstrumentPrefix(line: string): {
  instrument: string;
  content: string;
  prefixLength: number;
} {
  const match = line.match(/^(\w+):\s*/);
  if (match && match[1].toLowerCase() in INSTRUMENTS) {
    return {
      instrument: match[1].toLowerCase(),
      content: line.slice(match[0].length),
      prefixLength: match[0].length,
    };
  }
  return { instrument: "piano", content: line, prefixLength: 0 };
}

export function parseNote(raw: string): NoteToken | null {
  const match = raw.match(NOTE_REGEX);
  if (!match) return null;

  const [, letter, accidental, octaveStr, dot, tie] = match;
  const isLowerCase = letter === letter.toLowerCase();
  const pitchClass = letter.toUpperCase() + accidental;
  const octave = octaveStr ? parseInt(octaveStr, 10) : 4;

  return {
    type: "note",
    raw,
    note: pitchClass + octave,
    pitchClass,
    octave,
    dotted: !!dot,
    tied: !!tie,
    soft: isLowerCase,
  };
}

export function tokenize(input: string): Token[] {
  if (!input.trim()) return [];

  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip spaces — each space is a separator between beats
    if (input[i] === " ") {
      i++;
      continue;
    }

    // Chord bracket syntax: [C4 E4 G4]
    if (input[i] === "[") {
      const closeBracket = input.indexOf("]", i);
      if (closeBracket === -1) {
        // No closing bracket — treat rest as invalid
        const raw = input.slice(i);
        tokens.push({ type: "invalid", raw });
        i = input.length;
        continue;
      }

      const chordContent = input.slice(i + 1, closeBracket);
      const chordRaw = input.slice(i, closeBracket + 1);
      const chordParts = chordContent.split(/\s+/).filter(Boolean);
      const chordNotes: NoteToken[] = [];
      let valid = true;

      for (const part of chordParts) {
        const note = parseNote(part);
        if (note) {
          chordNotes.push(note);
        } else {
          valid = false;
          break;
        }
      }

      if (valid && chordNotes.length > 0) {
        tokens.push({ type: "chord", raw: chordRaw, notes: chordNotes });
      } else {
        tokens.push({ type: "invalid", raw: chordRaw });
      }

      i = closeBracket + 1;
      continue;
    }

    // Read until next space or bracket
    let end = i;
    while (end < input.length && input[end] !== " " && input[end] !== "[") {
      end++;
    }

    const raw = input.slice(i, end);
    i = end;

    // Rest
    if (raw === "-" || raw === "_") {
      tokens.push({ type: "rest", raw });
      continue;
    }

    // Hit marker (for percussion)
    if (raw === "x" || raw === "X") {
      tokens.push({ type: "hit", raw });
      continue;
    }

    // Note
    const note = parseNote(raw);
    if (note) {
      tokens.push(note);
      continue;
    }

    // Invalid
    tokens.push({ type: "invalid", raw });
  }

  return tokens;
}

export function parseLine(
  line: string,
  lineIndex: number
): { tokens: Token[]; events: NoteEvent[]; instrument: string; prefixLength: number } {
  const { instrument, content, prefixLength } = parseInstrumentPrefix(line);
  const tokens = tokenize(content);
  const events: NoteEvent[] = [];
  let beat = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === "rest") {
      beat += 1;
      continue;
    }

    if (token.type === "hit") {
      events.push({
        notes: ["C4"],
        beat,
        duration: 1,
        lineIndex,
        tokenIndex: i,
        soft: false,
        instrument,
      });
      beat += 1;
      continue;
    }

    if (token.type === "note") {
      // Check if next token is a tie of the same note
      let duration = token.dotted ? 1.5 : 1;

      // Look ahead for tied notes
      let j = i + 1;
      while (j < tokens.length) {
        const next = tokens[j];
        if (
          next.type === "note" &&
          next.tied &&
          next.note === token.note
        ) {
          duration += next.dotted ? 1.5 : 1;
          j++;
        } else {
          break;
        }
      }

      events.push({
        notes: [token.note],
        beat,
        duration,
        lineIndex,
        tokenIndex: i,
        soft: token.soft,
        instrument,
      });

      beat += duration;
      i = j - 1; // advance past tied notes
      continue;
    }

    if (token.type === "chord") {
      const dotted = token.notes.some((n) => n.dotted);
      const duration = dotted ? 1.5 : 1;

      events.push({
        notes: token.notes.map((n) => n.note),
        beat,
        duration,
        lineIndex,
        tokenIndex: i,
        soft: token.notes.some((n) => n.soft),
        instrument,
      });

      beat += duration;
      continue;
    }

    // Invalid tokens still take up a beat of time
    if (token.type === "invalid") {
      beat += 1;
      continue;
    }
  }

  return { tokens, events, instrument, prefixLength };
}

export function parseAllLines(
  text: string
): { lines: { tokens: Token[]; events: NoteEvent[]; instrument: string; prefixLength: number }[]; maxBeats: number } {
  const lines = text.split("\n").map((line, i) => parseLine(line, i));
  const maxBeats = Math.max(0, ...lines.map((l) => {
    if (l.events.length === 0) return 0;
    const last = l.events[l.events.length - 1];
    return last.beat + last.duration;
  }));

  return { lines, maxBeats };
}
