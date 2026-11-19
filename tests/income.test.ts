import { describe, expect, it } from "vitest";
import { computeTax } from "../src/engine";
import { getParams } from "../src/engine/params";
import { qdcgTax, scheduleD, scheduleSE, taxableSocialSecurity } from "../src/engine/compute";
import { defaultInput } from "../src/engine/defaults";
import { make } from "./helpers";

const inv = (patch: Partial<ReturnType<typeof defaultInput>["investments"]>) => ({ ...defaultInput(2025).investments, ...patch });

describe("Schedule D netting", () => {
  it("loss limit $3,000 with short-term carryforward", () => {
    const d = scheduleD(inv({ netShortTermGain: -10_000, netLongTermGain: 2_000 }), 3_000, true);
    expect(d.line7).toBe(-3_000);
    expect(d.carryST).toBe(5_000);
    expect(d.carryLT).toBe(0);
  });
  it("both negative: deduction absorbs short-term first", () => {
    const d = scheduleD(inv({ netShortTermGain: -2_000, netLongTermGain: -6_000 }), 3_000, true);
    expect(d.carryST).toBe(0);
    expect(d.carryLT).toBe(5_000);
  });
  it("ST gain offsets LT loss before the limit", () => {
    const d = scheduleD(inv({ netShortTermGain: 1_000, netLongTermGain: -5_000 }), 3_000, true);
    expect(d.line7).toBe(-3_000);
    expect(d.carryLT).toBe(1_000);
  });
  it("MFS limit $1,500 via computeTax", () => {
    const r = computeTax(make(2025, { filingStatus: "mfs", w2: { wages: 50_000 }, investments: { netShortTermGain: -5_000 } }));
    expect(r.capitalGains.capitalLossDeducted).toBe(1_500);
    expect(r.capitalGains.carryforwardShortTerm).toBe(3_500);
  });
  it("Section 1256 60/40 split", () => {
    const d = scheduleD(inv({ section1256Gain: 10_000 }), 3_000, true);
    expect(d.lt).toBeCloseTo(6_000, 6);
    expect(d.st).toBeCloseTo(4_000, 6);
    expect(d.netCapitalGain).toBeCloseTo(6_000, 6);
    const r = computeTax(make(2025, { investments: { section1256Gain: 10_000 } }));
    expect(r.capitalGains.netLongTerm).toBe(6_000);
  });
  it("carryovers reduce gains; net capital gain is LT net of ST loss", () => {
    const d = scheduleD(inv({ netLongTermGain: 5_000, shortTermLossCarryover: 1_000 }), 3_000, true);
    expect(d.total).toBe(4_000);
    expect(d.netCapitalGain).toBe(4_000);
  });
});

describe("Qualified Dividends and Capital Gain Tax Worksheet", () => {
  it("LTCG straddling the 0%/15% breakpoint (2025 single)", () => {
    // wages 50,000 + LTCG 20,000 − 15,750 = TI 54,250; ordinary 34,250; 0% room 48,350 − 34,250 = 14,100;
    // 15% on 5,900 = 885; table tax on 34,250 (mid 34,275) = 3,874.50 → 3,875; total 4,760.
    const r = computeTax(make(2025, { w2: { wages: 50_000 }, investments: { netLongTermGain: 20_000 } }));
    expect(r.taxableIncome).toBe(54_250);
    expect(r.capitalGains.taxedAt0).toBe(14_100);
    expect(r.capitalGains.taxedAt15).toBe(5_900);
    expect(r.regularTax).toBe(4_760);
  });
  it("20% rate plus NIIT for a high earner", () => {
    // wages 600,000 + LTCG 200,000; TI 784,250; ordinary 584,250 already above 533,400 → all 200,000 at 20%.
    // ordinary tax 174,034.75 + 40,000 = 214,034.75 → 214,035. NIIT 3.8% × 200,000 = 7,600.
    // Additional Medicare 0.9% × 400,000 = 3,600.
    const r = computeTax(make(2025, { w2: { wages: 600_000 }, investments: { netLongTermGain: 200_000 } }));
    expect(r.capitalGains.taxedAt20).toBe(200_000);
    expect(r.regularTax).toBe(214_035);
    expect(r.niit).toBe(7_600);
    expect(r.additionalMedicareTax).toBe(3_600);
    expect(r.amt.amtOwed).toBe(0);
    expect(r.totalTax).toBe(225_235);
    expect(r.marginalRateLTCG).toBeCloseTo(0.238, 4);
  });
  it("never exceeds all-ordinary tax", () => {
    const b = getParams(2025).brackets.single;
    const q = qdcgTax(30_000, 1_000, 0, b, getParams(2025).ltcgBreakpoints.single);
    expect(q.tax).toBeLessThanOrEqual(q.allOrdinaryTax);
  });
});

