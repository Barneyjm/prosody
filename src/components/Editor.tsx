"use client";

import React, { useCallback, useRef, useState } from "react";

const LINE_COLORS = [
  "var(--line-color-1)",
  "var(--line-color-2)",
  "var(--line-color-3)",
  "var(--line-color-4)",
  "var(--line-color-5)",
  "var(--line-color-6)",
  "var(--line-color-7)",
  "var(--line-color-8)",
];

interface ActiveNote {
  lineIndex: number;
  tokenIndex: number;
  timestamp: number;
}

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  activeNotes: ActiveNote[];
}

export default function Editor({ value, onChange, onClear, activeNotes }: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const lines = value.split("\n");

  // Build set of line indices that have an active note right now
  const now = Date.now();
  const activeLines = new Set(
    activeNotes
      .filter((n) => now - n.timestamp < 300)
      .map((n) => n.lineIndex)
  );

  const handleScroll = useCallback(() => {
    if (textareaRef.current) {
      setScrollTop(textareaRef.current.scrollTop);
    }
  }, []);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Handle tab key for indentation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue =
          value.substring(0, start) + "  " + value.substring(end);
        onChange(newValue);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        });
      }
    },
    [value, onChange]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <div className="flex-1 flex overflow-hidden">
        {/* Line numbers */}
        <div
          className="flex-shrink-0 py-4 px-1 sm:px-2 text-right select-none border-r border-[var(--border-color)] bg-[var(--bg-tertiary)]"
          style={{ minWidth: "2.5rem" }}
        >
          <div style={{ transform: `translateY(${-scrollTop}px)` }}>
            {lines.map((_, i) => {
              const color = LINE_COLORS[i % LINE_COLORS.length];
              const isActive = activeLines.has(i);
              return (
                <div
                  key={i}
                  className={`leading-6 text-xs sm:text-sm h-6 flex items-center justify-end pr-1 transition-all duration-150 ${
                    isActive ? "font-bold" : ""
                  }`}
                  style={{
                    color,
                    textShadow: isActive
                      ? `0 0 8px ${color}, 0 0 16px ${color}`
                      : "none",
                  }}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>
        </div>

        {/* Plain textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          className="flex-1 py-4 px-2 sm:px-4 bg-transparent text-[var(--text-primary)] caret-[var(--accent-blue)] resize-none outline-none font-mono text-sm leading-6 overflow-auto"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          placeholder="Start typing notes... e.g. piano: C4 E4 G4 C5"
        />
      </div>

      {/* Clear button — shown when there's text */}
      {value.length > 0 && (
        <div className="flex items-center justify-end px-2 sm:px-3 py-1.5 border-t border-[var(--border-color)] bg-[var(--bg-tertiary)]">
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10"
            title="Clear all text"
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
