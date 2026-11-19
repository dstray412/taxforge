import { describe, expect, it } from "vitest";
import { computeTax } from "../src/engine";
import { getParams } from "../src/engine/params";
import { childCareRate, eitcAmount } from "../src/engine/compute";
import { make } from "./helpers";

describe("Child Tax Credit", () => {
  it("$2,200 per child, $50 per $1,000 (or part) over $400k MFJ", () => {
    // wages 420,000: 4,400 − 20 × 50 = 3,400
    const r = computeTax(make(2025, { filingStatus: "mfj", dependents: { qualifyingChildrenUnder17: 2 }, w2: { wages: 420_000 } }));
    expect(r.credits.childTaxCredit).toBe(3_400);
    // wages 410,500: ceil(10.5) = 11 steps → 3,850
    const r2 = computeTax(make(2025, { filingStatus: "mfj", dependents: { qualifyingChildrenUnder17: 2 }, w2: { wages: 410_500 } }));
    expect(r2.credits.childTaxCredit).toBe(3_850);
  });
  it("other dependents get $500", () => {
    const r = computeTax(make(2025, { dependents: { otherDependents: 1 }, w2: { wages: 60_000 } }));
    expect(r.credits.otherDependentCredit).toBe(500);
  });
  it("ACTC limited by 15% of earned income over $2,500", () => {
    // HOH, 2 kids, wages 20,000 → TI 0. ACTC = min(4,400, 3,400, 15% × 17,500 = 2,625) = 2,625
    const r = computeTax(make(2025, { filingStatus: "hoh", dependents: { qualifyingChildrenUnder17: 2 }, w2: { wages: 20_000 } }));
    expect(r.regularTax).toBe(0);
    expect(r.credits.additionalChildTaxCredit).toBe(2_625);
  });
  it("ACTC limited by $1,700 per child", () => {
    // HOH wages 30,000 → TI 6,375 → table tax (mid 6,375) 637.50 → 638; unused 3,762; cap 3,400
    const r = computeTax(make(2025, { filingStatus: "hoh", dependents: { qualifyingChildrenUnder17: 2 }, w2: { wages: 30_000 } }));
    expect(r.regularTax).toBe(638);
    expect(r.credits.childTaxCredit).toBe(638);
    expect(r.credits.additionalChildTaxCredit).toBe(3_400);
  });
});

describe("EITC", () => {
  const e = getParams(2025).eitc;
  it("phase-in (no children, $4,000)", () => {
    // midpoint 4,025 × 649/8,490 = 307.68 → 308
    expect(eitcAmount(4_000, 4_000, 0, false, e)).toBe(308);
  });
  it("plateau (1 child, $15,000) = max", () => {
    expect(eitcAmount(15_000, 15_000, 1, false, e)).toBe(4_328);
  });
  it("phase-out (2 children, $40,000 single)", () => {
    // 7,152 − (40,025 − 23,350) × 7,152/33,960 = 3,640.23 → 3,640
    expect(eitcAmount(40_000, 40_000, 2, false, e)).toBe(3_640);
  });
  it("fully phased out above the end", () => {
    expect(eitcAmount(70_000, 70_000, 3, true, e)).toBe(0);
  });
  it("investment income over the limit disqualifies", () => {
    const r = computeTax(make(2025, { dependents: { eitcQualifyingChildren: 1 }, w2: { wages: 15_000 }, investments: { taxableInterest: 12_000 } }));
    expect(r.credits.earnedIncomeCredit).toBe(0);
    const ok = computeTax(make(2025, { dependents: { eitcQualifyingChildren: 1 }, w2: { wages: 15_000 } }));
    expect(ok.credits.earnedIncomeCredit).toBe(4_328);
  });
  it("MFS not eligible, with a warning", () => {
    const r = computeTax(make(2025, { filingStatus: "mfs", dependents: { eitcQualifyingChildren: 1 }, w2: { wages: 15_000 } }));
    expect(r.credits.earnedIncomeCredit).toBe(0);
    expect(r.warnings.some((w) => /EITC/.test(w))).toBe(true);
  });
});

