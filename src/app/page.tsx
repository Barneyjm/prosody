"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@/components/Editor";
import Transport from "@/components/Transport";
import { compressToHash, decompressFromHash } from "@/lib/share";
import { EXAMPLES } from "@/lib/examples";
import { tryParseYaml } from "@/lib/yaml-parser";

const DEFAULT_TEXT = EXAMPLES[0].text;
const DEFAULT_VOLUMES: Record<string, number> = {
  piano: 0,
  synth: 0,
  bass: 0,
  kick: 0,
  snare: 0,
  hihat: 0,
};

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
  const [volumes, setVolumes] = useState<Record<string, number>>(DEFAULT_VOLUMES);
  const audioRef = useRef<typeof import("@/lib/audio") | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Performance: batch active-note callbacks via a ref + rAF ---
  const pendingNotesRef = useRef<Map<string, ActiveNote>>(new Map());
  const rafIdRef = useRef<number | null>(null);

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

  // Flush batched active-note updates at ~60 fps via rAF
  const flushActiveNotes = useCallback(() => {
    const now = Date.now();
    const pending = pendingNotesRef.current;
    // Merge pending into state, drop stale entries
    setActiveNotes((prev) => {
      const merged = new Map<string, ActiveNote>();
      for (const n of prev) {
        if (now - n.timestamp < 300) {
          merged.set(`${n.lineIndex}:${n.tokenIndex}`, n);
        }
      }
      for (const [key, n] of pending) {
        merged.set(key, n);
      }
      pending.clear();
      return Array.from(merged.values());
    });
    rafIdRef.current = null;
  }, []);

  // Clean up stale active notes on a slower interval (no per-note setState)
  useEffect(() => {
    if (isPlaying) {
      cleanupTimerRef.current = setInterval(() => {
        const now = Date.now();
        setActiveNotes((prev) => {
          const filtered = prev.filter((n) => now - n.timestamp < 300);
          return filtered.length === prev.length ? prev : filtered;
        });
      }, 200);
    } else {
      if (cleanupTimerRef.current) {
        clearInterval(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingNotesRef.current.clear();
      setActiveNotes([]);
    }
    return () => {
      if (cleanupTimerRef.current) {
        clearInterval(cleanupTimerRef.current);
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [isPlaying, flushActiveNotes]);

  // Resolve YAML to flat notation, or pass through as-is
  const resolveText = useCallback(
    (input: string): { resolved: string; resolvedBpm?: number } => {
      const yamlResult = tryParseYaml(input);
      if (yamlResult) {
        return { resolved: yamlResult.text, resolvedBpm: yamlResult.bpm };
      }
      return { resolved: input };
    },
    []
  );

  const handlePlay = useCallback(async () => {
    setIsLoading(true);
    try {
      const audio = await getAudio();
      audio.setActiveNoteCallback((lineIndex, tokenIndex) => {
        const key = `${lineIndex}:${tokenIndex}`;
        pendingNotesRef.current.set(key, {
          lineIndex,
          tokenIndex,
          timestamp: Date.now(),
        });
        // Coalesce into a single rAF
        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(flushActiveNotes);
        }
      });
      const { resolved, resolvedBpm } = resolveText(text);
      const effectiveBpm = resolvedBpm ?? bpm;
      if (resolvedBpm) setBpmState(resolvedBpm);
      await audio.startPlayback(resolved, effectiveBpm, loop, volumes);
      setIsPlaying(true);
    } catch (err) {
      console.error("Playback error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [text, bpm, loop, volumes, getAudio, flushActiveNotes, resolveText]);

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

  const handleVolumeChange = useCallback(
    async (instrument: string, value: number) => {
      setVolumes((prev) => ({ ...prev, [instrument]: value }));
      if (isPlaying) {
        const audio = await getAudio();
        audio.setInstrumentVolume(instrument, value);
      }
    },
    [isPlaying, getAudio]
  );

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
      const { resolved, resolvedBpm } = resolveText(text);
      const effectiveBpm = resolvedBpm ?? bpm;
      const blob = await audio.renderOffline(resolved, effectiveBpm, volumes);
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
  }, [text, bpm, volumes, getAudio, resolveText]);

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

  const handleLoadExample = useCallback(
    (index: number) => {
      const example = EXAMPLES[index];
      if (!example) return;
      setText(example.text);
      setBpmState(example.bpm);
      if (isPlaying) {
        handleStop();
      }
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
          <select
            onChange={(e) => {
              const idx = parseInt(e.target.value, 10);
              if (!isNaN(idx)) handleLoadExample(idx);
              e.target.value = "";
            }}
            defaultValue=""
            className="px-3 py-1.5 rounded text-xs border border-[var(--border-color)] hover:border-[var(--accent-purple)] text-[var(--text-secondary)] bg-[var(--bg-tertiary)] outline-none cursor-pointer"
            title="Load an example"
          >
            <option value="" disabled>
              Examples...
            </option>
            {EXAMPLES.map((ex, i) => (
              <option key={i} value={i}>
                {ex.name} ({ex.bpm} BPM)
              </option>
            ))}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.prosody,.text,.yaml,.yml,text/plain"
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
        <span>
          <strong className="text-[var(--accent-blue)]">Dotted:</strong> C4.
          (1.5 beats)
        </span>
        <span>
          <strong className="text-[var(--accent-pink)]">Tied:</strong> C4~ ~
          (sustain)
        </span>
        <span>
          <strong className="text-[var(--accent-orange)]">YAML:</strong>{" "}
          sections + song order
        </span>
      </div>

      {/* Transport controls */}
      <Transport
        isPlaying={isPlaying}
        isLoading={isLoading}
        loop={loop}
        bpm={bpm}
        volumes={volumes}
        onPlay={handlePlay}
        onStop={handleStop}
        onLoopToggle={handleLoopToggle}
        onBpmChange={handleBpmChange}
        onVolumeChange={handleVolumeChange}
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
