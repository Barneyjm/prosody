import * as Tone from "tone";
import { parseAllLines, NoteEvent } from "./parser";

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

let sampler: Tone.Sampler | null = null;
let parts: Tone.Part[] = [];
let loaded = false;
let onActiveNote: ActiveNoteCallback | null = null;

export function setActiveNoteCallback(cb: ActiveNoteCallback | null) {
  onActiveNote = cb;
}

export async function ensureSampler(): Promise<Tone.Sampler> {
  if (sampler && loaded) return sampler;

  return new Promise((resolve, reject) => {
    sampler = new Tone.Sampler({
      urls: SAMPLE_MAP,
      baseUrl: SALAMANDER_BASE_URL,
      onload: () => {
        loaded = true;
        resolve(sampler!);
      },
      onerror: (err: Error) => {
        reject(err);
      },
      release: 1,
    }).toDestination();
  });
}

export function getSamplerLoadState(): boolean {
  return loaded;
}

function clearParts() {
  for (const part of parts) {
    part.dispose();
  }
  parts = [];
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
      if (!sampler) return;

      const velocity = ev.soft ? 0.4 : 0.8;
      const durationSeconds = (60 / transport.bpm.value) * ev.duration;

      sampler.triggerAttackRelease(ev.notes, durationSeconds, time, velocity);

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
  await ensureSampler();

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
