/** Regression tests for the 10 code-review findings plus the minor items (probe numbers from the review). */
import { describe, expect, it } from "vitest";
import { computeTax, defaultInput, parse1099B, summarizeLots } from "../src/engine";
import { capitalLossCarryover, qbiComponent } from "../src/engine/compute";
import { make } from "./helpers";

describe("review fixes", () => {
  it("1. blank cost basis falls back to gain/loss; else 'missing cost basis'", () => {
    const r = parse1099B("Symbol,Date Acquired,Date Sold,Proceeds,Cost Basis,Gain/Loss\nX,2025-01-02,2025-03-01,10000,,500\nY,2025-01-02,2025-03-01,10000,,\n");
    expect(r.lots).toHaveLength(1);
    expect(r.lots[0]!.costBasis).toBe(9_500);
    expect(summarizeLots(r.lots, 2025).netShortTerm).toBe(500);
    expect(r.errors).toEqual([{ row: 3, message: "missing cost basis" }]);
  });

  it("2. IRA: each spouse on own regime (2026 MFJ, taxpayer covered, spouse not, MAGI 160k)", () => {
    const r = computeTax(make(2026, {
      filingStatus: "mfj",
      w2: { wages: 160_000 },
      adjustments: { traditionalIraContribution: 7_500, spouseTraditionalIraContribution: 7_500, coveredByWorkplacePlan: true },
    }));
    // Taxpayer: covered MFJ range 129k-149k → 0. Spouse: spouse-covered range 242k-252k → full 7,500.
    expect(r.totalAdjustments).toBe(7_500);
    expect(r.agi).toBe(152_500);
  });

  it("3. QBI W-2/UBIA limit: 2025 single profit 400k, no wages/UBIA → 0; wages 100k → 50,000", () => {
    expect(computeTax(make(2025, { other: { selfEmploymentNetProfit: 400_000 } })).deduction.qbiDeduction).toBe(0);
    expect(computeTax(make(2025, { other: { selfEmploymentNetProfit: 400_000, qbiW2Wages: 100_000 } })).deduction.qbiDeduction).toBe(50_000);
    // Half-way through the range: 20,000 tentative − (20,000 − 0) × 50% = 10,000
    expect(qbiComponent(100_000, 0, 0, 222_300, 197_300, 50_000, false, 0.2).component).toBe(10_000);
    // UBIA prong: 25% × 40k + 2.5% × 1M = 35,000 > 50% × 40k
    expect(qbiComponent(500_000, 40_000, 1_000_000, 600_000, 197_300, 50_000, false, 0.2).wageLimit).toBe(35_000);
  });

  it("4. Schedule SE uses Box 3 SS wages (Box 1 160k, Box 3/5 183.5k, profit 50k)", () => {
    const r = computeTax(make(2025, { w2: { wages: 160_000, socialSecurityWages: 183_500, medicareWages: 183_500 }, other: { selfEmploymentNetProfit: 50_000 } }));
    expect(r.selfEmployment.socialSecurityTax).toBe(0);
    // Falls back to Box 5 when Box 3 is blank.
    const r2 = computeTax(make(2025, { w2: { wages: 160_000, medicareWages: 183_500 }, other: { selfEmploymentNetProfit: 50_000 } }));
    expect(r2.selfEmployment.socialSecurityTax).toBe(0);
  });

  it("5. AMT Part III stacks on regular ordinary income (wages 45,750, LTCG 100k, ISO 300k)", () => {
    // TI 130,000, regular ordinary 30,000. Base 445,750 − 88,100 = 357,650; 28% on 257,650 − 4,782 = 67,360;
    // 0% on 18,350, 15% on 81,650 = 12,247.50 → 79,607.50 → 79,608.
    const r = computeTax(make(2025, { w2: { wages: 45_750 }, investments: { netLongTermGain: 100_000 }, amt: { isoBargainElement: 300_000 } }));
    expect(r.amt.tentativeMinimumTax).toBe(79_608);
    expect(r.regularTax).toBe(15_613);
  });

  it("6. SS worksheet subtracts the IRA deduction (2025 single 65+, wages 30k, SS 30k, 8k IRA)", () => {
    const r = computeTax(make(2025, {
      taxpayer: { age65OrOlder: true },
      w2: { wages: 30_000 },
      other: { socialSecurityBenefits: 30_000 },
      adjustments: { traditionalIraContribution: 8_000 },
    }));
    expect(r.socialSecurity.provisionalIncome).toBe(37_000);
    expect(r.socialSecurity.taxableBenefits).toBe(7_050);
    expect(r.totalAdjustments).toBe(8_000);
  });

  it("6b. covered filer with SS: IRA phaseout uses MAGI with SS figured without the IRA deduction", () => {
    // 2025 single covered, wages 60k, SS 20k: worksheet-1 provisional 70,000 → taxable SS 17,000;
    // IRA MAGI 77,000 < 79,000 → full 7,000. Final provisional 63,000 → taxable SS 17,000 (85% cap).
    const r = computeTax(make(2025, { w2: { wages: 60_000 }, other: { socialSecurityBenefits: 20_000 }, adjustments: { traditionalIraContribution: 7_000, coveredByWorkplacePlan: true } }));
    expect(r.totalAdjustments).toBe(7_000);
    expect(r.socialSecurity.taxableBenefits).toBe(17_000);
  });

  it("7. capital loss carryover worksheet line 4 (wages 10k, ST loss 20k)", () => {
    const r = computeTax(make(2025, { w2: { wages: 10_000 }, investments: { netShortTermGain: -20_000 } }));
    expect(r.capitalGains.carryforwardShortTerm).toBe(20_000);
    expect(capitalLossCarryover(-20_000, 0, 3_000, 10_000 - 3_000 - 15_750).used).toBe(0);
    // Partially used: TI before floor −1,000 → used 2,000, carry 18,000.
    expect(capitalLossCarryover(-20_000, 0, 3_000, -1_000).carryST).toBe(18_000);
    // Both negative, fully used: ST absorbed first.
    expect(capitalLossCarryover(-2_000, -6_000, 3_000, 50_000)).toEqual({ used: 3_000, carryST: 0, carryLT: 5_000 });
  });

  it("8. sec. 68 reduction does not apply for AMT (2026 itemizer, wages 1.2M)", () => {
    // Itemized 10,000 SALT + 30,000 mortgage + (60,000 − 6,000) charity = 94,000; reduction 2/37 × 94,000.
    // AMTI = AGI − (itemized − SALT) = 1,200,000 − 84,000 = 1,116,000.
    const r = computeTax(make(2026, { w2: { wages: 1_200_000 }, deductions: { itemized: { stateLocalIncomeOrSalesTax: 30_000, mortgageInterest: 30_000, charitableCash: 60_000 } } }));
    expect(r.deduction.itemizedTotal).toBeCloseTo(94_000 - (94_000 * 2) / 37, 1);
    expect(r.amt.amti).toBeCloseTo(1_116_000, 1);
  });

  it("9. sec. 68 base subtracts QBI", () => {
    // 2026 single: wages 400k + profit 330k (QBI W-2 wages 200k), mortgage 80k.
    // SE tax 8,838 (Medicare only), half 4,419 → AGI 725,581; QBI 20% × 325,581 = 65,116.20.
    // Base = 725,581 − 65,116.20 = 660,464.80; excess over 640,600 = 19,864.80 → reduction 2/37 × that = 1,073.77.
    const r = computeTax(make(2026, {
      w2: { wages: 400_000 },
      other: { selfEmploymentNetProfit: 330_000, qbiW2Wages: 200_000 },
      deductions: { itemized: { mortgageInterest: 80_000 } },
    }));
    expect(r.agi).toBe(725_581);
    expect(r.deduction.qbiDeduction).toBeCloseTo(65_116.2, 1);
    expect(80_000 - r.deduction.itemizedTotal).toBeCloseTo((19_864.8 * 2) / 37, 1);
  });

  it("10. MFS spouse 65+/blind counts only when spouse had no gross income", () => {
    const base = { filingStatus: "mfs" as const, spouse: { age65OrOlder: true, blind: true }, w2: { wages: 50_000 } };
    expect(computeTax(make(2025, base)).deduction.standardDeduction).toBe(15_750);
    expect(computeTax(make(2025, { ...base, spouseHadNoGrossIncome: true })).deduction.standardDeduction).toBe(18_950);
  });
});

