import { getParams } from "../../engine";
import type { TaxResult } from "../../engine";
import { isoDateLabel, isoToLocalDate, money } from "../format";
import { SAFE_HARBOR_BASIS_LABEL } from "../derive";
import { StatusGlyph } from "./ResultsHeader";

export function EstimatedTaxView({ result }: { result: TaxResult }) {
  const sh = result.safeHarbor;
  const dates = getParams(result.input.taxYear).estimatedTax.dueDates ?? [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextIdx = dates.findIndex((d) => {
    const dt = isoToLocalDate(d);
    return dt ? dt >= today : false;
  });
  const covered = Math.max(0, Math.min(1, sh.requiredAnnualPayment > 0 ? sh.totalWithholdingAndEstimates / sh.requiredAnnualPayment : 1));

  return (
    <div className="estimated">
      <section className={`card safe-harbor ${sh.meetsSafeHarbor ? "is-good" : "is-bad"}`} aria-labelledby="sh-title">
        <header className="card__head">
          <div>
            <h2 id="sh-title" className="card__title">
              Underpayment safe harbor
            </h2>
            <p className="card__desc">Form 2210. Pay at least the required amount through withholding and estimates to avoid the penalty.</p>
          </div>
          <span className={`status-pill status-pill--${sh.meetsSafeHarbor ? "good" : "bad"}`}>
            <StatusGlyph tone={sh.meetsSafeHarbor ? "good" : "bad"} />
            {sh.meetsSafeHarbor ? "Safe harbor met" : "Short of safe harbor"}
          </span>
        </header>

        <div className="sh-grid">
          <div className="kpi kpi--small">
            <span className="kpi__label">Required annual payment</span>
            <span className="kpi__value">{money(sh.requiredAnnualPayment)}</span>
            <span className="kpi__sub">Basis: {SAFE_HARBOR_BASIS_LABEL[sh.basis] ?? sh.basis}</span>
          </div>
          <div className="kpi kpi--small">
            <span className="kpi__label">Withholding and estimates</span>
            <span className="kpi__value">{money(sh.totalWithholdingAndEstimates)}</span>
            <span className="kpi__sub">On track to pay this year</span>
          </div>
          <div className="kpi kpi--small">
            <span className="kpi__label">Shortfall</span>
            <span className="kpi__value">{money(sh.shortfall)}</span>
            <span className="kpi__sub">{sh.shortfall > 0 ? "Still needed to meet the safe harbor" : "Nothing more needed"}</span>
          </div>
          <div className="kpi kpi--small">
            <span className="kpi__label">Suggested quarterly payment</span>
            <span className="kpi__value">{money(sh.suggestedQuarterly)}</span>
            <span className="kpi__sub">Spread over the remaining due dates</span>
          </div>
        </div>

        <div className="meter" aria-hidden="true">
          <div className="meter__fill" style={{ width: `${covered * 100}%` }} />
        </div>
        <p className="meter__caption num">
          {money(sh.totalWithholdingAndEstimates)} of {money(sh.requiredAnnualPayment)} required ({Math.round(covered * 100)}%)
        </p>
      </section>

      <section className="card" aria-labelledby="dd-title">
        <header className="card__head">
          <h2 id="dd-title" className="card__title">
            {result.input.taxYear} estimated tax due dates
          </h2>
          <span className="card__meta">Form 1040-ES</span>
        </header>
        <ol className="due-dates">
          {dates.map((d, i) => {
            const dt = isoToLocalDate(d);
            const past = dt ? dt < today : false;
            return (
              <li key={d} className={`due ${past ? "is-past" : ""}${i === nextIdx ? " is-next" : ""}`}>
                <span className="due__q">Q{i + 1}</span>
                <span className="due__date">{isoDateLabel(d)}</span>
                <span className="due__state">{past ? "Passed" : i === nextIdx ? "Next" : "Upcoming"}</span>
                <span className="due__amt num">{!past && sh.suggestedQuarterly > 0 ? money(sh.suggestedQuarterly) : "—"}</span>
              </li>
            );
          })}
        </ol>
        <p className="card__foot">
          Dates come from the engine's {result.input.taxYear} parameters. A due date on a weekend or holiday moves to the next business day.
        </p>
      </section>
    </div>
  );
}
