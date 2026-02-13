"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@/components/Editor";
import Transport from "@/components/Transport";

const DEFAULT_TEXT = `C4 E4 G4 C5 G4 E4 C4 -
- - C3 - - C3 - C3
E4 - E4 - F4 - E4 D4`;

interface ActiveNote {
  lineIndex: number;
  tokenIndex: number;
  timestamp: number;
}

export default function Home() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loop, setLoop] = useState(true);
  const [bpm, setBpmState] = useState(120);
  const [activeNotes, setActiveNotes] = useState<ActiveNote[]>([]);
  const audioRef = useRef<typeof import("@/lib/audio") | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dynamically import audio module (requires browser environment)
  const getAudio = useCallback(async () => {
    if (!audioRef.current) {
      audioRef.current = await import("@/lib/audio");
    }
    return audioRef.current;
  }, []);

  // Clean up stale active notes
  useEffect(() => {
    if (isPlaying) {
      cleanupTimerRef.current = setInterval(() => {
        const now = Date.now();
        setActiveNotes((prev) =>
          prev.filter((n) => now - n.timestamp < 300)
        );
      }, 100);
    } else {
      if (cleanupTimerRef.current) {
        clearInterval(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
      setActiveNotes([]);
    }
    return () => {
      if (cleanupTimerRef.current) {
        clearInterval(cleanupTimerRef.current);
      }
    };
  }, [isPlaying]);

  const handlePlay = useCallback(async () => {
    setIsLoading(true);
    try {
      const audio = await getAudio();
      audio.setActiveNoteCallback((lineIndex, tokenIndex) => {
        setActiveNotes((prev) => [
          ...prev.filter(
            (n) =>
              !(n.lineIndex === lineIndex && n.tokenIndex === tokenIndex)
          ),
          { lineIndex, tokenIndex, timestamp: Date.now() },
        ]);
      });
      await audio.startPlayback(text, bpm, loop);
      setIsPlaying(true);
    } catch (err) {
      console.error("Playback error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [text, bpm, loop, getAudio]);

  const handleStop = useCallback(async () => {
    const audio = await getAudio();
    audio.stopPlayback();
    audio.setActiveNoteCallback(null);
    setIsPlaying(false);
    setActiveNotes([]);
  }, [getAudio]);

  const handleBpmChange = useCallback(
    async (newBpm: number) => {
      setBpmState(newBpm);
      if (isPlaying) {
        const audio = await getAudio();
        audio.setBpm(newBpm);
      }
    },
    [isPlaying, getAudio]
  );

  const handleLoopToggle = useCallback(() => {
    setLoop((prev) => !prev);
  }, []);

  // Stop playback when text changes during playback
  const handleTextChange = useCallback(
    (newText: string) => {
      setText(newText);
      if (isPlaying) {
        handleStop();
      }
    },
    [isPlaying, handleStop]
  );

  // Keyboard shortcut: Space to play/stop when not focused on textarea
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to play/stop
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (isPlaying) {
          handleStop();
        } else {
          handlePlay();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, handlePlay, handleStop]);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Prosody
          </h1>
          <span className="text-xs text-[var(--text-muted)]">
            Write music in plain text
          </span>
        </div>
        <div className="text-xs text-[var(--text-muted)]">
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-secondary)]">
            Ctrl
          </kbd>
          {" + "}
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-secondary)]">
            Enter
          </kbd>
          <span className="ml-1.5">to play/stop</span>
        </div>
      </header>

      {/* Help bar */}
      <div className="px-6 py-2 text-xs text-[var(--text-muted)] border-b border-[var(--border-color)] bg-[var(--bg-primary)] flex gap-6 flex-wrap">
        <span>
          <strong className="text-[var(--accent-blue)]">Notes:</strong> C4 D#5
          Ab3
        </span>
        <span>
          <strong className="text-[var(--text-muted)]">Rests:</strong> - or _
        </span>
        <span>
          <strong className="text-[var(--accent-purple)]">Chords:</strong> [C4
          E4 G4]
        </span>
        <span>
          <strong className="text-[var(--accent-orange)]">Dotted:</strong> C4.
        </span>
        <span>
          <strong className="text-[var(--accent-orange)]">Tied:</strong> C4~
        </span>
        <span>
          <strong className="text-[var(--accent-green)]">Soft:</strong> c4
          (lowercase)
        </span>
      </div>

      {/* Editor */}
      <main className="flex-1 flex flex-col p-4 overflow-hidden">
        <Editor
          value={text}
          onChange={handleTextChange}
          activeNotes={activeNotes}
        />
      </main>

      {/* Transport controls */}
      <Transport
        isPlaying={isPlaying}
        isLoading={isLoading}
        loop={loop}
        bpm={bpm}
        onPlay={handlePlay}
        onStop={handleStop}
        onLoopToggle={handleLoopToggle}
        onBpmChange={handleBpmChange}
      />
    </div>
  );
}
