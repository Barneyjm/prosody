"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { tokenize, parseInstrumentPrefix, Token } from "@/lib/parser";

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
  activeNotes: ActiveNote[];
}

function tokenToClass(token: Token): string {
  switch (token.type) {
    case "note":
      return "text-[var(--accent-blue)]";
    case "rest":
      return "text-[var(--text-muted)]";
    case "chord":
      return "text-[var(--accent-purple)]";
    case "hit":
      return "text-[var(--accent-orange)]";
    case "invalid":
      return "text-[var(--accent-red)] underline decoration-wavy decoration-[var(--accent-red)]";
  }
}

function HighlightedLine({
  line,
  lineIndex,
  activeNotes,
}: {
  line: string;
  lineIndex: number;
  activeNotes: ActiveNote[];
}) {
  const { content, prefixLength } = useMemo(
    () => parseInstrumentPrefix(line),
    [line]
  );
  const tokens = useMemo(() => tokenize(content), [content]);
  const now = Date.now();

  const elements: React.ReactNode[] = [];

  // Render instrument prefix if present
  if (prefixLength > 0) {
    const prefix = line.slice(0, prefixLength);
    const colonIndex = prefix.indexOf(":");
    elements.push(
      <span key="prefix-name" className="text-[var(--accent-pink)] font-semibold">
        {prefix.slice(0, colonIndex + 1)}
      </span>
    );
    if (colonIndex + 1 < prefix.length) {
      elements.push(
        <span key="prefix-space" className="text-[var(--text-secondary)]">
          {prefix.slice(colonIndex + 1)}
        </span>
      );
    }
  }

  if (tokens.length === 0) {
    if (prefixLength > 0) {
      // Line has only a prefix and no notes
      return <>{elements}</>;
    }
    return <span className="text-[var(--text-muted)]">{line || " "}</span>;
  }

  // Rebuild the content with spans per token, preserving whitespace
  let pos = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const rawStart = content.indexOf(token.raw, pos);

    // Add any whitespace before this token
    if (rawStart > pos) {
      elements.push(
        <span key={`ws-${i}`} className="text-[var(--text-secondary)]">
          {content.slice(pos, rawStart)}
        </span>
      );
    }

    const isActive = activeNotes.some(
      (an) =>
        an.lineIndex === lineIndex &&
        an.tokenIndex === i &&
        now - an.timestamp < 300
    );

    elements.push(
      <span
        key={`tok-${i}`}
        className={`${tokenToClass(token)} transition-all duration-150 ${
          isActive
            ? "bg-white/20 rounded px-0.5 scale-105 font-bold"
            : ""
        }`}
      >
        {token.raw}
      </span>
    );

    pos = rawStart + token.raw.length;
  }

  // Trailing whitespace
  if (pos < content.length) {
    elements.push(
      <span key="trailing" className="text-[var(--text-secondary)]">
        {content.slice(pos)}
      </span>
    );
  }

  return <>{elements}</>;
}

export default function Editor({ value, onChange, activeNotes }: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const lines = value.split("\n");

  const handleScroll = useCallback(() => {
    if (textareaRef.current) {
      setScrollTop(textareaRef.current.scrollTop);
      setScrollLeft(textareaRef.current.scrollLeft);
    }
  }, []);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Sync scroll between textarea and highlight overlay
  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
    }
  }, [scrollTop, scrollLeft]);

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
        // Restore cursor position after React re-render
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        });
      }
    },
    [value, onChange]
  );

  return (
    <div className="flex-1 flex overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      {/* Line numbers */}
      <div
        className="flex-shrink-0 py-4 px-2 text-right select-none border-r border-[var(--border-color)] bg-[var(--bg-tertiary)]"
        style={{ minWidth: "3rem" }}
      >
        <div style={{ transform: `translateY(${-scrollTop}px)` }}>
          {lines.map((_, i) => (
            <div
              key={i}
              className="leading-6 text-sm h-6 flex items-center justify-end pr-1"
              style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Syntax highlighting overlay */}
        <div
          ref={highlightRef}
          className="absolute inset-0 py-4 px-4 pointer-events-none overflow-hidden whitespace-pre font-mono text-sm leading-6"
          aria-hidden="true"
        >
          {lines.map((line, i) => (
            <div
              key={i}
              className="h-6 flex items-center"
              style={{
                borderLeft: `2px solid ${
                  LINE_COLORS[i % LINE_COLORS.length]
                }15`,
                paddingLeft: "0.5rem",
              }}
            >
              <HighlightedLine
                line={line}
                lineIndex={i}
                activeNotes={activeNotes}
              />
            </div>
          ))}
        </div>

        {/* Actual textarea (transparent text, visible caret) */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          className="absolute inset-0 w-full h-full py-4 px-4 bg-transparent text-transparent caret-[var(--accent-blue)] resize-none outline-none font-mono text-sm leading-6 overflow-auto"
          style={{
            paddingLeft: "calc(1rem + 0.5rem + 2px)",
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          placeholder="Start typing notes... e.g. piano: C4 E4 G4 C5"
        />
      </div>
    </div>
  );
}
