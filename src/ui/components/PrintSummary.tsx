import type { TaxResult } from "../../engine";
import { FILING_STATUS_LABEL, money, pct, ratePct } from "../format";
import { flowRows, refundLabel, SAFE_HARBOR_BASIS_LABEL } from "../derive";

/** Hidden on screen; the only thing visible when printing. */
export function PrintSummary({ name, result }: { name: string; result: TaxResult }) {
  const ro = refundLabel(result.refundOrBalanceDue);
  const sh = result.safeHarbor;
  return (
    <div className="print-only print-summary">
      <header>
        <h1>TaxForge summary: {name}</h1>
        <p>
          Tax year {result.input.taxYear} · {FILING_STATUS_LABEL[result.input.filingStatus]} · Printed{" "}
          {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </header>
      <div className="ps-kpis">
        <div>
          <span>Total federal tax</span>
          <strong>{money(result.totalTax)}</strong>
        </div>
        <div>
          <span>{ro.label}</span>
          <strong>{money(Math.abs(result.refundOrBalanceDue))}</strong>
        </div>
        <div>
          <span>Effective rate on AGI</span>
          <strong>{pct(result.effectiveRateOnAGI)}</strong>
        </div>
        <div>
          <span>Marginal ordinary / LTCG</span>
          <strong>
            {pct(result.marginalRateOrdinary)} / {pct(result.marginalRateLTCG)}
          </strong>
        </div>
        <div>
          <span>Top bracket</span>
          <strong>{ratePct(result.topBracket)}</strong>
        </div>
      </div>
      <h2>Form 1040 flow</h2>
      <table>
        <tbody>
          {flowRows(result).map((r) => (
            <tr key={r.key} className={r.emphasis ? "is-total" : ""}>
              <td>{r.op === "-" ? "−" : r.op}</td>
              <th>{r.label}</th>
              <td className="ref">{r.ref}</td>
              <td className="num">{money(r.amount)}</td>
            </tr>
          ))}
          <tr className="is-total">
            <td>=</td>
            <th>{ro.label}</th>
            <td className="ref">1040 line 34 / 37</td>
            <td className="num">{money(Math.abs(result.refundOrBalanceDue))}</td>
          </tr>
        </tbody>
      </table>
      <h2>Estimated tax</h2>
      <p>
        Required annual payment {money(sh.requiredAnnualPayment)} ({SAFE_HARBOR_BASIS_LABEL[sh.basis] ?? sh.basis}).
        Paid through withholding and estimates {money(sh.totalWithholdingAndEstimates)}. Shortfall {money(sh.shortfall)}
        {sh.suggestedQuarterly > 0 ? `; suggested quarterly payment ${money(sh.suggestedQuarterly)}` : ""}.
      </p>
      {result.warnings.length > 0 && (
        <>
          <h2>Notes</h2>
          <ul>
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </>
      )}
      <footer>Planning estimates only. Not tax advice; does not file returns. Verify with a professional.</footer>
    </div>
  );
}
