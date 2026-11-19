import { useEffect, useRef, useState } from "react";
import { useScenarios } from "../hooks/useScenarios";
import { FILING_STATUS_SHORT } from "../format";
import type { Theme } from "../hooks/useTheme";

export function TopBar({
  theme,
  onToggleTheme,
  onPrint,
  onExport,
  onImportFile,
}: {
  theme: Theme;
  onToggleTheme(): void;
  onPrint(): void;
  onExport(): void;
  onImportFile(f: File): void;
}) {
  const { scenarios, active, select, add, duplicate, rename, remove } = useScenarios();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (editing) editRef.current?.select();
  }, [editing]);

  function startRename(id: string) {
    const s = scenarios.find((x) => x.id === id);
    if (!s) return;
    setDraft(s.name);
    setEditing(id);
  }
  function finishRename(save: boolean) {
    if (editing && save) rename(editing, draft);
    const id = editing;
    setEditing(null);
    if (id) window.setTimeout(() => tabRefs.current[id]?.focus(), 0);
  }

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <svg className="logo" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="6" className="logo__bg" />
          <path d="M7 8h10M7 12h6M7 16h3" className="logo__ink" />
          <circle cx="16.5" cy="16" r="1.75" className="logo__spark" />
        </svg>
        <span className="topbar__name">TaxForge</span>
        <span className="topbar__tag">Federal planner</span>
      </div>

      <nav className="scenarios" aria-label="Scenarios">
        <div
          className="scenarios__tabs"
          role="tablist"
          aria-label="Scenarios"
          onKeyDown={(e) => {
            if (editing) return;
            const i = scenarios.findIndex((s) => s.id === active.id);
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              const n = scenarios[(i + (e.key === "ArrowRight" ? 1 : -1) + scenarios.length) % scenarios.length];
              select(n.id);
              tabRefs.current[n.id]?.focus();
            } else if (e.key === "F2") {
              e.preventDefault();
              startRename(active.id);
            }
          }}
        >
          {scenarios.map((s) =>
            editing === s.id ? (
              <input
                key={s.id}
                ref={editRef}
                className="scenario-tab scenario-tab--edit"
                aria-label="Scenario name"
                value={draft}
                maxLength={48}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => finishRename(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishRename(true);
                  if (e.key === "Escape") finishRename(false);
                }}
              />
            ) : (
              <button
                key={s.id}
                ref={(el) => {
                  tabRefs.current[s.id] = el;
                }}
                type="button"
                role="tab"
                aria-selected={s.id === active.id}
                tabIndex={s.id === active.id ? 0 : -1}
                className="scenario-tab"
                title="Double-click or press F2 to rename"
                onClick={() => select(s.id)}
                onDoubleClick={() => startRename(s.id)}
              >
                <span className="scenario-tab__name">{s.name}</span>
                <span className="scenario-tab__meta">
                  {s.input.taxYear} {FILING_STATUS_SHORT[s.input.filingStatus]}
                </span>
              </button>
            ),
          )}
        </div>
        <div className="scenarios__actions">
          <IconButton label="Add scenario" onClick={add} d="M8 3.5v9M3.5 8h9" />
          <IconButton label="Duplicate scenario" onClick={() => duplicate()} d="M5.5 5.5V3.5h7v7h-2M3.5 5.5h7v7h-7z" />
          <IconButton label="Rename scenario" onClick={() => startRename(active.id)} d="M3.5 12.5h2l6.5-6.5-2-2-6.5 6.5v2zM9 5l2 2" />
          <IconButton
            label="Delete scenario"
            disabled={scenarios.length <= 1}
            onClick={() => {
              if (window.confirm(`Delete "${active.name}"? This cannot be undone.`)) remove(active.id);
            }}
            d="M4 5h8M6.5 5V3.5h3V5M5 5l.5 7.5h5L11 5"
          />
        </div>
      </nav>

      <div className="topbar__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onPrint}>
          Print summary
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onExport}>
          Export JSON
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()}>
          Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "dark" ? "Light theme" : "Dark theme"}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="3" />
              <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}

function IconButton({ label, onClick, d, disabled }: { label: string; onClick(): void; d: string; disabled?: boolean }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  );
}
