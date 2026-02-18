import { readFileSync } from "fs";
import { join } from "path";
import { marked } from "marked";
import CopyButton from "./CopyButton";

export const metadata = {
  title: "Prosody — Reference",
  description: "Quick reference for the Prosody music notation language.",
};

export default function ReferencePage() {
  const raw = readFileSync(join(process.cwd(), "REFERENCE.md"), "utf-8");
  const html = marked.parse(raw) as string;

  return (
    <>
      <style>{`
        .prose h1 { font-size: 1.6rem; font-weight: 700; color: var(--text-primary); margin: 1.5rem 0 0.75rem; }
        .prose h2 { font-size: 1.15rem; font-weight: 600; color: var(--accent-blue); margin: 2rem 0 0.6rem; padding-bottom: 0.3rem; border-bottom: 1px solid var(--border-color); }
        .prose h3 { font-size: 0.95rem; font-weight: 600; color: var(--accent-purple); margin: 1.25rem 0 0.4rem; }
        .prose p  { color: var(--text-secondary); line-height: 1.65; margin: 0.5rem 0; }
        .prose ul, .prose ol { color: var(--text-secondary); padding-left: 1.4rem; margin: 0.5rem 0; }
        .prose li { margin: 0.2rem 0; line-height: 1.6; }
        .prose strong { color: var(--text-primary); font-weight: 600; }
        .prose code { font-family: inherit; font-size: 0.85em; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 3px; padding: 0.1em 0.35em; color: var(--accent-pink); }
        .prose pre { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 1rem 1.25rem; margin: 0.75rem 0; overflow-x: auto; }
        .prose pre code { background: none; border: none; padding: 0; color: var(--text-primary); font-size: 0.82rem; line-height: 1.55; }
        .prose table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.875rem; }
        .prose th { text-align: left; padding: 0.45rem 0.75rem; background: var(--bg-tertiary); color: var(--text-primary); font-weight: 600; border: 1px solid var(--border-color); }
        .prose td { padding: 0.4rem 0.75rem; color: var(--text-secondary); border: 1px solid var(--border-color); }
        .prose tr:nth-child(even) td { background: var(--bg-secondary); }
        .prose td code, .prose th code { font-size: 0.82em; }
        .prose a { color: var(--accent-blue); text-decoration: none; }
        .prose a:hover { text-decoration: underline; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
        {/* Header */}
        <div style={{
          borderBottom: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
          padding: "0.75rem 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            <a
              href="/"
              style={{ color: "var(--text-muted)", fontSize: "0.8rem", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back to Prosody
            </a>
            <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "0.95rem" }}>
              Quick Reference
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3rem" }}>
            <CopyButton content={raw} />
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
              Not sure how to write? Paste this into your LLM to get started.
            </span>
          </div>
        </div>

        {/* Content */}
        <div
          className="prose"
          style={{ maxWidth: "760px", margin: "0 auto", padding: "2rem 2rem 4rem" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </>
  );
}
