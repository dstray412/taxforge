/**
 * Tax year 2026 parameters.
 *
 * Inflation adjustments: Rev. Proc. 2025-32 (which already incorporates OBBBA, P.L. 119-21).
 * OBBBA items first effective in 2026: non-itemizer charitable deduction, 0.5% AGI floor on
 * itemized charitable, 35% value cap on itemized deductions for 37%-bracket filers, AMT phaseout
 * reset ($500k / $1M, 50% rate), wider QBI phase-in range, enhanced dependent care credit.
 */
import type { TaxYearParams } from "../types";

const INF = Number.POSITIVE_INFINITY;

export const PARAMS_2026: TaxYearParams = {
  year: 2026,
  sources: [
    "docs/TAX_PARAMS.md (verified research report, 2026-11-18)",
    "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf",
    "https://www.irs.gov/pub/irs-drop/rp-25-19.pdf",
    "https://www.govinfo.gov/content/pkg/FR-2025-11-03/pdf/2025-19763.pdf",
    "https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500",
    "https://www.irs.gov/newsroom/irs-reminder-permanent-charitable-contribution-deduction-begins-for-returns-filed-next-year-for-taxpayers-who-do-not-itemize",
    "https://www.irs.gov/newsroom/interest-rates-remain-the-same-for-the-fourth-quarter-of-2026",
    "https://www.law.cornell.edu/uscode/text/26/55",
    "https://www.law.cornell.edu/uscode/text/26/68",
    "https://www.law.cornell.edu/uscode/text/26/199A",
    "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill",
    "https://www.congress.gov/bill/119th-congress/house-bill/1/text",
    "https://www.irs.gov/newsroom/one-big-beautiful-bill-provisions",
    "https://www.law.cornell.edu/uscode/text/26/164",
    "https://www.law.cornell.edu/uscode/text/26/163",
  ],
  brackets: {
    single: [
      { rate: 0.1, upTo: 12_400 },
      { rate: 0.12, upTo: 50_400 },
      { rate: 0.22, upTo: 105_700 },
      { rate: 0.24, upTo: 201_775 },
      { rate: 0.32, upTo: 256_225 },
      { rate: 0.35, upTo: 640_600 },
      { rate: 0.37, upTo: INF },
    ],
    mfj: [
      { rate: 0.1, upTo: 24_800 },
      { rate: 0.12, upTo: 100_800 },
      { rate: 0.22, upTo: 211_400 },
      { rate: 0.24, upTo: 403_550 },
      { rate: 0.32, upTo: 512_450 },
      { rate: 0.35, upTo: 768_700 },
      { rate: 0.37, upTo: INF },
    ],
    mfs: [
      { rate: 0.1, upTo: 12_400 },
      { rate: 0.12, upTo: 50_400 },
      { rate: 0.22, upTo: 105_700 },
      { rate: 0.24, upTo: 201_775 },
      { rate: 0.32, upTo: 256_225 },
      { rate: 0.35, upTo: 384_350 },
      { rate: 0.37, upTo: INF },
    ],
    hoh: [
      { rate: 0.1, upTo: 17_700 },
      { rate: 0.12, upTo: 67_450 },
      { rate: 0.22, upTo: 105_700 },
      { rate: 0.24, upTo: 201_750 },
      { rate: 0.32, upTo: 256_200 },
      { rate: 0.35, upTo: 640_600 },
      { rate: 0.37, upTo: INF },
    ],
  },
  standardDeduction: { single: 16_100, mfj: 32_200, mfs: 16_100, hoh: 24_150 },
  additionalStandardDeduction: { married: 1_650, unmarried: 2_050 },
  dependentStandardDeduction: { min: 1_350, earnedPlus: 450 },
  personalExemption: 0,
  seniorDeduction: {
    amount: 6_000,
    phaseoutStart: { single: 75_000, mfj: 150_000, mfs: 75_000, hoh: 75_000 },
    phaseoutRate: 0.06,
  },
  ltcgBreakpoints: {
    single: { zeroUpTo: 49_450, fifteenUpTo: 545_500 },
    mfj: { zeroUpTo: 98_900, fifteenUpTo: 613_700 },
    mfs: { zeroUpTo: 49_450, fifteenUpTo: 306_850 },
    hoh: { zeroUpTo: 66_200, fifteenUpTo: 579_600 },
  },
  niit: { rate: 0.038, threshold: { single: 200_000, mfj: 250_000, mfs: 125_000, hoh: 200_000 } },
  additionalMedicare: { rate: 0.009, threshold: { single: 200_000, mfj: 250_000, mfs: 125_000, hoh: 200_000 } },
  socialSecurity: { wageBase: 184_500, rate: 0.124, medicareRate: 0.029, seFactor: 0.9235 },
  amt: {
    exemption: { single: 90_100, mfj: 140_200, mfs: 70_100, hoh: 90_100 },
    // OBBBA reset the phaseout thresholds to 2018 levels ($500k / $1M) and doubled the rate to 50%.
    phaseoutStart: { single: 500_000, mfj: 1_000_000, mfs: 500_000, hoh: 500_000 },
    phaseoutRate: 0.5,
    rate28Threshold: 244_500,
    rate28ThresholdMFS: 122_250,
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
    maxCredit: [664, 4_427, 7_316, 8_231],
    earnedIncomeAmount: [8_680, 13_020, 18_290, 18_290],
    phaseoutStart: [10_860, 23_890, 23_890, 23_890],
    phaseoutStartMFJ: [18_140, 31_160, 31_160, 31_160],
    phaseoutEnd: [19_540, 51_593, 58_629, 62_974],
    phaseoutEndMFJ: [26_820, 58_863, 65_899, 70_244],
    investmentIncomeLimit: 12_200,
  },
  qbi: {
    rate: 0.2,
    thresholdStart: { single: 201_750, mfj: 403_500, mfs: 201_775, hoh: 201_750 },
    // OBBBA widened the phase-in range from $50k / $100k to $75k / $150k.
    phaseInRange: { single: 75_000, mfj: 150_000, mfs: 75_000, hoh: 75_000 },
    minimumDeduction: { amount: 400, minQbi: 1_000 },
  },
  salt: {
    cap: { single: 40_400, mfj: 40_400, mfs: 20_200, hoh: 40_400 },
    phaseoutStart: { single: 505_000, mfj: 505_000, mfs: 252_500, hoh: 505_000 },
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
    nonItemizerMax: { single: 1_000, mfj: 2_000, mfs: 1_000, hoh: 1_000 },
    itemizedAgiFloor: 0.005,
    cashAgiLimit: 0.6,
    nonCashAgiLimit: 0.3,
    topBracketValueCap: 0.35,
  },
  itemized: { medicalAgiFloor: 0.075, mortgageDebtLimit: 750_000 },
  studentLoanInterest: {
    max: 2_500,
    phaseoutStart: { single: 85_000, mfj: 175_000, mfs: 0, hoh: 85_000 },
    phaseoutRange: { single: 15_000, mfj: 30_000, mfs: 1, hoh: 15_000 },
  },
  iraDeduction: {
    limit: 7_500,
    catchUp50: 1_100,
    coveredPhaseoutStart: { single: 81_000, mfj: 129_000, mfs: 0, hoh: 81_000 },
    coveredPhaseoutRange: { single: 10_000, mfj: 20_000, mfs: 10_000, hoh: 10_000 },
    spouseCoveredPhaseoutStart: 242_000,
    spouseCoveredPhaseoutRange: 10_000,
  },
  hsa: { selfOnly: 4_400, family: 8_750, catchUp55: 1_000 },
  retirement401k: { limit: 24_500, catchUp50: 8_000, catchUp60to63: 11_250 },
  socialSecurityBenefits: {
    base: { single: 25_000, mfj: 32_000, mfs: 0, hoh: 25_000 },
    adjusted: { single: 34_000, mfj: 44_000, mfs: 0, hoh: 34_000 },
  },
  capitalLossLimit: { single: 3_000, mfj: 3_000, mfs: 1_500, hoh: 3_000 },
  // Twice the $1,350 sec. 1(g)(4)(A)(ii)(I) amount (Rev. Proc. 2025-32 sec. 4.02): unearned income above this is taxed at the parent's rate.
  kiddieTaxThreshold: 2_700,
  // OBBBA §70405: 50% top rate, stepping down to 35% above $15k AGI, then to 20% above $75k / $150k.
  childCareCredit: {
    maxExpensesPerPerson: 3_000,
    maxPersons: 2,
    topRate: 0.5,
    bottomRate: 0.2,
    phaseStart: 15_000,
    phaseStep: 2_000,
    midRate: 0.35,
    secondPhaseStart: { single: 75_000, mfj: 150_000, mfs: 75_000, hoh: 75_000 },
    secondPhaseStep: { single: 2_000, mfj: 4_000, mfs: 2_000, hoh: 2_000 }, // verified: Notice 2025-67 / sec. 21(a)(2)
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
      { agiUpTo: { single: 24_250, mfj: 48_500, mfs: 24_250, hoh: 36_375 }, rate: 0.5 }, // verified: Notice 2025-67 / sec. 21(a)(2)
      { agiUpTo: { single: 26_250, mfj: 52_500, mfs: 26_250, hoh: 39_375 }, rate: 0.2 }, // verified: Notice 2025-67 / sec. 21(a)(2)
      { agiUpTo: { single: 40_250, mfj: 80_500, mfs: 40_250, hoh: 60_375 }, rate: 0.1 }, // IR-2025-111
    ],
  },
  estimatedTax: {
    safeHarborPriorYearRate: 1.0,
    safeHarborHighIncomeRate: 1.1,
    highIncomeAGI: { single: 150_000, mfj: 150_000, mfs: 75_000, hoh: 150_000 },
    currentYearRate: 0.9,
    minimumOwed: 1_000,
    dueDates: ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"],
  },
};
