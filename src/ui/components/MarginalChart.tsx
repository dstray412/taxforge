import { useMemo, useState } from "react";
import { sweepLongTermGains, sweepOrdinaryIncome } from "../../engine";
import type { SweepPoint, TaxResult } from "../../engine";
import { money, moneyCompact, pct } from "../format";
import { useElementWidth } from "../hooks/useElementWidth";
import { Segmented } from "./fields";
import { ChartTooltip } from "./Tooltip";

type Mode = "ordinary" | "ltcg";

const H = 320;
const M = { top: 18, right: 84, bottom: 34, left: 48 };
const MAX_POINTS = 400;

function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

export function MarginalChart({ result }: { result: TaxResult }) {
  const [mode, setMode] = useState<Mode>("ordinary");
  const base = result.input;
  const current = mode === "ordinary" ? base.w2.wages : Math.max(0, base.investments.netLongTermGain);
  const to = Math.max(300_000, 2 * current);
  const step = Math.max(2_500, Math.ceil(to / MAX_POINTS / 2_500) * 2_500);

  const sweep = useMemo<{ points: SweepPoint[]; error: string | null }>(() => {
    try {
      const pts = mode === "ordinary" ? sweepOrdinaryIncome(base, 0, to, step) : sweepLongTermGains(base, 0, to, step);
      return { points: pts.filter((p: SweepPoint) => Number.isFinite(p.income)), error: null };
    } catch (e) {
      return { points: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [base, mode, to, step]);

  const [wrapRef, width] = useElementWidth<HTMLDivElement>(720);
  const [idx, setIdx] = useState<number | null>(null);

  const pts = sweep.points;
  const W = Math.max(320, width);
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const geo = useMemo(() => {
    if (pts.length < 2) return null;
    const xMax = pts[pts.length - 1].income || 1;
    const rates = pts.flatMap((p) => [p.marginalRate, p.effectiveRate]).filter(Number.isFinite);
    const rawMax = Math.max(0.1, ...rates);
    const rawMin = Math.min(0, ...rates);
    const yMax = Math.min(1, Math.ceil(rawMax * 10 + 0.25) / 10);
    const yMin = Math.max(-0.6, Math.floor(rawMin * 10) / 10);
    const x = (v: number) => (v / xMax) * iw;
    const y = (r: number) => ih - ((Math.max(yMin, Math.min(yMax, r)) - yMin) / (yMax - yMin)) * ih;
    const xs = niceStep(xMax, Math.max(3, Math.floor(iw / 110)));
    const xTicks: number[] = [];
    for (let v = 0; v <= xMax + 1; v += xs) xTicks.push(v);
    const yTicks: number[] = [];
    const ys = yMax - yMin > 0.5 ? 0.1 : 0.05;
    for (let r = yMin; r <= yMax + 1e-9; r += ys) yTicks.push(Math.round(r * 100) / 100);
    // Marginal rate is piecewise constant: draw as step-after. Effective rate is smooth.
    let marg = "";
    pts.forEach((p, i) => {
      const px = x(p.income);
      const py = y(p.marginalRate);
      if (i === 0) marg += `M${px},${py}`;
      else marg += `H${px}V${py}`;
    });
    const eff = pts.map((p, i) => `${i ? "L" : "M"}${x(p.income)},${y(p.effectiveRate)}`).join("");
    return { xMax, x, y, xTicks, yTicks, marg, eff, yMin, yMax };
  }, [pts, iw, ih]);

  const nearest = (income: number) => {
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].income - income) < Math.abs(pts[best].income - income)) best = i;
    return best;
  };
  const curIdx = pts.length ? nearest(current) : -1;
  const curPt = curIdx >= 0 ? pts[curIdx] : null;
  const shown = idx !== null && pts[idx] ? pts[idx] : null;

  const label = mode === "ordinary" ? "wages" : "long-term gains";
  const last = pts[pts.length - 1];
  const endGap = geo && last ? Math.abs(geo.y(last.marginalRate) - geo.y(last.effectiveRate)) : 0;

  return (
    <section className="card" aria-labelledby="mr-title">
      <header className="card__head card__head--wrap">
        <div>
          <h2 id="mr-title" className="card__title">
            Marginal and effective rate as {label} change
          </h2>
          <p className="card__desc">
            Everything else held at this scenario. Marginal rate includes phase-ins and phase-outs, so it can jump
            above the bracket rate.
          </p>
        </div>
        <div className="card__controls">
          <Segmented<Mode>
            label="Vary"
            hideLabel
            size="sm"
            value={mode}
            options={[
              { value: "ordinary", label: "Wages" },
              { value: "ltcg", label: "Long-term gains" },
            ]}
            onChange={(m) => {
              setMode(m);
              setIdx(null);
            }}
          />
        </div>
      </header>

      <div className="legend" aria-label="Legend">
        <span className="legend__item">
          <span className="viz-key viz-key--line" style={{ background: "var(--series-1)" }} />
          Marginal rate
        </span>
        <span className="legend__item">
          <span className="viz-key viz-key--line" style={{ background: "var(--series-2)" }} />
          Effective rate on AGI
        </span>
        <span className="legend__item">
          <span className="viz-key viz-key--marker" />
          This scenario
        </span>
      </div>

      <div className="viz" ref={wrapRef}>
        {sweep.error ? (
          <p className="empty">The rate sweep could not be computed: {sweep.error}</p>
        ) : !geo ? (
          <p className="empty">Not enough points to draw the sweep.</p>
        ) : (
          <>
            <svg
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-labelledby="mr-svg-title mr-svg-desc"
              tabIndex={0}
              className="viz__svg"
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const from = idx ?? curIdx;
                  setIdx(Math.max(0, Math.min(pts.length - 1, from + (e.key === "ArrowRight" ? 1 : -1))));
                } else if (e.key === "Escape") setIdx(null);
              }}
              onFocus={() => setIdx((v) => v ?? curIdx)}
              onBlur={() => setIdx(null)}
              onPointerMove={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const px = e.clientX - box.left - M.left;
                if (px < -8 || px > iw + 8) return setIdx(null);
                setIdx(nearest((Math.max(0, Math.min(iw, px)) / iw) * geo.xMax));
              }}
              onPointerLeave={() => setIdx(null)}
            >
              <title id="mr-svg-title">Marginal and effective federal tax rate versus {label}</title>
              <desc id="mr-svg-desc">
                {`Sweep from $0 to ${money(geo.xMax)} of ${label} in ${money(step)} steps. At this scenario's ${money(current)}, the marginal rate is ${curPt ? pct(curPt.marginalRate) : "unknown"} and the effective rate is ${curPt ? pct(curPt.effectiveRate) : "unknown"}. Use left and right arrow keys to inspect points.`}
              </desc>
              <g transform={`translate(${M.left},${M.top})`}>
                {geo.yTicks.map((t) => (
                  <g key={`y${t}`}>
                    <line className={t === 0 ? "viz__base" : "viz__grid"} x1={0} x2={iw} y1={geo.y(t)} y2={geo.y(t)} />
                    <text className="viz__tick" x={-8} y={geo.y(t)} dy="0.32em" textAnchor="end">
                      {Math.round(t * 100)}%
                    </text>
                  </g>
                ))}
                {geo.xTicks.map((t) => (
                  <text key={`x${t}`} className="viz__tick" x={geo.x(t)} y={ih + 20} textAnchor="middle">
                    {moneyCompact(t)}
                  </text>
                ))}

                <path className="viz__line" d={geo.eff} style={{ stroke: "var(--series-2)" }} />
                <path className="viz__line" d={geo.marg} style={{ stroke: "var(--series-1)" }} />

                {endGap >= 14 && last && (
                  <>
                    <text className="viz__endlabel" x={iw + 8} y={geo.y(last.marginalRate)} dy="0.32em">
                      Marginal {pct(last.marginalRate, 0)}
                    </text>
                    <text className="viz__endlabel" x={iw + 8} y={geo.y(last.effectiveRate)} dy="0.32em">
                      Effective {pct(last.effectiveRate, 0)}
                    </text>
                  </>
                )}

                {curPt && current <= geo.xMax && (
                  <g className="viz__current">
                    <line x1={geo.x(current)} x2={geo.x(current)} y1={0} y2={ih} />
                    <text
                      className="viz__currentlabel"
                      x={geo.x(current)}
                      y={-6}
                      textAnchor={geo.x(current) > iw - 60 ? "end" : geo.x(current) < 60 ? "start" : "middle"}
                    >
                      You · {moneyCompact(current)}
                    </text>
                    <circle className="viz__dot" cx={geo.x(current)} cy={geo.y(curPt.marginalRate)} r={4.5} style={{ fill: "var(--series-1)" }} />
                    <circle className="viz__dot" cx={geo.x(current)} cy={geo.y(curPt.effectiveRate)} r={4.5} style={{ fill: "var(--series-2)" }} />
                  </g>
                )}

                {shown && (
                  <g className="viz__cross" aria-hidden="true">
                    <line x1={geo.x(shown.income)} x2={geo.x(shown.income)} y1={0} y2={ih} />
                    <circle className="viz__dot" cx={geo.x(shown.income)} cy={geo.y(shown.marginalRate)} r={4} style={{ fill: "var(--series-1)" }} />
                    <circle className="viz__dot" cx={geo.x(shown.income)} cy={geo.y(shown.effectiveRate)} r={4} style={{ fill: "var(--series-2)" }} />
                  </g>
                )}
                <rect x={0} y={0} width={iw} height={ih} fill="transparent" />
              </g>
            </svg>
            {shown && (
              <ChartTooltip
                x={M.left + geo.x(shown.income)}
                y={M.top + Math.min(geo.y(shown.marginalRate), geo.y(shown.effectiveRate)) + 10}
                containerWidth={W}
                title={`${money(shown.income)} of ${label}`}
                rows={[
                  { key: "m", label: "marginal", value: pct(shown.marginalRate), color: "var(--series-1)" },
                  { key: "e", label: "effective", value: pct(shown.effectiveRate), color: "var(--series-2)" },
                  { key: "t", label: "total tax", value: money(shown.totalTax) },
                ]}
              />
            )}
          </>
        )}
      </div>

      {pts.length > 0 && (
        <details className="data-table">
          <summary>Show data table ({pts.length} points)</summary>
          <div className="data-table__scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col" className="num">
                    {mode === "ordinary" ? "Wages" : "Long-term gains"}
                  </th>
                  <th scope="col" className="num">
                    Total tax
                  </th>
                  <th scope="col" className="num">
                    Marginal
                  </th>
                  <th scope="col" className="num">
                    Effective
                  </th>
                </tr>
              </thead>
              <tbody>
                {pts.map((p, i) => (
                  <tr key={i} className={i === curIdx ? "is-current" : ""}>
                    <td className="num">{money(p.income)}</td>
                    <td className="num">{money(p.totalTax)}</td>
                    <td className="num">{pct(p.marginalRate)}</td>
                    <td className="num">{pct(p.effectiveRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