describe("review minor items", () => {
  it("IRA catch-up keys off age50OrOlder (age65OrOlder implies it)", () => {
    const ira = (taxpayer: object) => computeTax(make(2025, { taxpayer, w2: { wages: 50_000 }, adjustments: { traditionalIraContribution: 8_000 } })).totalAdjustments;
    expect(ira({})).toBe(7_000);
    expect(ira({ age50OrOlder: true })).toBe(8_000);
    expect(ira({ age65OrOlder: true })).toBe(8_000);
  });
  it("HSA cap uses coverage type and age-55 catch-up", () => {
    const hsa = (adj: object, taxpayer: object = {}) => computeTax(make(2025, { taxpayer, w2: { wages: 50_000 }, adjustments: { hsaContribution: 9_000, ...adj } })).totalAdjustments;
    expect(hsa({ hsaCoverage: "self" })).toBe(4_300);
    expect(hsa({ hsaCoverage: "self" }, { age55OrOlder: true })).toBe(5_300);
    expect(hsa({})).toBe(8_550); // default family
  });
  it("warns when SE retirement exceeds 25% of net SE earnings", () => {
    const r = computeTax(make(2025, { other: { selfEmploymentNetProfit: 100_000 }, adjustments: { selfEmployedRetirement: 30_000 } }));
    expect(r.warnings.some((w) => /25% of net SE earnings/.test(w))).toBe(true);
  });
  it("priorYearTaxWasZero → no penalty", () => {
    const r = computeTax(make(2025, { w2: { wages: 100_000 }, payments: { priorYearTaxWasZero: true } }));
    expect(r.safeHarbor).toMatchObject({ basis: "none_owed", requiredAnnualPayment: 0, meetsSafeHarbor: true });
  });
  it("generic adjustment column keeps its sign; inherited lots are long-term", () => {
    const r = parse1099B([
      "Description\tDate acquired\tDate sold\tProceeds\tCost basis\tAmount of adjustment",
      "AAA\t2025-01-02\t2025-02-01\t1000\t900\t-50",
      "INHERITED BBB\tInherited\t2025-03-01\t2000\t1500\t0",
    ].join("\n"));
    expect(r.errors).toEqual([]);
    expect(r.lots[0]!.washSaleDisallowed).toBe(-50);
    expect(r.lots[1]).toMatchObject({ inherited: true, term: "long", dateAcquired: "VARIOUS" });
    const s = summarizeLots(r.lots, 2025);
    expect(s.netShortTerm).toBe(50);
    expect(s.netLongTerm).toBe(500);
  });
});

describe("senior deduction AMT add-back (2025 Form 6251 instructions, line 1a)", () => {
  it("adds the senior deduction back to AMTI", () => {
    const base = defaultInput(2025);
    base.taxpayer.age65OrOlder = true;
    base.w2.wages = 60_000;
    const r = computeTax(base);
    expect(r.deduction.seniorDeduction).toBe(6_000);
    // AMTI = taxable income + standard deduction (incl. 65+ additional) + senior deduction
    expect(r.amt.amti).toBeCloseTo(r.taxableIncome + r.deduction.standardDeduction + 6_000, 2);
  });
});
