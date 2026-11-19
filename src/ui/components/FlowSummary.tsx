import type { TaxResult } from "../../engine";
import { money } from "../format";
import { flowRows, refundLabel } from "../derive";

export function FlowSummary({ result }: { result: TaxResult }) {
  const rows = flowRows(result);
  const ro = refundLabel(result.refundOrBalanceDue);
  return (
    <section className="card flow" aria-labelledby="flow-title">
      <header className="card__head">
        <h2 id="flow-title" className="card__title">
          Form 1040 flow
        </h2>
        <span className="card__meta">
          {result.input.taxYear} · {result.deduction.method === "itemized" ? "Itemizing" : "Standard deduction"}
        </span>
      </header>
      <table className="flow__table">
        <caption className="sr-only">How total income becomes total tax and the refund or balance due</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={`${r.emphasis ? "is-total" : ""}${r.muted ? " is-muted" : ""}`}>
              <td className="flow__op" aria-hidden="true">
                {r.op === "-" ? "−" : r.op}
              </td>
              <th scope="row" className="flow__label">
                {r.label}
                <span className="flow__ref">{r.ref}</span>
              </th>
              <td className="flow__amt num">{money(r.amount)}</td>
            </tr>
          ))}
          <tr className={`is-result tone-${ro.tone}`}>
            <td className="flow__op" aria-hidden="true">
              =
            </td>
            <th scope="row" className="flow__label">
              {ro.label}
              <span className="flow__ref">1040 line 34 / 37</span>
            </th>
            <td className="flow__amt num">{money(Math.abs(result.refundOrBalanceDue))}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
