/**
 * Pure helpers that turn a TaxResult into display rows. Only reads documented
 * TaxResult fields; never recomputes tax.
 */
import type { TaxResult } from "../engine";

/** Below-the-line deductions excluding QBI (standard or itemized + OBBBA Schedule 1-A items). */
export function belowLineDeductions(r: TaxResult): number {
  const d = r.deduction;
  const base = d.method === "itemized" ? d.itemizedTotal : d.standardDeduction;
  return (
    base +
    (d.seniorDeduction || 0) +
    (d.tipsDeduction || 0) +
    (d.overtimeDeduction || 0) +
    (d.carLoanInterestDeduction || 0) +
    (d.nonItemizerCharitable || 0)
  );
}

export function otherTaxes(r: TaxResult): number {
  return (r.selfEmployment?.totalSETax || 0) + (r.niit || 0) + (r.additionalMedicareTax || 0);
}

export interface FlowRow {
  key: string;
  label: string;
  ref: string;
  amount: number;
  op: "" | "+" | "-" | "=";
  emphasis?: boolean;
  muted?: boolean;
}

export function flowRows(r: TaxResult): FlowRow[] {
  return [
    { key: "income", label: "Total income", ref: "1040 line 9", amount: r.totalIncome, op: "" },
    { key: "adj", label: "Adjustments", ref: "Schedule 1 line 26", amount: r.totalAdjustments, op: "-" },
    { key: "agi", label: "Adjusted gross income", ref: "1040 line 11", amount: r.agi, op: "=", emphasis: true },
    {
      key: "ded",
      label: r.deduction.method === "itemized" ? "Itemized deductions" : "Standard deduction",
      ref: r.deduction.method === "itemized" ? "Schedule A / 1040 line 12" : "1040 line 12",
      amount: belowLineDeductions(r),
      op: "-",
    },
    { key: "qbi", label: "QBI deduction", ref: "Form 8995 / 1040 line 13", amount: r.deduction.qbiDeduction, op: "-", muted: !r.deduction.qbiDeduction },
    { key: "ti", label: "Taxable income", ref: "1040 line 15", amount: r.taxableIncome, op: "=", emphasis: true },
    { key: "reg", label: "Regular tax", ref: "1040 line 16", amount: r.regularTax, op: "" },
    { key: "amt", label: "Alternative minimum tax", ref: "Form 6251 / Schedule 2 line 2", amount: r.amt.amtOwed, op: "+", muted: !r.amt.amtOwed },
    { key: "cred", label: "Nonrefundable credits", ref: "1040 line 21", amount: r.credits.totalNonrefundable, op: "-", muted: !r.credits.totalNonrefundable },
    { key: "oth", label: "Other taxes", ref: "Schedule 2 line 21", amount: otherTaxes(r), op: "+", muted: !otherTaxes(r) },
    { key: "tot", label: "Total tax", ref: "1040 line 24", amount: r.totalTax, op: "=", emphasis: true },
    { key: "pay", label: "Total payments", ref: "1040 line 33", amount: r.totalPayments, op: "-" },
  ];
}

export interface CompositionPart {
  key: string;
  label: string;
  amount: number;
  /** CSS custom property holding this part's categorical color (fixed per entity). */
  color: string;
}

/**
 * regularTax is authoritative (Form 1040 line 16). When the all-ordinary computation
 * wins on the Qualified Dividends and Capital Gain Tax Worksheet, ordinary tax plus
 * preferential tax can exceed regularTax by a few dollars. This returns
 * regularTax - (ordinary + preferential); 0 when they agree.
 */
export function worksheetAdjustment(r: TaxResult): number {
  const diff = r.regularTax - (r.ordinaryIncomeTax + r.capitalGains.preferentialTax);
  return Math.abs(diff) < 0.5 ? 0 : diff;
}

/** Tax composition in fixed categorical order (color follows the entity, never its rank). */
export function composition(r: TaxResult): CompositionPart[] {
  return [
    { key: "ord", label: "Ordinary income tax", amount: r.ordinaryIncomeTax, color: "var(--series-1)" },
    { key: "cg", label: "Capital gains tax", amount: r.capitalGains.preferentialTax, color: "var(--series-2)" },
    { key: "amt", label: "AMT", amount: r.amt.amtOwed, color: "var(--series-3)" },
    { key: "se", label: "Self-employment tax", amount: r.selfEmployment.totalSETax, color: "var(--series-4)" },
    { key: "niit", label: "Net investment income tax", amount: r.niit, color: "var(--series-5)" },
    { key: "addl", label: "Additional Medicare tax", amount: r.additionalMedicareTax, color: "var(--series-6)" },
  ];
}

export function refundLabel(n: number): { label: string; tone: "good" | "bad" | "neutral" } {
  if (Math.round(n) > 0) return { label: "Estimated refund", tone: "good" };
  if (Math.round(n) < 0) return { label: "Estimated balance due", tone: "bad" };
  return { label: "Refund / balance due", tone: "neutral" };
}

export const SAFE_HARBOR_BASIS_LABEL: Record<string, string> = {
  "90pct_current": "90% of this year's tax",
  "100pct_prior": "100% of last year's tax",
  "110pct_prior": "110% of last year's tax",
  none_owed: "Under the $1,000 threshold",
};
