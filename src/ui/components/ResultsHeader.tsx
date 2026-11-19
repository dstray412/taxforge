import type { TaxResult } from "../../engine";
import { money, pct, ratePct } from "../format";
import { refundLabel } from "../derive";

export function ResultsHeader({ result, pending }: { result: TaxResult; pending: boolean }) {
  const ro = refundLabel(result.refundOrBalanceDue);
  return (
    <section className={`kpis${pending ? " is-pending" : ""}`} aria-label="Key results" aria-live="polite">
      <div className="kpi kpi--hero">
        <span className="kpi__label">Total federal tax</span>
        <span className="kpi__value kpi__value--hero">{money(result.totalTax)}</span>
        <span className="kpi__sub">Form 1040 line 24</span>
      </div>
      <div className={`kpi kpi--refund kpi--${ro.tone}`}>
        <span className="kpi__label">
          <StatusGlyph tone={ro.tone} />
          {ro.label}
        </span>
        <span className="kpi__value kpi__value--hero">{money(Math.abs(result.refundOrBalanceDue))}</span>
        <span className="kpi__sub">
          {money(result.totalPayments)} paid against {money(result.totalTax)}
        </span>
      </div>
      <div className="kpi-grid">
        <Stat label="Effective rate" value={pct(result.effectiveRateOnAGI)} sub="Total tax / AGI" />
        <Stat label="Marginal, ordinary" value={pct(result.marginalRateOrdinary)} sub="Next $1,000 of wages" />
        <Stat label="Marginal, LTCG" value={pct(result.marginalRateLTCG)} sub="Next $1,000 of long-term gain" />
        <Stat label="Top bracket" value={ratePct(result.topBracket)} sub="Statutory rate" />
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="kpi kpi--small">
      <span className="kpi__label">{label}</span>
      <span className="kpi__value">{value}</span>
      <span className="kpi__sub">{sub}</span>
    </div>
  );
}

export function StatusGlyph({ tone }: { tone: "good" | "bad" | "neutral" | "warn" }) {
  if (tone === "neutral") return null;
  return (
    <svg className={`glyph glyph--${tone}`} viewBox="0 0 16 16" aria-hidden="true">
      {tone === "good" && <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />}
      {tone === "bad" && <path d="M8 3.5v6M8 12v.5" />}
      {tone === "warn" && <path d="M8 2.5 14 13.5H2L8 2.5ZM8 6.5v3.5M8 11.75v.25" />}
    </svg>
  );
}
