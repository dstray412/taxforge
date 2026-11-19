import { useMemo, useState } from "react";
import type { TaxResult, TraceLine } from "../../engine";
import { money } from "../format";
import { StatusGlyph } from "./ResultsHeader";

const SECTION_ORDER = ["income", "adjustments", "deductions", "tax", "credits", "other_taxes", "payments"];
const SECTION_LABEL: Record<string, string> = {
  income: "Income",
  adjustments: "Adjustments to income",
  deductions: "Deductions",
  tax: "Tax computation",
  credits: "Credits",
  other_taxes: "Other taxes",
  payments: "Payments",
};

function titleCase(s: string): string {
  const t = s.replace(/[_-]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function WorksheetView({ result }: { result: TaxResult }) {
  const [onlyWarn, setOnlyWarn] = useState(false);
  const [expandAll, setExpandAll] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, TraceLine[]>();
    for (const line of result.trace ?? []) {
      if (onlyWarn && line.severity !== "warn") continue;
      const key = line.section || "other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(line);
    }
    const keys = [...map.keys()].sort((a, b) => {
      const ia = SECTION_ORDER.indexOf(a);
      const ib = SECTION_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    return keys.map((k) => ({ key: k, label: SECTION_LABEL[k] ?? titleCase(k), lines: map.get(k)! }));
  }, [result.trace, onlyWarn]);

  const warnCount = (result.trace ?? []).filter((l) => l.severity === "warn").length;

  return (
    <div className="worksheet">
      {result.warnings.length > 0 && (
        <div className="callout callout--warn" role="note" aria-label="Warnings">
          <StatusGlyph tone="warn" />
          <div>
            <strong>
              {result.warnings.length} {result.warnings.length === 1 ? "thing" : "things"} to check
            </strong>
            <ul>
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="toolbar">
        <span className="toolbar__meta">
          {(result.trace ?? []).length} lines{warnCount ? ` · ${warnCount} flagged` : ""}
        </span>
        <div className="toolbar__actions">
          <label className="check">
            <input type="checkbox" checked={onlyWarn} onChange={(e) => setOnlyWarn(e.target.checked)} />
            Flagged only
          </label>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setExpandAll((v) => !v)}>
            {expandAll ? "Collapse notes" : "Expand notes"}
          </button>
        </div>
      </div>

      {groups.length === 0 && <p className="empty">No worksheet lines{onlyWarn ? " are flagged" : ""}.</p>}

      {groups.map((g) => (
        <section key={g.key} className="ws-group" aria-labelledby={`ws-${g.key}`}>
          <h3 id={`ws-${g.key}`} className="ws-group__title">
            {g.label}
          </h3>
          <ul className="ws-lines">
            {g.lines.map((line, i) => (
              <TraceRow key={`${line.id}-${i}`} line={line} forceOpen={expandAll} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TraceRow({ line, forceOpen }: { line: TraceLine; forceOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  const warn = line.severity === "warn";
  const noteId = `note-${line.id}`;
  const content = (
    <>
      <span className="ws-line__label">
        {warn && <StatusGlyph tone="warn" />}
        {line.label}
        {warn && <span className="sr-only"> (flagged)</span>}
      </span>
      <span className="ws-line__ref">{line.ref ?? ""}</span>
      <span className="ws-line__amt num">{money(line.amount)}</span>
    </>
  );
  return (
    <li className={`ws-line${warn ? " ws-line--warn" : ""}${isOpen ? " is-open" : ""}`}>
      {line.note ? (
        <button
          type="button"
          className="ws-line__row"
          aria-expanded={isOpen}
          aria-controls={noteId}
          onClick={() => setOpen((o) => !o)}
        >
          <svg className="ws-line__chev" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
          {content}
        </button>
      ) : (
        <div className="ws-line__row">
          <span className="ws-line__chev" aria-hidden="true" />
          {content}
        </div>
      )}
      {line.note && (
        <p id={noteId} className="ws-line__note" hidden={!isOpen}>
          {line.note}
        </p>
      )}
    </li>
  );
}
