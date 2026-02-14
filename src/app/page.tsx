"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@/components/Editor";
import Transport from "@/components/Transport";
import { compressToHash, decompressFromHash } from "@/lib/share";

const DEFAULT_TEXT = `piano: C4 E4 G4 C5 G4 E4 C4 -
bass: C2 - - C2 - - E2 -
kick: x - x - x - x -
hihat: x x x x x x x x`;

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
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "error">("idle");
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "rendering" | "error">("idle");
  const audioRef = useRef<typeof import("@/lib/audio") | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load shared content from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      decompressFromHash(hash)
        .then((decoded) => setText(decoded))
        .catch(() => {
          // Invalid hash, ignore
        });
    }
  }, []);

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

  const handleShare = useCallback(async () => {
    try {
      const hash = await compressToHash(text);
      const url = `${window.location.origin}${window.location.pathname}#${hash}`;
      window.history.replaceState(null, "", `#${hash}`);
      if (navigator.share) {
        await navigator.share({ url });
        setShareStatus("copied");
      } else {
        await navigator.clipboard.writeText(url);
        setShareStatus("copied");
      }
      setTimeout(() => setShareStatus("idle"), 2000);
    } catch (e) {
      // User cancelled share dialog — not an error
      if (e instanceof Error && e.name === "AbortError") {
        return;
      }
      setShareStatus("error");
      setTimeout(() => setShareStatus("idle"), 2000);
    }
  }, [text]);

  const handleDownload = useCallback(async () => {
    setDownloadStatus("rendering");
    try {
      const audio = await getAudio();
      const blob = await audio.renderOffline(text, bpm);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "prosody.wav";
      a.click();
      URL.revokeObjectURL(url);
      setDownloadStatus("idle");
    } catch (err) {
      console.error("Download error:", err);
      setDownloadStatus("error");
      setTimeout(() => setDownloadStatus("idle"), 2000);
    }
  }, [text, bpm, getAudio]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        setText(content);
        if (isPlaying) {
          handleStop();
        }
      };
      reader.readAsText(file);
      // Reset so the same file can be re-uploaded
      e.target.value = "";
    },
    [isPlaying, handleStop]
  );

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
        <div className="flex items-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.prosody,.text,text/plain"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors border border-[var(--border-color)] hover:border-[var(--accent-purple)] text-[var(--text-secondary)] hover:text-[var(--accent-purple)] bg-[var(--bg-tertiary)]"
            title="Open a text file"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            Open
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors border border-[var(--border-color)] hover:border-[var(--accent-blue)] text-[var(--text-secondary)] hover:text-[var(--accent-blue)] bg-[var(--bg-tertiary)]"
            title="Share a link to this text"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            {shareStatus === "copied"
              ? "Shared!"
              : shareStatus === "error"
              ? "Failed"
              : "Share"}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloadStatus === "rendering"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors border border-[var(--border-color)] hover:border-[var(--accent-green)] text-[var(--text-secondary)] hover:text-[var(--accent-green)] bg-[var(--bg-tertiary)] disabled:opacity-50"
            title="Download as WAV file"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {downloadStatus === "rendering"
              ? "Rendering..."
              : downloadStatus === "error"
              ? "Failed"
              : "Download"}
          </button>
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
        </div>
      </header>

      {/* Help bar */}
      <div className="px-6 py-2 text-xs text-[var(--text-muted)] border-b border-[var(--border-color)] bg-[var(--bg-primary)] flex gap-6 flex-wrap">
        <span>
          <strong className="text-[var(--accent-pink)]">Instruments:</strong>{" "}
          piano: synth: bass: kick: snare: hihat:
        </span>
        <span>
          <strong className="text-[var(--accent-blue)]">Notes:</strong> C4 D#5
          Ab3
        </span>
        <span>
          <strong className="text-[var(--accent-orange)]">Hits:</strong> x
          (percussion)
        </span>
        <span>
          <strong className="text-[var(--text-muted)]">Rests:</strong> - or _
        </span>
        <span>
          <strong className="text-[var(--accent-purple)]">Chords:</strong> [C4
          E4 G4]
        </span>
        <span>
          <strong className="text-[var(--accent-green)]">Soft:</strong> c4
          (lowercase)
        </span>
      </div>

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

      {/* Editor */}
      <main className="flex-1 flex flex-col p-4 overflow-hidden">
        <Editor
          value={text}
          onChange={handleTextChange}
          activeNotes={activeNotes}
        />
      </main>
    </div>
  );
}