describe("Child and dependent care credit rate", () => {
  it("2025: 35% at $15k, 20% above $43k", () => {
    const c = getParams(2025).childCareCredit;
    expect(childCareRate(15_000, "single", c)).toBe(0.35);
    expect(childCareRate(15_001, "single", c)).toBe(0.34);
    expect(childCareRate(43_001, "single", c)).toBe(0.2);
  });
  it("2026 OBBBA: 50% top, 35% plateau, 20% floor", () => {
    const c = getParams(2026).childCareCredit;
    expect(childCareRate(15_000, "mfj", c)).toBe(0.5);
    expect(childCareRate(100_000, "mfj", c)).toBe(0.35);
    expect(childCareRate(400_000, "mfj", c)).toBe(0.2);
  });
  it("credit amount: 2025 MFJ AGI 100k, $8k expenses, 2 kids → $6,000 × 20%", () => {
    const r = computeTax(make(2025, {
      filingStatus: "mfj",
      w2: { wages: 60_000 },
      spouseW2: { wages: 40_000, federalWithholding: 0 },
      credits: { childCareExpenses: 8_000, childCareQualifyingPersons: 2 },
    }));
    expect(r.credits.childCareCredit).toBe(1_200);
  });
});

describe("AMT", () => {
  it("triggered by a large ISO bargain element", () => {
    // wages 150,000 → TI 134,250, regular tax 25,067 (schedule).
    // AMTI = 134,250 + 15,750 + 300,000 = 450,000; exemption 88,100; base 361,900.
    // TMT = 28% × 361,900 − 2% × 239,100 = 96,550 → AMT 71,483.
    const r = computeTax(make(2025, { w2: { wages: 150_000 }, amt: { isoBargainElement: 300_000 } }));
    expect(r.regularTax).toBe(25_067);
    expect(r.amt.amti).toBe(450_000);
    expect(r.amt.tentativeMinimumTax).toBe(96_550);
    expect(r.amt.amtOwed).toBe(71_483);
    expect(r.warnings.some((w) => /AMT/.test(w))).toBe(true);
  });
  it("not triggered for a plain W-2 earner", () => {
    const r = computeTax(make(2025, { w2: { wages: 150_000 } }));
    expect(r.amt.amtOwed).toBe(0);
  });
  it("2026 exemption phases out at 50% above $500k", () => {
    // AMTI 600,000 (TI 583,900 + std 16,100): exemption 90,100 − 50% × 100,000 = 40,100
    const r = computeTax(make(2026, { w2: { wages: 600_000 } }));
    expect(r.amt.exemption).toBe(40_100);
  });
});

describe("NIIT and Additional Medicare", () => {
  it("NIIT on lesser of NII and MAGI over threshold", () => {
    // wages 190,000 + interest 20,000: MAGI 210,000 → 3.8% × 10,000 = 380
    const r = computeTax(make(2025, { w2: { wages: 190_000 }, investments: { taxableInterest: 20_000 } }));
    expect(r.niit).toBe(380);
    expect(computeTax(make(2025, { w2: { wages: 150_000 }, investments: { taxableInterest: 20_000 } })).niit).toBe(0);
  });
  it("Additional Medicare 0.9% over $200k single / $250k MFJ combined", () => {
    expect(computeTax(make(2025, { w2: { wages: 210_000 } })).additionalMedicareTax).toBe(90);
    const j = computeTax(make(2025, { filingStatus: "mfj", w2: { wages: 240_000 }, spouseW2: { wages: 20_000, federalWithholding: 0 } }));
    expect(j.additionalMedicareTax).toBe(90);
  });
  it("Additional Medicare on SE earnings above threshold reduced by wages", () => {
    // wages 200,000 uses the whole threshold; SE earnings 46,175 × 0.9% = 415.58 → 416
    expect(computeTax(make(2025, { w2: { wages: 200_000 }, other: { selfEmploymentNetProfit: 50_000 } })).additionalMedicareTax).toBe(416);
  });
});
