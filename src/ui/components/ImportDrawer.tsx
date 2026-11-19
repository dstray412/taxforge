import { useMemo, useRef, useState } from "react";
import { parse1099B, summarizeLots } from "../../engine";
import type { BrokerImportResult, BrokerLot, CapitalGainsSummary } from "../../engine";
import { money } from "../format";
import { useScenarios } from "../hooks/useScenarios";
import { Drawer } from "./Drawer";
import { StatusGlyph } from "./ResultsHeader";

type SortKey = "row" | "description" | "dateAcquired" | "dateSold" | "proceeds" | "costBasis" | "washSaleDisallowed" | "gain" | "term";

const SAMPLE = `Description,Date Acquired,Date Sold,Proceeds,Cost Basis,Wash Sale Loss Disallowed,Term
100 SH AAPL,2024-03-11,2026-02-02,22850.00,17320.00,0,Long
50 SH NVDA,2026-01-05,2026-06-18,7105.50,7810.00,0,Short
25 SH TSLA,2026-04-01,2026-05-10,4120.00,5005.00,310.00,Short
10 SPX 5000C,2026-03-01,2026-03-15,9800.00,6200.00,0,Short`;

function lotTerm(l: BrokerLot): "short" | "long" | "inherited" | "—" {
  // Inherited property is always long-term regardless of holding period.
  if (l.inherited) return "inherited";
  if (l.term) return l.term;
  if (l.dateAcquired === "VARIOUS" || !l.dateSold) return "—";
  const a = new Date(l.dateAcquired);
  const s = new Date(l.dateSold);
  if (Number.isNaN(a.getTime()) || Number.isNaN(s.getTime())) return "—";
  const oneYear = new Date(a);
  oneYear.setFullYear(oneYear.getFullYear() + 1);
  return s > oneYear ? "long" : "short";
}

const lotGain = (l: BrokerLot) => l.proceeds - l.costBasis + (l.washSaleDisallowed || 0);

