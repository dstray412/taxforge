import { describe, expect, it } from "vitest";
import { computeTax } from "../src/engine";
import { make } from "./helpers";

describe("standard deduction", () => {
  it("2025 single base (OBBBA $15,750) and 65+ adds $2,000", () => {
    expect(computeTax(make(2025, { w2: { wages: 50_000 } })).deduction.standardDeduction).toBe(15_750);
    expect(computeTax(make(2025, { taxpayer: { age65OrOlder: true }, w2: { wages: 50_000 } })).deduction.standardDeduction).toBe(17_750);
  });
  it("2025 MFJ both 65+, one blind: 31,500 + 3×1,600", () => {
    const r = computeTax(make(2025, { filingStatus: "mfj", taxpayer: { age65OrOlder: true, blind: true }, spouse: { age65OrOlder: true, blind: false } }));
    expect(r.deduction.standardDeduction).toBe(36_300);
  });
  it("2026 HOH blind: 24,150 + 2,050", () => {
    expect(computeTax(make(2026, { filingStatus: "hoh", taxpayer: { blind: true } })).deduction.standardDeduction).toBe(26_200);
  });
  it("dependent filer: greater of $1,350 or earned + $450, capped", () => {
    expect(computeTax(make(2025, { claimedAsDependent: true, w2: { wages: 5_000 } })).deduction.standardDeduction).toBe(5_450);
    expect(computeTax(make(2025, { claimedAsDependent: true, w2: { wages: 500 } })).deduction.standardDeduction).toBe(1_350);
    expect(computeTax(make(2025, { claimedAsDependent: true, w2: { wages: 20_000 } })).deduction.standardDeduction).toBe(15_750);
    expect(computeTax(make(2025, { claimedAsDependent: true, taxpayer: { age65OrOlder: true }, w2: { wages: 5_000 } })).deduction.standardDeduction).toBe(7_450);
  });
});

describe("SALT cap (OBBBA)", () => {
  it("MAGI $520,000 → cap 40,000 − 30% × 20,000 = $34,000", () => {
    const r = computeTax(make(2025, { w2: { wages: 520_000 }, deductions: { itemized: { stateLocalIncomeOrSalesTax: 50_000 } } }));
    expect(r.deduction.itemizedBreakdown.saltCap).toBe(34_000);
    expect(r.deduction.itemizedBreakdown.saltAllowed).toBe(34_000);
    expect(r.deduction.method).toBe("itemized");
  });
  it("MAGI $600,000 → floor $10,000", () => {
    const r = computeTax(make(2025, { w2: { wages: 600_000 }, deductions: { itemized: { stateLocalIncomeOrSalesTax: 50_000 } } }));
    expect(r.deduction.itemizedBreakdown.saltCap).toBe(10_000);
  });
  it("2026 MAGI $520,000 → 40,400 − 30% × 15,000 = $35,900; MFS cap halves", () => {
    expect(computeTax(make(2026, { w2: { wages: 520_000 }, deductions: { itemized: { realEstateTaxes: 50_000 } } })).deduction.itemizedBreakdown.saltCap).toBe(35_900);
    expect(computeTax(make(2026, { filingStatus: "mfs", w2: { wages: 100_000 }, deductions: { itemized: { realEstateTaxes: 50_000 } } })).deduction.itemizedBreakdown.saltCap).toBe(20_200);
  });
});

describe("itemized details", () => {
  it("medical 7.5% floor and mortgage $750k proration", () => {
    const r = computeTax(make(2025, {
      w2: { wages: 100_000 },
      deductions: { method: "itemized", itemized: { medicalExpenses: 10_000, mortgageInterest: 30_000, mortgagePrincipal: 1_000_000 } },
    }));
    expect(r.deduction.itemizedBreakdown.medical).toBe(2_500); // 10,000 − 7,500
    expect(r.deduction.itemizedBreakdown.mortgageInterest).toBe(22_500); // 30,000 × 750/1000
  });
  it("auto picks the larger of standard and itemized", () => {
    expect(computeTax(make(2025, { w2: { wages: 100_000 }, deductions: { itemized: { mortgageInterest: 10_000 } } })).deduction.method).toBe("standard");
    expect(computeTax(make(2025, { w2: { wages: 100_000 }, deductions: { itemized: { mortgageInterest: 20_000 } } })).deduction.method).toBe("itemized");
  });
  it("2026 charitable 0.5%-of-AGI floor", () => {
    // AGI 200,000: cash 20,000 − 1,000 floor = 19,000; + mortgage 10,000 + SALT 10,000 = 39,000
    const r = computeTax(make(2026, {
      w2: { wages: 200_000 },
      deductions: { itemized: { charitableCash: 20_000, mortgageInterest: 10_000, stateLocalIncomeOrSalesTax: 10_000 } },
    }));
    expect(r.deduction.itemizedBreakdown.charitable).toBe(19_000);
    expect(r.deduction.itemizedTotal).toBe(39_000);
  });
  it("2026 37%-bracket value cap reduces itemized by 2/37 of the lesser amount", () => {
    // AGI 1,000,000. SALT floor 10,000 + mortgage 30,000 + charity (60,000 − 5,000) = 95,000.
    // Income above 640,600 (359,400) exceeds 95,000, so reduction = 95,000 × 2/37 = 5,135.14.
    const r = computeTax(make(2026, {
      w2: { wages: 1_000_000 },
      deductions: { itemized: { stateLocalIncomeOrSalesTax: 30_000, mortgageInterest: 30_000, charitableCash: 60_000 } },
    }));
    expect(r.deduction.itemizedTotal).toBeCloseTo(95_000 - (95_000 * 2) / 37, 1);
    expect(r.trace.some((t) => t.id === "itemized_cap")).toBe(true);
  });
  it("2025 has no 37% cap", () => {
    const r = computeTax(make(2025, { w2: { wages: 1_000_000 }, deductions: { itemized: { mortgageInterest: 30_000, charitableCash: 60_000 } } }));
    expect(r.deduction.itemizedTotal).toBe(90_000);
  });
});

