import { describe, expect, it } from "vitest";
import { computeTax } from "../src/engine";
import { make } from "./helpers";

/*
 * Golden return — 2025, single, standard deduction.
 *   W-2 wages 95,000; ST gain 4,000; LT gain 12,000; ordinary = qualified dividends 800.
 *
 *   Total income  = 95,000 + 800 + (4,000 + 12,000)            = 111,800   (line 9)
 *   AGI                                                         = 111,800   (line 11)
 *   Standard deduction (OBBBA 2025)                             =  15,750   (line 12)
 *   Taxable income                                              =  96,050   (line 15)
 *   QDCG worksheet:
 *     preferential = QD 800 + net capital gain 12,000           =  12,800
 *     ordinary portion = 96,050 − 12,800                        =  83,250
 *     0% room: 48,350 − 83,250 < 0                              =       0
 *     15% on 12,800                                             =   1,920
 *     tax on 83,250 (Tax Table row 83,250-83,300, midpoint 83,275):
 *       5,578.50 + 22% × (83,275 − 48,475) = 13,234.50 → 13,235
 *     worksheet total 15,155 vs all-ordinary tax on 96,050
 *       (midpoint 96,075 → 16,050.50 → 16,051) → regular tax      =  15,155   (line 16)
 *   No AMT, no credits, NIIT 0 (MAGI < 200k), Add'l Medicare 0.
 *   Total tax                                                   =  15,155   (line 24)
 *   Marginal ordinary: +1,000 wages → ordinary 84,250 → 13,455 (+220) → 22%
 *   Marginal LTCG:    +1,000 LT    → +150                          → 15%
 */
describe("golden end-to-end: 2025 single, W-2 + gains + QD", () => {
  const r = computeTax(make(2025, {
    w2: { wages: 95_000 },
    investments: { netShortTermGain: 4_000, netLongTermGain: 12_000, ordinaryDividends: 800, qualifiedDividends: 800 },
  }));

  it("income through taxable income", () => {
    expect(r.totalIncome).toBe(111_800);
    expect(r.totalAdjustments).toBe(0);
    expect(r.agi).toBe(111_800);
    expect(r.deduction.method).toBe("standard");
    expect(r.deduction.standardDeduction).toBe(15_750);
    expect(r.taxableIncome).toBe(96_050);
  });
  it("tax computation", () => {
    expect(r.ordinaryIncomeTax).toBe(13_235);
    expect(r.capitalGains.taxedAt0).toBe(0);
    expect(r.capitalGains.taxedAt15).toBe(12_800);
    expect(r.capitalGains.taxedAt20).toBe(0);
    expect(r.capitalGains.preferentialTax).toBe(1_920);
    expect(r.regularTax).toBe(15_155);
    expect(r.amt.amtOwed).toBe(0);
    expect(r.niit).toBe(0);
    expect(r.additionalMedicareTax).toBe(0);
    expect(r.totalTax).toBe(15_155);
    expect(r.refundOrBalanceDue).toBe(-15_155);
  });
  it("rates", () => {
    expect(r.topBracket).toBe(0.22);
    expect(r.marginalRateOrdinary).toBeCloseTo(0.22, 4);
    expect(r.marginalRateLTCG).toBeCloseTo(0.15, 4);
    expect(r.effectiveRateOnAGI).toBeCloseTo(15_155 / 111_800, 6);
  });
  it("trace explains each key line", () => {
    for (const id of ["wages", "total_income", "agi", "std_deduction", "taxable_income", "ltcg_15pct", "regular_tax", "total_tax"]) {
      const line = r.trace.find((t) => t.id === id);
      expect(line, id).toBeDefined();
      expect(line!.note!.length).toBeGreaterThan(10);
    }
    expect(r.warnings.some((w) => /State and local/.test(w))).toBe(true);
  });
});