export function ImportDrawer({ open, onClose }: { open: boolean; onClose(): void }) {
  const { active, update } = useScenarios();
  const year = active.input.taxYear;
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "row", dir: 1 });
  const [applied, setApplied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo<{ res: BrokerImportResult | null; summary: CapitalGainsSummary | null; error: string | null }>(() => {
    if (!text.trim()) return { res: null, summary: null, error: null };
    try {
      const res = parse1099B(text);
      return { res, summary: summarizeLots(res.lots, year), error: null };
    } catch (e) {
      return { res: null, summary: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [text, year]);

  const lots = useMemo(() => {
    const ls = [...(parsed.res?.lots ?? [])];
    const val = (l: BrokerLot): string | number => {
      switch (sort.key) {
        case "gain":
          return lotGain(l);
        case "term":
          return lotTerm(l);
        default:
          return (l[sort.key] ?? "") as string | number;
      }
    };
    ls.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
    });
    return ls;
  }, [parsed.res, sort]);

  async function readFile(f: File) {
    setFileName(f.name);
    setApplied(null);
    setText(await f.text());
  }

  function apply() {
    const s = parsed.summary;
    if (!s) return;
    update((d) => {
      d.investments.netShortTermGain = Math.round(s.netShortTerm * 100) / 100;
      d.investments.netLongTermGain = Math.round(s.netLongTerm * 100) / 100;
      d.investments.section1256Gain = Math.round(s.section1256Net * 100) / 100;
    });
    setApplied(`Applied to "${active.name}": short-term ${money(s.netShortTerm)}, long-term ${money(s.netLongTerm)}, Section 1256 ${money(s.section1256Net)}.`);
  }

  const SortTh = ({ k, children, num }: { k: SortKey; children: string; num?: boolean }) => (
    <th scope="col" className={num ? "num" : undefined} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="sort-btn"
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }))}
      >
        {children}
        <span className="sort-btn__arrow" aria-hidden="true">
          {sort.key === k ? (sort.dir === 1 ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );

  const s = parsed.summary;
  const res = parsed.res;
  const LIMIT = 1000;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Import 1099-B"
      wide
      footer={
        <>
          <span className="drawer__foot-note">
            {s ? `${s.lotCount} lots sold in ${year}` : "Nothing parsed yet"}
          </span>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn--primary" disabled={!s || s.lotCount === 0} onClick={apply}>
            Apply to return
          </button>
        </>
      }
    >
      <div
        className={`dropzone${dragging ? " is-drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void readFile(f);
        }}
      >
        <label htmlFor="csv-text" className="field__label">
          Paste CSV or drop a file
        </label>
        <textarea
          id="csv-text"
          className="input textarea"
          rows={7}
          spellCheck={false}
          placeholder="Description,Date Acquired,Date Sold,Proceeds,Cost Basis,Wash Sale Loss Disallowed,Term"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileName(null);
            setApplied(null);
          }}
        />
        <div className="dropzone__actions">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => fileRef.current?.click()}>
            Choose file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setText(SAMPLE);
              setFileName("sample.csv");
              setApplied(null);
            }}
          >
            Load sample
          </button>
          {text && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setText("");
                setFileName(null);
                setApplied(null);
              }}
            >
              Clear
            </button>
          )}
          <span className="muted">{fileName ?? "Webull, Robinhood, Fidelity, Schwab, E*TRADE, thinkorswim, IBKR, Form 8949"}</span>
        </div>
      </div>

      <p className="callout callout--info">
        <StatusGlyph tone="warn" />
        <span>
          Wash sales are taken as your broker reported them (code W). The engine does not match wash sales across
          brokers or accounts, including IRAs; check those yourself.
        </span>
      </p>

      {parsed.error && <p className="callout callout--bad">Could not read this file: {parsed.error}</p>}
      {applied && (
        <p className="callout callout--good" role="status">
          <StatusGlyph tone="good" />
          {applied}
        </p>
      )}

      {res && (
        <>
          {Object.keys(res.detectedColumns).length > 0 && (
            <section className="import-sec">
              <h3 className="subheading">Detected columns</h3>
              <ul className="colmap">
                {Object.entries(res.detectedColumns).map(([field, header]) => (
                  <li key={field}>
                    <span className="colmap__field">{field}</span>
                    <span className="colmap__arrow" aria-hidden="true">
                      {"←"}
                    </span>
                    <span className="colmap__header">{header}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {s && (
            <section className="import-sec">
              <h3 className="subheading">{year} summary</h3>
              <table className="summary-table">
                <thead>
                  <tr>
                    <th scope="col">Term</th>
                    <th scope="col" className="num">
                      Proceeds
                    </th>
                    <th scope="col" className="num">
                      Basis
                    </th>
                    <th scope="col" className="num">
                      Wash adj.
                    </th>
                    <th scope="col" className="num">
                      Net
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Short-term</th>
                    <td className="num">{money(s.shortTermProceeds)}</td>
                    <td className="num">{money(s.shortTermBasis)}</td>
                    <td className="num">{money(s.shortTermWashAdjustments)}</td>
                    <td className="num strong">{money(s.netShortTerm)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Long-term</th>
                    <td className="num">{money(s.longTermProceeds)}</td>
                    <td className="num">{money(s.longTermBasis)}</td>
                    <td className="num">{money(s.longTermWashAdjustments)}</td>
                    <td className="num strong">{money(s.netLongTerm)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Section 1256</th>
                    <td className="num" colSpan={3}>
                      <span className="muted">Split 60% long / 40% short on Form 6781</span>
                    </td>
                    <td className="num strong">{money(s.section1256Net)}</td>
                  </tr>
                </tbody>
              </table>
              {s.potentialWashSales > 0 && (
                <p className="callout callout--warn">
                  <StatusGlyph tone="warn" />
                  {s.potentialWashSales} {s.potentialWashSales === 1 ? "lot looks" : "lots look"} like a possible wash
                  sale not flagged by the broker. Review before filing.
                </p>
              )}
              {res.lots.length > s.lotCount && (
                <p className="muted small">
                  {res.lots.length - s.lotCount} parsed lots were sold outside {year} and are excluded from the summary.
                </p>
              )}
            </section>
          )}

          {res.errors.length > 0 && (
            <section className="import-sec">
              <h3 className="subheading">
                {res.errors.length} {res.errors.length === 1 ? "row" : "rows"} skipped
              </h3>
              <ul className="err-list">
                {res.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    <span className="err-list__row num">Row {e.row}</span>
                    {e.message}
                  </li>
                ))}
                {res.errors.length > 50 && <li className="muted">and {res.errors.length - 50} more</li>}
              </ul>
            </section>
          )}

          {lots.length > 0 && (
            <section className="import-sec">
              <h3 className="subheading">
                Lots <span className="muted">({lots.length})</span>
              </h3>
              <div className="lot-scroll">
                <table className="lot-table">
                  <thead>
                    <tr>
                      <SortTh k="row" num>
                        Row
                      </SortTh>
                      <SortTh k="description">Description</SortTh>
                      <SortTh k="dateAcquired">Acquired</SortTh>
                      <SortTh k="dateSold">Sold</SortTh>
                      <SortTh k="proceeds" num>
                        Proceeds
                      </SortTh>
                      <SortTh k="costBasis" num>
                        Basis
                      </SortTh>
                      <SortTh k="washSaleDisallowed" num>
                        Wash
                      </SortTh>
                      <SortTh k="gain" num>
                        Gain
                      </SortTh>
                      <SortTh k="term">Term</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.slice(0, LIMIT).map((l) => {
                      const g = lotGain(l);
                      const outOfYear = !l.dateSold.startsWith(String(year));
                      return (
                        <tr key={l.row} className={outOfYear ? "is-muted" : ""}>
                          <td className="num">{l.row}</td>
                          <td className="lot-desc" title={l.description}>
                            {l.description}
                          </td>
                          <td className="num">{l.dateAcquired}</td>
                          <td className="num">{l.dateSold}</td>
                          <td className="num">{money(l.proceeds)}</td>
                          <td className="num">{money(l.costBasis)}</td>
                          <td className="num">{l.washSaleDisallowed ? money(l.washSaleDisallowed) : ""}</td>
                          <td className={`num ${g < 0 ? "neg" : ""}`}>{money(g)}</td>
                          <td>
                            {l.section1256 ? (
                              <span className="tag">1256</span>
                            ) : lotTerm(l) === "inherited" ? (
                              <span className="tag tag--long">Inherited</span>
                            ) : (
                              <span className={`tag tag--${lotTerm(l)}`}>{lotTerm(l)}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {lots.length > LIMIT && <p className="muted small">Showing the first {LIMIT} lots. All lots count in the summary.</p>}
            </section>
          )}
        </>
      )}
    </Drawer>
  );
}
