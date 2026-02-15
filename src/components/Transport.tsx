"use client";

import React, { useState } from "react";

const INSTRUMENT_LABELS: Record<string, string> = {
  piano: "Piano",
  synth: "Synth",
  bass: "Bass",
  kick: "Kick",
  snare: "Snare",
  hihat: "HiHat",
};

const INSTRUMENT_ORDER = ["piano", "synth", "bass", "kick", "snare", "hihat"];

interface TransportProps {
  isPlaying: boolean;
  isLoading: boolean;
  loop: boolean;
  bpm: number;
  volumes: Record<string, number>;
  onPlay: () => void;
  onStop: () => void;
  onLoopToggle: () => void;
  onBpmChange: (bpm: number) => void;
  onVolumeChange: (instrument: string, value: number) => void;
}

function PlayIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="6" y="6" width="12" height="12" />
    </svg>
  );
}

function LoopIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function MixerIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

export default function Transport({
  isPlaying,
  isLoading,
  loop,
  bpm,
  volumes,
  onPlay,
  onStop,
  onLoopToggle,
  onBpmChange,
  onVolumeChange,
}: TransportProps) {
  const [showMixer, setShowMixer] = useState(false);

  return (
    <div className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Play/Stop */}
        <button
          onClick={isPlaying ? onStop : onPlay}
          disabled={isLoading}
          className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
            isLoading
              ? "bg-[var(--text-muted)] cursor-wait"
              : isPlaying
              ? "bg-[var(--accent-red)] hover:bg-[var(--accent-red)]/80 text-white"
              : "bg-[var(--accent-green)] hover:bg-[var(--accent-green)]/80 text-[var(--bg-primary)]"
          }`}
          title={isPlaying ? "Stop" : "Play"}
        >
          {isLoading ? (
            <span className="animate-pulse text-xs">...</span>
          ) : isPlaying ? (
            <StopIcon />
          ) : (
            <PlayIcon />
          )}
        </button>

        {/* Loop toggle */}
        <button
          onClick={onLoopToggle}
          className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
            loop
              ? "text-[var(--accent-blue)] bg-[var(--accent-blue)]/15"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
          title={loop ? "Loop: On" : "Loop: Off"}
        >
          <LoopIcon />
        </button>

        {/* Mixer toggle */}
        <button
          onClick={() => setShowMixer((prev) => !prev)}
          className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
            showMixer
              ? "text-[var(--accent-purple)] bg-[var(--accent-purple)]/15"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
          title="Toggle mixer"
        >
          <MixerIcon />
        </button>

        {/* BPM control */}
        <div className="flex items-center gap-3 ml-auto">
          <label className="text-sm text-[var(--text-secondary)]" htmlFor="bpm">
            BPM
          </label>
          <input
            id="bpm"
            type="range"
            min="40"
            max="240"
            value={bpm}
            onChange={(e) => onBpmChange(parseInt(e.target.value, 10))}
            className="w-32 accent-[var(--accent-blue)]"
          />
          <input
            type="number"
            min="40"
            max="240"
            value={bpm}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v >= 40 && v <= 240) onBpmChange(v);
            }}
            className="w-14 text-center text-sm bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded px-1 py-1 text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)]"
          />
        </div>
      </div>

      {/* Mixer panel */}
      {showMixer && (
        <div className="flex items-end gap-5 px-4 py-3 border-t border-[var(--border-color)] bg-[var(--bg-tertiary)]">
          <span className="text-xs text-[var(--text-muted)] self-center mr-1">
            Mix
          </span>
          {INSTRUMENT_ORDER.map((inst) => {
            const val = volumes[inst] ?? 0;
            return (
              <div key={inst} className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                  {val > 0 ? `+${val}` : val} dB
                </span>
                <input
                  type="range"
                  min="-20"
                  max="10"
                  step="1"
                  value={val}
                  onChange={(e) =>
                    onVolumeChange(inst, parseInt(e.target.value, 10))
                  }
                  className="w-20 accent-[var(--accent-purple)]"
                  title={`${INSTRUMENT_LABELS[inst]}: ${val} dB`}
                />
                <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                  {INSTRUMENT_LABELS[inst]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
