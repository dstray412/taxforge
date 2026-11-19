import { useMemo, useState } from "react";
import { getParams } from "../../engine";
import type { TaxResult } from "../../engine";
import { money, moneyCompact, pct, ratePct } from "../format";
import { composition, worksheetAdjustment } from "../derive";
import { useElementWidth } from "../hooks/useElementWidth";
import { ChartTooltip } from "./Tooltip";

export function BreakdownView({ result }: { result: TaxResult }) {
  return (
    <div className="breakdown">
      <CompositionCard result={result} />
      <BracketFillCard result={result} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tax composition: stacked horizontal bar, credits offset, net total  */
/* ------------------------------------------------------------------ */

function CompositionCard({ result }: { result: TaxResult }) {
  const parts = composition(result);
  const adj = worksheetAdjustment(result);
  // Bar segments: regularTax is authoritative, so the ordinary segment absorbs the worksheet
  // adjustment (the legend table still shows the raw components plus the adjustment line).
  const live = parts
    .map((p) => (p.key === "ord" && adj !== 0 ? { ...p, amount: Math.max(0, p.amount + adj) } : p))
    .filter((p) => p.amount > 0.5);
  const gross = live.reduce((a, p) => a + p.amount, 0);
  const credits = Math.max(0, result.credits.totalNonrefundable);
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ key: string; x: number } | null>(null);

  const scale = Math.max(gross, 1);
  let cursor = 0;
  const segs = live.map((p) => {
    const s = { ...p, x0: cursor / scale, x1: (cursor + p.amount) / scale };
    cursor += p.amount;
    return s;
  });
  const creditFrac = Math.min(1, credits / scale);
  const hovered = hover ? segs.find((s) => s.key === hover.key) : null;

  return (
    <section className="card" aria-labelledby="comp-title">
      <header className="card__head">
        <div>
          <h2 id="comp-title" className="card__title">
            What your tax is made of
          </h2>
          <p className="card__desc">Each tax before credits, then nonrefundable credits taken off.</p>
        </div>
        <span className="card__meta num">{money(result.totalTax)} total</span>
      </header>

      {gross <= 0.5 ? (
        <p className="empty">No federal tax at these inputs.</p>
      ) : (
        <div className="comp" ref={wrapRef} onPointerLeave={() => setHover(null)}>
          <div className="comp__row">
            <span className="comp__rowlabel">Before credits</span>
            <div className="comp__track" role="list" aria-label="Tax before credits by type">
              {segs.map((s, i) => (
                <div
                  key={s.key}
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${s.label}: ${money(s.amount)}, ${pct(s.amount / gross)} of tax before credits`}
                  className={`comp__seg${i === segs.length - 1 ? " is-end" : ""}${hover?.key === s.key ? " is-hover" : ""}`}
                  style={{ left: `${s.x0 * 100}%`, width: `${(s.x1 - s.x0) * 100}%`, background: s.color }}
                  onPointerMove={(e) => {
                    const box = wrapRef.current?.getBoundingClientRect();
                    if (box) setHover({ key: s.key, x: e.clientX - box.left });
                  }}
                  onFocus={() => setHover({ key: s.key, x: ((s.x0 + s.x1) / 2) * width * 0.8 + width * 0.2 })}
                  onBlur={() => setHover(null)}
                />
              ))}
            </div>
            <span className="comp__value num">{money(gross)}</span>
          </div>
          {credits > 0.5 && (
            <div className="comp__row">
              <span className="comp__rowlabel">Credits</span>
              <div className="comp__track">
                <div
                  className="comp__credit"
                  style={{ left: `${(1 - creditFrac) * 100}%`, width: `${creditFrac * 100}%` }}
                  aria-hidden="true"
                />
              </div>
              <span className="comp__value num">{"−"}{money(credits)}</span>
            </div>
          )}
          <div className="comp__row comp__row--net">
            <span className="comp__rowlabel">Total tax</span>
            <div className="comp__track">
              <div
                className="comp__net"
                style={{ width: `${Math.max(0, Math.min(1, result.totalTax / scale)) * 100}%` }}
                aria-hidden="true"
              />
            </div>
            <span className="comp__value num">{money(result.totalTax)}</span>
          </div>
          {hovered && hover && (
            <ChartTooltip
              x={hover.x}
              y={22}
              containerWidth={width}
              title={hovered.label}
              rows={[
                { key: "amt", label: "amount", value: money(hovered.amount), color: hovered.color, shape: "rect" },
                { key: "share", label: "of tax before credits", value: pct(hovered.amount / gross) },
              ]}
            />
          )}
        </div>
      )}

      <table className="legend-table">
        <caption className="sr-only">Tax composition values</caption>
        <thead>
          <tr>
            <th scope="col">Component</th>
            <th scope="col" className="num">
              Amount
            </th>
            <th scope="col" className="num">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {parts.map((p) => (
            <tr key={p.key} className={p.amount > 0.5 ? "" : "is-muted"}>
              <th scope="row">
                <span className="viz-key viz-key--rect" style={{ background: p.color }} />
                {p.label}
              </th>
              <td className="num">{money(p.amount)}</td>
              <td className="num">{gross > 0.5 ? pct(p.amount / gross) : "—"}</td>
            </tr>
          ))}
          {adj !== 0 && (
            <tr>
              <th scope="row" title="Ordinary tax plus capital gains tax differs from the regular tax on Form 1040 line 16 because the all-ordinary computation was lower">
                <span className="viz-key viz-key--rect" style={{ background: "transparent" }} />
                Worksheet adjustment
              </th>
              <td className="num">{adj > 0 ? money(adj) : `\u2212${money(-adj)}`}</td>
              <td className="num" />
            </tr>
          )}
          <tr className={credits > 0.5 ? "" : "is-muted"}>
            <th scope="row">
              <span className="viz-key viz-key--rect viz-key--credit" />
              Nonrefundable credits
            </th>
            <td className="num">{credits > 0.5 ? `−${money(credits)}` : money(0)}</td>
            <td className="num" />
          </tr>
          <tr className="is-total">
            <th scope="row">Total tax</th>
            <td className="num">{money(result.totalTax)}</td>
            <td className="num" />
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Bracket fill                                                        */
/* ------------------------------------------------------------------ */

interface BracketRow {
  rate: number;
  lo: number;
  hi: number;
  ordinaryIn: number;
  gainsIn: number;
  taxOnOrdinary: number;
  width: number; // bracket span used for the track (top bracket gets a visual span)
}

function BracketFillCard({ result }: { result: TaxResult }) {
  const year = result.input.taxYear;
  const status = result.input.filingStatus;
  const params = getParams(year);
  const brackets = params.brackets[status];
  const lt = params.ltcgBreakpoints[status];

  const preferential = Math.max(
    0,
    (result.capitalGains.taxedAt0 || 0) + (result.capitalGains.taxedAt15 || 0) + (result.capitalGains.taxedAt20 || 0),
  );
  const ordinary = Math.max(0, result.taxableIncome - preferential);
  const stackTop = ordinary + preferential;

  const rows = useMemo<BracketRow[]>(() => {
    let lo = 0;
    const out: BracketRow[] = [];
    let lastSpan = 50_000;
    for (const b of brackets) {
      const hi = b.upTo;
      const finite = Number.isFinite(hi);
      const span = finite ? hi - lo : Math.max(lastSpan, stackTop - lo, 1);
      const ordinaryIn = Math.max(0, Math.min(ordinary, finite ? hi : Infinity) - lo);
      const gainsIn = Math.max(0, Math.min(stackTop, finite ? hi : Infinity) - Math.max(lo, ordinary));
      out.push({ rate: b.rate, lo, hi, ordinaryIn, gainsIn, taxOnOrdinary: ordinaryIn * b.rate, width: span });
      if (finite) {
        lastSpan = span;
        lo = hi;
      }
    }
    return out;
  }, [brackets, ordinary, stackTop]);

  const [hover, setHover] = useState<number | null>(null);

  return (
    <section className="card" aria-labelledby="bf-title">
      <header className="card__head">
        <div>
          <h2 id="bf-title" className="card__title">
            How taxable income fills the brackets
          </h2>
          <p className="card__desc">
            {year} {status.toUpperCase()} schedule. Ordinary income fills from the bottom; qualified dividends and
            long-term gains stack on top and are taxed at 0 / 15 / 20%.
          </p>
        </div>
        <div className="legend" aria-label="Legend">
          <span className="legend__item">
            <span className="viz-key viz-key--rect" style={{ background: "var(--series-1)" }} />
            Ordinary income
          </span>
          <span className="legend__item">
            <span className="viz-key viz-key--rect" style={{ background: "var(--series-2)" }} />
            Gains stacked on top
          </span>
        </div>
      </header>

      <table className="brackets" onPointerLeave={() => setHover(null)}>
        <caption className="sr-only">Taxable income in each bracket</caption>
        <thead>
          <tr>
            <th scope="col">Rate</th>
            <th scope="col">Range</th>
            <th scope="col" className="brackets__barcol">
              <span className="sr-only">Fill</span>
            </th>
            <th scope="col" className="num">
              In bracket
            </th>
            <th scope="col" className="num">
              Tax at rate
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const fo = Math.min(1, r.ordinaryIn / r.width);
            const fg = Math.min(1 - fo, r.gainsIn / r.width);
            const active = r.ordinaryIn > 0 || r.gainsIn > 0;
            const isTop = Math.abs(r.rate - result.topBracket) < 1e-9 && r.ordinaryIn > 0;
            return (
              <tr
                key={i}
                className={`${active ? "is-active" : "is-empty"}${isTop ? " is-top" : ""}${hover === i ? " is-hover" : ""}`}
                onPointerEnter={() => setHover(i)}
              >
                <th scope="row" className="brackets__rate num">
                  {ratePct(r.rate)}
                  {isTop && <span className="tag">Your top</span>}
                </th>
                <td className="brackets__range num">
                  {Number.isFinite(r.hi) ? `${moneyCompact(r.lo)}–${moneyCompact(r.hi)}` : `${moneyCompact(r.lo)} and up`}
                </td>
                <td className="brackets__barcol">
                  <div className="bfill" aria-hidden="true">
                    {fo > 0 && (
                      <span
                        className={`bfill__seg${fg > 0 ? "" : " is-end"}`}
                        style={{ left: 0, width: `${fo * 100}%`, background: "var(--series-1)" }}
                      />
                    )}
                    {fg > 0 && (
                      <span
                        className="bfill__seg is-end"
                        style={{
                          left: `calc(${fo * 100}% + ${fo > 0 ? 2 : 0}px)`,
                          width: `calc(${fg * 100}% - ${fo > 0 ? 2 : 0}px)`,
                          background: "var(--series-2)",
                        }}
                      />
                    )}
                  </div>
                </td>
                <td className="num">
                  {money(r.ordinaryIn)}
                  {r.gainsIn > 0.5 && <span className="brackets__gains"> + {money(r.gainsIn)} gains</span>}
                </td>
                <td className="num">{money(r.taxOnOrdinary)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="card__foot">
        Long-term rate thresholds for {status.toUpperCase()}: 0% to {money(lt.zeroUpTo)}, 15% to {money(lt.fifteenUpTo)},
        20% above. Taxable income {money(result.taxableIncome)}, of which {money(preferential)} is taxed at
        preferential rates.
      </p>
    </section>
  );
}
