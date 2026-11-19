/**
 * Tax year 2025 parameters.
 *
 * Base inflation adjustments: Rev. Proc. 2024-40.
 * Overridden / added by the One Big Beautiful Bill Act (P.L. 119-21, signed 2025-07-04):
 * standard deduction, Child Tax Credit, SALT cap, senior / tips / overtime / car-loan deductions.
 */
import type { TaxYearParams } from "../types";

const INF = Number.POSITIVE_INFINITY;

export const PARAMS_2025: TaxYearParams = {
  year: 2025,
  sources: [
    "docs/TAX_PARAMS.md (verified research report, 2026-11-18)",
    "https://www.irs.gov/pub/irs-drop/rp-24-40.pdf",
    "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf",
    "https://www.irs.gov/pub/irs-drop/rp-24-25.pdf",
    "https://www.congress.gov/bill/119th-congress/house-bill/1/text",
    "https://www.irs.gov/newsroom/one-big-beautiful-bill-provisions",
    "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2025",
    "https://www.law.cornell.edu/uscode/text/26/151",
    "https://www.law.cornell.edu/uscode/text/26/163",
    "https://www.law.cornell.edu/uscode/text/26/164",
    "https://www.law.cornell.edu/uscode/text/26/224",
    "https://www.law.cornell.edu/uscode/text/26/225",
    "https://www.law.cornell.edu/uscode/text/26/1211",
    "https://www.law.cornell.edu/uscode/text/26/6654",
    "https://www.irs.gov/individuals/net-investment-income-tax",
    "https://www.irs.gov/newsroom/one-big-beautiful-bill-act-tax-deductions-for-working-americans-and-seniors",
    "https://www.irs.gov/payments/quarterly-interest-rates",
  ],
  brackets: {
    single: [
      { rate: 0.1, upTo: 11_925 },
      { rate: 0.12, upTo: 48_475 },
      { rate: 0.22, upTo: 103_350 },
      { rate: 0.24, upTo: 197_300 },
      { rate: 0.32, upTo: 250_525 },
      { rate: 0.35, upTo: 626_350 },
      { rate: 0.37, upTo: INF },
    ],
    mfj: [
      { rate: 0.1, upTo: 23_850 },
      { rate: 0.12, upTo: 96_950 },
      { rate: 0.22, upTo: 206_700 },
      { rate: 0.24, upTo: 394_600 },
      { rate: 0.32, upTo: 501_050 },
      { rate: 0.35, upTo: 751_600 },
      { rate: 0.37, upTo: INF },
    ],
    mfs: [
      { rate: 0.1, upTo: 11_925 },
      { rate: 0.12, upTo: 48_475 },
      { rate: 0.22, upTo: 103_350 },
      { rate: 0.24, upTo: 197_300 },
      { rate: 0.32, upTo: 250_525 },
      { rate: 0.35, upTo: 375_800 },
      { rate: 0.37, upTo: INF },
    ],
    hoh: [
      { rate: 0.1, upTo: 17_000 },
      { rate: 0.12, upTo: 64_850 },
      { rate: 0.22, upTo: 103_350 },
      { rate: 0.24, upTo: 197_300 },
      { rate: 0.32, upTo: 250_500 },
      { rate: 0.35, upTo: 626_350 },
      { rate: 0.37, upTo: INF },
    ],
  },
  // OBBBA §70102 raised 2025 amounts (Rev. Proc. 2024-40 had 15,000 / 30,000 / 22,500).
  standardDeduction: { single: 15_750, mfj: 31_500, mfs: 15_750, hoh: 23_625 },
  additionalStandardDeduction: { married: 1_600, unmarried: 2_000 },
  dependentStandardDeduction: { min: 1_350, earnedPlus: 450 },
  personalExemption: 0,
  seniorDeduction: {
    amount: 6_000,
    phaseoutStart: { single: 75_000, mfj: 150_000, mfs: 75_000, hoh: 75_000 },
    phaseoutRate: 0.06,
  },
  ltcgBreakpoints: {
    single: { zeroUpTo: 48_350, fifteenUpTo: 533_400 },
    mfj: { zeroUpTo: 96_700, fifteenUpTo: 600_050 },
    mfs: { zeroUpTo: 48_350, fifteenUpTo: 300_000 },
    hoh: { zeroUpTo: 64_750, fifteenUpTo: 566_700 },
  },
  niit: { rate: 0.038, threshold: { single: 200_000, mfj: 250_000, mfs: 125_000, hoh: 200_000 } },
  additionalMedicare: { rate: 0.009, threshold: { single: 200_000, mfj: 250_000, mfs: 125_000, hoh: 200_000 } },
  socialSecurity: { wageBase: 176_100, rate: 0.124, medicareRate: 0.029, seFactor: 0.9235 },
  amt: {
    exemption: { single: 88_100, mfj: 137_000, mfs: 68_500, hoh: 88_100 },
    phaseoutStart: { single: 626_350, mfj: 1_252_700, mfs: 626_350, hoh: 626_350 },
    phaseoutRate: 0.25,
    rate28Threshold: 239_100,
    rate28ThresholdMFS: 119_550,
  },
  childTaxCredit: {
    perChild: 2_200,
    otherDependent: 500,
    refundableMax: 1_700,
    refundableEarnedIncomeFloor: 2_500,
    refundableRate: 0.15,
    phaseoutStart: { single: 200_000, mfj: 400_000, mfs: 200_000, hoh: 200_000 },
    phaseoutPer1000: 50,
  },
  eitc: {
    maxCredit: [649, 4_328, 7_152, 8_046],
    earnedIncomeAmount: [8_490, 12_730, 17_880, 17_880],
    phaseoutStart: [10_620, 23_350, 23_350, 23_350],
    phaseoutStartMFJ: [17_730, 30_470, 30_470, 30_470],
    phaseoutEnd: [19_104, 50_434, 57_310, 61_555],
    phaseoutEndMFJ: [26_214, 57_554, 64_430, 68_675],
    investmentIncomeLimit: 11_950,
  },
  qbi: {
    rate: 0.2,
    thresholdStart: { single: 197_300, mfj: 394_600, mfs: 197_300, hoh: 197_300 },
    phaseInRange: { single: 50_000, mfj: 100_000, mfs: 50_000, hoh: 50_000 },
  },
  salt: {
    cap: { single: 40_000, mfj: 40_000, mfs: 20_000, hoh: 40_000 },
    phaseoutStart: { single: 500_000, mfj: 500_000, mfs: 250_000, hoh: 500_000 },
    phaseoutRate: 0.3,
    floor: { single: 10_000, mfj: 10_000, mfs: 5_000, hoh: 10_000 },
  },
  tipsDeduction: {
    max: 25_000,
    phaseoutStart: { single: 150_000, mfj: 300_000, mfs: 150_000, hoh: 150_000 },
    phaseoutRate: 0.1,
  },
  overtimeDeduction: {
    max: { single: 12_500, mfj: 25_000, mfs: 12_500, hoh: 12_500 },
    phaseoutStart: { single: 150_000, mfj: 300_000, mfs: 150_000, hoh: 150_000 },
    phaseoutRate: 0.1,
  },
  carLoanInterest: {
    max: 10_000,
    phaseoutStart: { single: 100_000, mfj: 200_000, mfs: 100_000, hoh: 100_000 },
    phaseoutPer1000: 200,
  },
  charitable: {
    nonItemizerMax: null,
    itemizedAgiFloor: 0,
    cashAgiLimit: 0.6,
    nonCashAgiLimit: 0.3,
    topBracketValueCap: null,
  },
  itemized: { medicalAgiFloor: 0.075, mortgageDebtLimit: 750_000 },
  studentLoanInterest: {
    max: 2_500,
    phaseoutStart: { single: 85_000, mfj: 170_000, mfs: 0, hoh: 85_000 },
    phaseoutRange: { single: 15_000, mfj: 30_000, mfs: 1, hoh: 15_000 },
  },
  iraDeduction: {
    limit: 7_000,
    catchUp50: 1_000,
    coveredPhaseoutStart: { single: 79_000, mfj: 126_000, mfs: 0, hoh: 79_000 },
    coveredPhaseoutRange: { single: 10_000, mfj: 20_000, mfs: 10_000, hoh: 10_000 },
    spouseCoveredPhaseoutStart: 236_000,
    spouseCoveredPhaseoutRange: 10_000,
  },
  hsa: { selfOnly: 4_300, family: 8_550, catchUp55: 1_000 },
  retirement401k: { limit: 23_500, catchUp50: 7_500, catchUp60to63: 11_250 },
  socialSecurityBenefits: {
    base: { single: 25_000, mfj: 32_000, mfs: 0, hoh: 25_000 },
    adjusted: { single: 34_000, mfj: 44_000, mfs: 0, hoh: 34_000 },
  },
  capitalLossLimit: { single: 3_000, mfj: 3_000, mfs: 1_500, hoh: 3_000 },
  // Twice the $1,350 sec. 1(g)(4)(A)(ii)(I) amount: unearned income above this is taxed at the parent's rate.
  kiddieTaxThreshold: 2_700,
  childCareCredit: {
    maxExpensesPerPerson: 3_000,
    maxPersons: 2,
    topRate: 0.35,
    bottomRate: 0.2,
    phaseStart: 15_000,
    phaseStep: 2_000,
  },
  aotc: {
    max: 2_500,
    first: 2_000,
    secondRate: 0.25,
    secondUpTo: 2_000,
    refundableShare: 0.4,
    phaseoutStart: { single: 80_000, mfj: 160_000, mfs: 0, hoh: 80_000 },
    phaseoutRange: { single: 10_000, mfj: 20_000, mfs: 1, hoh: 10_000 },
  },
  saversCredit: {
    maxContribution: 2_000,
    tiers: [
      { agiUpTo: { single: 23_750, mfj: 47_500, mfs: 23_750, hoh: 35_625 }, rate: 0.5 },
      { agiUpTo: { single: 25_750, mfj: 51_500, mfs: 25_750, hoh: 38_625 }, rate: 0.2 },
      { agiUpTo: { single: 39_500, mfj: 79_000, mfs: 39_500, hoh: 59_250 }, rate: 0.1 },
    ],
  },
  estimatedTax: {
    safeHarborPriorYearRate: 1.0,
    safeHarborHighIncomeRate: 1.1,
    highIncomeAGI: { single: 150_000, mfj: 150_000, mfs: 75_000, hoh: 150_000 },
    currentYearRate: 0.9,
    minimumOwed: 1_000,
    // Statutory 6/15 fell on a Sunday in 2025, so the Q2 deadline moved to Monday 6/16.
    dueDates: ["2025-04-15", "2025-06-16", "2025-09-15", "2026-01-15"],
  },
};