describe("OBBBA additional deductions", () => {
  it("senior deduction with 6% MAGI phaseout", () => {
    // single 65+, AGI 85,000 → 6,000 − 6% × 10,000 = 5,400
    expect(computeTax(make(2025, { taxpayer: { age65OrOlder: true }, other: { pensions: 85_000 } })).deduction.seniorDeduction).toBe(5_400);
    // MFJ both 65+, AGI 200,000 → each 6,000 − 3,000 → 6,000 total
    expect(computeTax(make(2025, { filingStatus: "mfj", taxpayer: { age65OrOlder: true }, spouse: { age65OrOlder: true }, other: { pensions: 200_000 } })).deduction.seniorDeduction).toBe(6_000);
    expect(computeTax(make(2025, { taxpayer: { age65OrOlder: true }, other: { pensions: 175_000 } })).deduction.seniorDeduction).toBe(0);
    const mfs = computeTax(make(2025, { filingStatus: "mfs", taxpayer: { age65OrOlder: true }, other: { pensions: 50_000 } }));
    expect(mfs.deduction.seniorDeduction).toBe(0);
    expect(mfs.warnings.some((w) => /senior/i.test(w))).toBe(true);
  });
  it("tips: $25k cap and $100 per $1,000 over $150k", () => {
    const r = computeTax(make(2025, { w2: { wages: 160_000, qualifiedTips: 30_000 } }));
    expect(r.deduction.tipsDeduction).toBe(24_000);
  });
  it("overtime: $12.5k single / $25k MFJ caps and phaseout", () => {
    expect(computeTax(make(2025, { w2: { wages: 100_000, qualifiedOvertime: 15_000 } })).deduction.overtimeDeduction).toBe(12_500);
    // MFJ AGI 320,000: 25,000 − 0.1 × 20,000 = 23,000
    expect(computeTax(make(2025, { filingStatus: "mfj", w2: { wages: 320_000, qualifiedOvertime: 30_000 } })).deduction.overtimeDeduction).toBe(23_000);
  });
  it("car loan interest: $10k cap, $200 per $1,000 (or part) over $100k, below the line", () => {
    // AGI 105,500 → ceil(5.5) = 6 steps → 10,000 − 1,200 = 8,800
    const r = computeTax(make(2025, { w2: { wages: 105_500 }, adjustments: { carLoanInterest: 12_000 } }));
    expect(r.deduction.carLoanInterestDeduction).toBe(8_800);
    expect(r.agi).toBe(105_500); // does not reduce AGI
    expect(r.taxableIncome).toBe(105_500 - 15_750 - 8_800);
  });
  it("2026 non-itemizer charitable: $1,000 single / $2,000 MFJ", () => {
    const s = computeTax(make(2026, { w2: { wages: 60_000 }, deductions: { itemized: { charitableCash: 1_500 } } }));
    expect(s.deduction.nonItemizerCharitable).toBe(1_000);
    expect(s.taxableIncome).toBe(60_000 - 16_100 - 1_000);
    const j = computeTax(make(2026, { filingStatus: "mfj", w2: { wages: 90_000 }, deductions: { itemized: { charitableCash: 3_000 } } }));
    expect(j.deduction.nonItemizerCharitable).toBe(2_000);
    expect(computeTax(make(2025, { w2: { wages: 60_000 }, deductions: { itemized: { charitableCash: 1_500 } } })).deduction.nonItemizerCharitable).toBe(0);
  });
});

describe("QBI", () => {
  it("limited to 20% of taxable income before QBI", () => {
    // profit 100,000 → SE tax 14,130, half 7,065, AGI 92,935, TI before QBI 77,185.
    // 20% × QBI(92,935) = 18,587 > 20% × 77,185 = 15,437 → 15,437.
    const r = computeTax(make(2025, { other: { selfEmploymentNetProfit: 100_000 } }));
    expect(r.deduction.qbiDeduction).toBeCloseTo(15_437, 2);
  });
  it("SSTB fully phased out above threshold + range", () => {
    const r = computeTax(make(2025, { other: { selfEmploymentNetProfit: 400_000, selfEmploymentIsSSTB: true } }));
    expect(r.deduction.qbiDeduction).toBe(0);
  });
  it("non-SSTB above threshold + range is limited by W-2 wages / UBIA (none entered → 0)", () => {
    const r = computeTax(make(2025, { other: { selfEmploymentNetProfit: 400_000 } }));
    expect(r.deduction.qbiDeduction).toBe(0);
    expect(r.warnings.some((w) => /W-2 wage/.test(w))).toBe(false);
    expect(r.trace.find((t) => t.id === "qbi")!.note).toMatch(/W-2 wage \/ UBIA limit applies using your inputs/);
  });
});