describe("Schedule SE", () => {
  const ss = getParams(2025).socialSecurity;
  it("no wages: 15.3% of 92.35%", () => {
    const se = scheduleSE(100_000, 0, ss);
    expect(se.netEarnings).toBe(92_350);
    expect(se.socialSecurityTax).toBeCloseTo(11_451.4, 2);
    expect(se.medicareTax).toBeCloseTo(2_678.15, 2);
    expect(se.totalSETax).toBe(14_130);
    expect(se.halfSETaxDeduction).toBe(7_065);
  });
  it("wages above the wage base: Medicare only", () => {
    const se = scheduleSE(50_000, 200_000, ss);
    expect(se.socialSecurityTax).toBe(0);
    expect(se.totalSETax).toBe(1_339);
    expect(se.halfSETaxDeduction).toBe(669.5);
  });
  it("wages partially using the wage base", () => {
    // SS base remaining 176,100 − 150,000 = 26,100 → 3,236.40; Medicare 1,339.08 → 4,575
    expect(scheduleSE(50_000, 150_000, ss).totalSETax).toBe(4_575);
  });
  it("under $400 net earnings: no SE tax", () => {
    expect(scheduleSE(400, 0, ss).totalSETax).toBe(0);
  });
  it("half-SE deduction flows to AGI", () => {
    const r = computeTax(make(2025, { other: { selfEmploymentNetProfit: 100_000 } }));
    expect(r.agi).toBe(92_935);
    expect(r.selfEmployment.totalSETax).toBe(14_130);
  });
});

describe("Social Security taxability", () => {
  const p = getParams(2025).socialSecurityBenefits;
  it("0% when provisional income ≤ base", () => {
    expect(taxableSocialSecurity(20_000, 10_000, p.base.single, p.adjusted.single).taxable).toBe(0);
  });
  it("50% tier", () => {
    // provisional 30,000: half of (30,000 − 25,000) = 2,500
    expect(taxableSocialSecurity(20_000, 20_000, p.base.single, p.adjusted.single).taxable).toBe(2_500);
  });
  it("into the 85% tier", () => {
    // provisional 42,000: min(4,500, 12,000) + 85% × 8,000 = 11,300
    expect(taxableSocialSecurity(24_000, 30_000, p.base.single, p.adjusted.single).taxable).toBe(11_300);
  });
  it("capped at 85% of benefits", () => {
    expect(taxableSocialSecurity(30_000, 60_000, p.base.single, p.adjusted.single).taxable).toBe(25_500);
  });
  it("computeTax flows taxable benefits into income; MFS warns", () => {
    const r = computeTax(make(2025, { other: { socialSecurityBenefits: 24_000, pensions: 30_000 } }));
    expect(r.socialSecurity.taxableBenefits).toBe(11_300);
    expect(r.totalIncome).toBe(41_300);
    const m = computeTax(make(2025, { filingStatus: "mfs", other: { socialSecurityBenefits: 20_000, pensions: 10_000 } }));
    expect(m.socialSecurity.taxableBenefits).toBe(17_000); // 85% × 20,000 (base 0)
    expect(m.warnings.some((w) => /lived with your spouse/.test(w))).toBe(true);
  });
});

describe("other adjustments", () => {
  it("IRA deduction phases out for a covered single filer", () => {
    // 2025 covered single 79,000-89,000. MAGI 84,000 → 50% of 7,000 = 3,500
    const r = computeTax(make(2025, { w2: { wages: 84_000 }, adjustments: { traditionalIraContribution: 7_000, coveredByWorkplacePlan: true } }));
    expect(r.totalAdjustments).toBe(3_500);
    expect(computeTax(make(2025, { w2: { wages: 60_000 }, adjustments: { traditionalIraContribution: 7_000, coveredByWorkplacePlan: true } })).totalAdjustments).toBe(7_000);
    expect(computeTax(make(2025, { w2: { wages: 95_000 }, adjustments: { traditionalIraContribution: 7_000, coveredByWorkplacePlan: true } })).totalAdjustments).toBe(0);
  });
  it("student loan interest phases out 85k-100k single", () => {
    const r = computeTax(make(2025, { w2: { wages: 92_500 }, adjustments: { studentLoanInterest: 3_000 } }));
    expect(r.totalAdjustments).toBe(1_250);
  });
});
