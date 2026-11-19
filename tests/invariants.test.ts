import { describe, expect, it } from "vitest";
import { computeTax, sweepLongTermGains, sweepOrdinaryIncome } from "../src/engine";
import type { FilingStatus, TaxInput } from "../src/engine/types";
import { make } from "./helpers";

/** Deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function collectNumbers(v: unknown, path: string, out: Array<[string, number]>): void {
  if (typeof v === "number") out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => collectNumbers(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) collectNumbers(x, `${path}.${k}`, out);
}

function randomInput(rand: () => number): TaxInput {
  const amt = (max: number) => (rand() < 0.4 ? 0 : Math.round(rand() * max));
  const signed = (max: number) => (rand() < 0.4 ? 0 : Math.round((rand() * 2 - 1) * max));
  const statuses: FilingStatus[] = ["single", "mfj", "mfs", "hoh"];
  const wages = amt(800_000);
  return make(rand() < 0.5 ? 2025 : 2026, {
    filingStatus: statuses[Math.floor(rand() * 4)]!,
    taxpayer: { age65OrOlder: rand() < 0.3, blind: rand() < 0.1 },
    spouse: { age65OrOlder: rand() < 0.3, blind: rand() < 0.1 },
    dependents: { qualifyingChildrenUnder17: Math.floor(rand() * 4), otherDependents: Math.floor(rand() * 2), eitcQualifyingChildren: Math.floor(rand() * 5) },
    w2: { wages, federalWithholding: amt(100_000), qualifiedTips: amt(40_000), qualifiedOvertime: amt(30_000) },
    spouseW2: { wages: amt(300_000), federalWithholding: amt(50_000) },
    investments: {
      taxableInterest: amt(50_000), taxExemptInterest: amt(20_000), ordinaryDividends: amt(60_000), qualifiedDividends: amt(60_000),
      netShortTermGain: signed(200_000), netLongTermGain: signed(500_000), section1256Gain: signed(100_000),
      shortTermLossCarryover: amt(30_000), longTermLossCarryover: amt(30_000),
    },
    other: {
      selfEmploymentNetProfit: signed(400_000), selfEmploymentIsSSTB: rand() < 0.5, iraDistributions: amt(80_000), pensions: amt(80_000),
      socialSecurityBenefits: amt(50_000), unemploymentCompensation: amt(20_000), scheduleEIncome: signed(60_000), otherIncome: signed(10_000), taxableStateRefund: amt(5_000),
    },
    adjustments: {
      hsaContribution: amt(10_000), traditionalIraContribution: amt(8_000), coveredByWorkplacePlan: rand() < 0.5, spouseCoveredByWorkplacePlan: rand() < 0.5,
      studentLoanInterest: amt(4_000), selfEmployedRetirement: amt(70_000), selfEmployedHealthInsurance: amt(20_000), educatorExpenses: amt(600), carLoanInterest: amt(15_000), otherAdjustments: amt(2_000),
    },
    deductions: {
      method: (["auto", "standard", "itemized"] as const)[Math.floor(rand() * 3)]!,
      itemized: {
        medicalExpenses: amt(50_000), stateLocalIncomeOrSalesTax: amt(60_000), realEstateTaxes: amt(30_000), personalPropertyTaxes: amt(3_000),
        mortgageInterest: amt(50_000), mortgagePrincipal: amt(2_000_000), charitableCash: amt(80_000), charitableNonCash: amt(40_000), casualtyLosses: amt(10_000), otherItemized: amt(5_000),
      },
    },
    credits: {
      childCareExpenses: amt(12_000), childCareQualifyingPersons: Math.floor(rand() * 3), americanOpportunityExpenses: amt(10_000), americanOpportunityStudents: Math.floor(rand() * 3),
      foreignTaxPaid: amt(5_000), retirementSaversContributions: amt(5_000), otherNonrefundableCredits: amt(2_000), otherRefundableCredits: amt(1_000),
    },
    payments: { estimatedTaxPaid: amt(50_000), priorYearTotalTax: amt(150_000), priorYearAGI: amt(800_000), excessSocialSecurityWithheld: amt(3_000) },
    amt: { isoBargainElement: amt(500_000), privateActivityBondInterest: amt(20_000), otherAmtAdjustments: signed(20_000) },
    claimedAsDependent: rand() < 0.1,
  });
}

describe("invariants (seeded fuzz, 200 iterations)", () => {
  it("never NaN/Infinity, totalTax ≥ 0, taxable income ≥ 0", () => {
    const rand = mulberry32(20251118);
    for (let i = 0; i < 200; i++) {
      const input = randomInput(rand);
      const r = computeTax(input);
      const nums: Array<[string, number]> = [];
      const { input: _ignored, trace, ...rest } = r;
      collectNumbers(rest, "result", nums);
      collectNumbers(trace.map((t) => t.amount), "trace", nums);
      for (const [path, n] of nums) expect(Number.isFinite(n), `iteration ${i}: ${path} = ${n}`).toBe(true);
      expect(r.totalTax).toBeGreaterThanOrEqual(0);
      expect(r.taxableIncome).toBeGreaterThanOrEqual(0);
      expect(r.regularTax).toBeLessThanOrEqual(Math.max(r.regularTax, 0));
      expect(r.credits.totalNonrefundable).toBeLessThanOrEqual(r.regularTax + r.amt.amtOwed);
    }
  });

  it("garbage inputs are clamped and warned, not NaN", () => {
    const bad = make(2025, { w2: { wages: Number.NaN, federalWithholding: -500 } });
    (bad.investments as unknown as Record<string, unknown>).taxableInterest = "1,000";
    const r = computeTax(bad);
    expect(r.totalIncome).toBe(1_000);
    expect(r.warnings.some((w) => /not a valid number/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /cannot be negative/.test(w))).toBe(true);
  });
});

describe("analysis sweeps", () => {
  it("ordinary sweep is monotone non-decreasing for a plain W-2 filer", () => {
    const pts = sweepOrdinaryIncome(make(2026), 0, 300_000, 10_000);
    expect(pts).toHaveLength(31);
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.totalTax).toBeGreaterThanOrEqual(pts[i - 1]!.totalTax);
    expect(pts[0]!.totalTax).toBe(0);
  });
  it("LTCG sweep reports 0% then 15% marginal rates", () => {
    const pts = sweepLongTermGains(make(2025, { w2: { wages: 30_000 } }), 0, 100_000, 50_000);
    expect(pts).toHaveLength(3);
    expect(pts[0]!.marginalRate).toBeCloseTo(0, 4);
    expect(pts[2]!.marginalRate).toBeCloseTo(0.15, 4);
  });
  it("bad step returns a single point", () => {
    expect(sweepOrdinaryIncome(make(2025), 0, 10, 0)).toHaveLength(1);
  });
});
