import { useMemo, useState } from "react";
import type { TaxResult } from "../../engine";
import { FILING_STATUS_SHORT, money, moneySigned, pct, ptsSigned } from "../format";
import { otherTaxes } from "../derive";
import { useScenarios } from "../hooks/useScenarios";
import { safeCompute } from "../hooks/useTax";

const MAX = 4;

interface Line {
  key: string;
  label: string;
  get(r: TaxResult): number;
  kind: "money" | "rate";
  /** True when a higher value is better for the taxpayer. */
  higherIsBetter?: boolean;
  emphasis?: boolean;
}

const LINES: Line[] = [
  { key: "agi", label: "AGI", get: (r) => r.agi, kind: "money" },
  { key: "ti", label: "Taxable income", get: (r) => r.taxableIncome, kind: "money" },
  { key: "reg", label: "Regular tax", get: (r) => r.regularTax, kind: "money" },
  { key: "amt", label: "AMT", get: (r) => r.amt.amtOwed, kind: "money" },
  { key: "cred", label: "Credits", get: (r) => r.credits.totalNonrefundable + r.credits.totalRefundable, kind: "money", higherIsBetter: true },
  { key: "oth", label: "Other taxes", get: (r) => otherTaxes(r), kind: "money" },
  { key: "tot", label: "Total tax", get: (r) => r.totalTax, kind: "money", emphasis: true },
  { key: "ref", label: "Refund (+) / owed (−)", get: (r) => r.refundOrBalanceDue, kind: "money", higherIsBetter: true, emphasis: true },
  { key: "eff", label: "Effective rate", get: (r) => r.effectiveRateOnAGI, kind: "rate" },
  { key: "mar", label: "Marginal rate", get: (r) => r.marginalRateOrdinary, kind: "rate" },
];

export function CompareView() {
  const { scenarios, active } = useScenarios();
  const [picked, setPicked] = useState<string[]>(() => {
    const ids = scenarios.map((s) => s.id);
    const first = [active.id, ...ids.filter((id) => id !== active.id)];
    return first.slice(0, MAX);
  });

  // Columns follow the scenario tab order; the leftmost picked scenario is the baseline.
  const valid = scenarios.filter((s) => picked.includes(s.id)).map((s) => s.id);
  const cols = useMemo(
    () =>
      valid.map((id) => {
        const s = scenarios.find((x) => x.id === id)!;
        return { s, ...safeCompute(s.input) };
      }),
    [valid.join("|"), scenarios], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX ? p : [...p, id]));
  }

  const base = cols[0]?.result ?? null;

  return (
    <div className="compare">
      <fieldset className="compare__picker">
        <legend>
          Scenarios to compare <span className="muted">(up to {MAX}; deltas are against the leftmost)</span>
        </legend>
        <div className="chips">
          {scenarios.map((s) => {
            const on = valid.includes(s.id);
            const order = valid.indexOf(s.id);
            return (
              <label key={s.id} className={`chip${on ? " is-on" : ""}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && valid.length >= MAX}
                  onChange={() => toggle(s.id)}
                />
                {on && <span className="chip__order">{order + 1}</span>}
                {s.name}
              </label>
            );
          })}
        </div>
      </fieldset>

      {cols.length === 0 ? (
        <p className="empty">Pick at least one scenario.</p>
      ) : (
        <div className="compare__scroll">
          <table className="compare__table">
            <caption className="sr-only">Key return lines by scenario, with change versus the first scenario</caption>
            <thead>
              <tr>
                <th scope="col" className="compare__linecol">
                  Line
                </th>
                {cols.map((c, i) => (
                  <th key={c.s.id} scope="col" className="num">
                    <span className="compare__name">{c.s.name}</span>
                    <span className="compare__sub">
                      {c.s.input.taxYear} · {FILING_STATUS_SHORT[c.s.input.filingStatus]}
                      {i === 0 ? " · baseline" : ""}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LINES.map((line) => (
                <tr key={line.key} className={line.emphasis ? "is-total" : ""}>
                  <th scope="row">{line.label}</th>
                  {cols.map((c, i) => {
                    if (!c.result) return <td key={c.s.id} className="num error-cell">Error</td>;
                    const v = line.get(c.result);
                    const b = base ? line.get(base) : v;
                    const d = v - b;
                    const zero = line.kind === "money" ? Math.round(d) === 0 : Math.abs(d) < 0.0005;
                    const good = line.higherIsBetter ? d > 0 : d < 0;
                    return (
                      <td key={c.s.id} className="num">
                        <span className="compare__val">{line.kind === "money" ? money(v) : pct(v)}</span>
                        {i > 0 && base && (
                          <span className={`delta ${zero ? "delta--flat" : good ? "delta--good" : "delta--bad"}`}>
                            {zero ? "no change" : line.kind === "money" ? moneySigned(d) : ptsSigned(d)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cols.some((c) => c.error) && (
        <p className="callout callout--bad">
          {cols
            .filter((c) => c.error)
            .map((c) => `${c.s.name}: ${c.error}`)
            .join(" · ")}
        </p>
      )}
      <p className="card__foot">
        Ideas: duplicate a scenario and switch the year to see 2025 vs 2026; add a $50k IRA distribution for a Roth
        conversion; move long-term gains into a second scenario to compare realizing now vs next year. Green deltas
        are better for you.
      </p>
    </div>
  );
}
