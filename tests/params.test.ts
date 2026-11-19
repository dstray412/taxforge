/**
 * Pins figures from each section of docs/TAX_PARAMS.md (the verified research report).
 * Section numbers in test names match the report.
 */
import { describe, expect, it } from "vitest";
import { computeTax, getParams, SUPPORTED_YEARS } from "../src/engine";
import { make } from "./helpers";

const p25 = getParams(2025);
const p26 = getParams(2026);
const top = (year: 2025 | 2026, fs: "single" | "mfj" | "mfs" | "hoh", rate: number) =>
  getParams(year).brackets[fs].find((b) => b.rate === rate)!.upTo;

describe("verified parameters (docs/TAX_PARAMS.md)", () => {
  it("supports 2025 and 2026, each with sources", () => {
    expect(SUPPORTED_YEARS).toEqual([2025, 2026]);
    for (const y of SUPPORTED_YEARS) expect(getParams(y).sources.some((s) => s.includes("irs.gov/pub/irs-drop"))).toBe(true);
  });
  it("§1 brackets: MFS 35% tops, 2026 HOH 24%/32% tops", () => {
    expect(top(2025, "mfs", 0.35)).toBe(375_800);
    expect(top(2026, "mfs", 0.35)).toBe(384_350);
    expect(top(2026, "hoh", 0.24)).toBe(201_750);
    expect(top(2026, "hoh", 0.32)).toBe(256_200);
    expect(top(2026, "single", 0.24)).toBe(201_775);
    expect(top(2025, "mfj", 0.35)).toBe(751_600);
  });
  it("§2 standard deduction", () => {
    expect(p25.standardDeduction).toEqual({ single: 15_750, mfj: 31_500, mfs: 15_750, hoh: 23_625 });
    expect(p26.standardDeduction).toEqual({ single: 16_100, mfj: 32_200, mfs: 16_100, hoh: 24_150 });
    expect(p26.additionalStandardDeduction).toEqual({ married: 1_650, unmarried: 2_050 });
    expect(p26.personalExemption).toBe(0);
  });
  it("§3 senior deduction", () => {
    expect(p26.seniorDeduction).toEqual({ amount: 6_000, phaseoutStart: { single: 75_000, mfj: 150_000, mfs: 75_000, hoh: 75_000 }, phaseoutRate: 0.06 });
  });
  it("§4 capital gain breakpoints", () => {
    expect(p25.ltcgBreakpoints.mfs).toEqual({ zeroUpTo: 48_350, fifteenUpTo: 300_000 });
    expect(p26.ltcgBreakpoints.hoh).toEqual({ zeroUpTo: 66_200, fifteenUpTo: 579_600 });
  });
  it("§5-6 NIIT and Additional Medicare thresholds", () => {
    expect(p26.niit.threshold).toEqual({ single: 200_000, mfj: 250_000, mfs: 125_000, hoh: 200_000 });
    expect(p25.additionalMedicare.rate).toBe(0.009);
    expect(p25.additionalMedicare.threshold.mfj).toBe(250_000);
  });
  it("§7 Social Security wage base and SE factor", () => {
    expect(p25.socialSecurity.wageBase).toBe(176_100);
    expect(p26.socialSecurity.wageBase).toBe(184_500);
    expect(p26.socialSecurity.seFactor).toBe(0.9235);
  });
  it("§8 AMT: 2026 reset to $500k/$1M at 50%; exemption fully gone points", () => {
    expect(p26.amt.phaseoutStart).toEqual({ single: 500_000, mfj: 1_000_000, mfs: 500_000, hoh: 500_000 });
    expect(p26.amt.phaseoutRate).toBe(0.5);
    expect(p25.amt.phaseoutRate).toBe(0.25);
    const gone = (y: typeof p25, fs: "single" | "mfj" | "mfs") => y.amt.phaseoutStart[fs] + y.amt.exemption[fs] / y.amt.phaseoutRate;
    expect(gone(p25, "mfj")).toBe(1_800_700);
    expect(gone(p25, "single")).toBe(978_750);
    expect(gone(p25, "mfs")).toBe(900_350);
    expect(gone(p26, "mfj")).toBe(1_280_400);
    expect(gone(p26, "single")).toBe(680_200);
    expect(gone(p26, "mfs")).toBe(640_200);
    expect([p26.amt.rate28Threshold, p26.amt.rate28ThresholdMFS]).toEqual([244_500, 122_250]);
  });
  it("§9 Child Tax Credit", () => {
    for (const p of [p25, p26]) {
      expect(p.childTaxCredit.perChild).toBe(2_200);
      expect(p.childTaxCredit.refundableMax).toBe(1_700);
      expect(p.childTaxCredit.otherDependent).toBe(500);
      expect(p.childTaxCredit.phaseoutPer1000).toBe(50);
    }
  });
  it("§10 EITC", () => {
    expect(p25.eitc.maxCredit).toEqual([649, 4_328, 7_152, 8_046]);
    expect(p26.eitc.phaseoutEndMFJ).toEqual([26_820, 58_863, 65_899, 70_244]);
    expect(p26.eitc.investmentIncomeLimit).toBe(12_200);
  });
  it("§11 QBI: 2026 MFS threshold 201,775, wider phase-in, $400 minimum", () => {
    expect(p26.qbi.thresholdStart).toEqual({ single: 201_750, mfj: 403_500, mfs: 201_775, hoh: 201_750 });
    expect(p26.qbi.phaseInRange).toEqual({ single: 75_000, mfj: 150_000, mfs: 75_000, hoh: 75_000 });
    expect(p25.qbi.phaseInRange.mfj).toBe(100_000);
    expect(p26.qbi.minimumDeduction).toEqual({ amount: 400, minQbi: 1_000 });
    // wages 50,000 + profit 1,600: SE tax 226, half 113, QBI 1,487 → 20% = 297.40 → floored to $400 in 2026.
    const r26 = computeTax(make(2026, { w2: { wages: 50_000 }, other: { selfEmploymentNetProfit: 1_600 } }));
    expect(r26.deduction.qbiDeduction).toBe(400);
    const r25 = computeTax(make(2025, { w2: { wages: 50_000 }, other: { selfEmploymentNetProfit: 1_600 } }));
    expect(r25.deduction.qbiDeduction).toBeCloseTo(297.4, 2);
  });
  it("§12 SALT", () => {
    expect(p26.salt.cap).toEqual({ single: 40_400, mfj: 40_400, mfs: 20_200, hoh: 40_400 });
    expect(p26.salt.phaseoutStart.mfs).toBe(252_500);
    expect(p25.salt.floor.mfs).toBe(5_000);
    expect(p26.salt.phaseoutRate).toBe(0.3);
  });
  it("§13 tips/overtime at 10%, car loan at $200 per $1,000", () => {
    expect(p26.tipsDeduction!.phaseoutRate).toBe(0.1);
    expect(p26.overtimeDeduction!.max.mfj).toBe(25_000);
    expect(p26.carLoanInterest!.phaseoutPer1000).toBe(200);
    // 2026 single AGI 110,000: 10,000 − 10 × 200 = 8,000
    expect(computeTax(make(2026, { w2: { wages: 110_000 }, adjustments: { carLoanInterest: 11_000 } })).deduction.carLoanInterestDeduction).toBe(8_000);
  });
  it("§14 charitable and the sec. 68 2/37 reduction", () => {
    expect(p26.charitable.nonItemizerMax).toEqual({ single: 1_000, mfj: 2_000, mfs: 1_000, hoh: 1_000 });
    expect(p26.charitable.itemizedAgiFloor).toBe(0.005);
    expect((0.37 - p26.charitable.topBracketValueCap!) / 0.37).toBeCloseTo(2 / 37, 12);
    expect(p25.charitable.nonItemizerMax).toBeNull();
    expect(p25.charitable.topBracketValueCap).toBeNull();
  });
  it("§15 student loan, IRA, HSA, 401(k)", () => {
    expect(p26.studentLoanInterest.phaseoutStart.mfj + p26.studentLoanInterest.phaseoutRange.mfj).toBe(205_000);
    expect(p25.studentLoanInterest.phaseoutStart.mfj).toBe(170_000);
    expect(p26.studentLoanInterest.phaseoutStart.single + p26.studentLoanInterest.phaseoutRange.single).toBe(100_000);
    expect(p26.iraDeduction.limit).toBe(7_500);
    expect(p26.iraDeduction.catchUp50).toBe(1_100);
    expect(p26.iraDeduction.spouseCoveredPhaseoutStart).toBe(242_000);
    expect(p25.iraDeduction.coveredPhaseoutStart.mfj).toBe(126_000);
    expect(p26.hsa).toEqual({ selfOnly: 4_400, family: 8_750, catchUp55: 1_000 });
    expect(p26.retirement401k).toEqual({ limit: 24_500, catchUp50: 8_000, catchUp60to63: 11_250 });
  });
  it("2026 Saver's credit top tier (IR-2025-111)", () => {
    expect(p26.saversCredit.tiers[2]!.agiUpTo).toEqual({ single: 40_250, mfj: 80_500, mfs: 40_250, hoh: 60_375 });
    expect(p25.saversCredit.tiers[2]!.agiUpTo.mfj).toBe(79_000);
  });
  it("§16 estimated tax", () => {
    expect(p26.estimatedTax.highIncomeAGI.mfs).toBe(75_000);
    expect(p26.estimatedTax.safeHarborHighIncomeRate).toBe(1.1);
    expect(p26.estimatedTax.dueDates).toEqual(["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"]);
  });
  it("§17 capital loss limit", () => {
    expect(p26.capitalLossLimit).toEqual({ single: 3_000, mfj: 3_000, mfs: 1_500, hoh: 3_000 });
  });
  it("§18 kiddie tax: threshold is twice the $1,350 amount", () => {
    expect(p26.kiddieTaxThreshold).toBe(2 * 1_350);
    expect(p26.dependentStandardDeduction).toEqual({ min: 1_350, earnedPlus: 450 });
  });
  it("§19 itemized items: 7.5% medical floor, $750k mortgage limit", () => {
    expect(p26.itemized).toEqual({ medicalAgiFloor: 0.075, mortgageDebtLimit: 750_000 });
  });
});
