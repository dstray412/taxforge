/**
 * TaxForge engine — public types.
 *
 * Design rules:
 *  - The engine is pure: `computeTax(input) -> TaxResult`. No I/O, no Date.now().
 *  - Every dollar figure is a JS number in whole dollars or cents as entered; the engine
 *    rounds only where the IRS forms round (final tax lines) and documents it in the trace.
 *  - Every material computation emits a TraceLine so the UI can show a worksheet-style
 *    explanation ("why is my tax $X?"). The trace is the audit log.
 */

export type TaxYear = 2025 | 2026;

export type FilingStatus =
  | "single"
  | "mfj" // married filing jointly (qualifying surviving spouse uses the same tables)
  | "mfs" // married filing separately
  | "hoh"; // head of household

export interface PersonFlags {
  age65OrOlder: boolean;
  blind: boolean;
  /** IRA catch-up eligibility. Implied by age65OrOlder. */
  age50OrOlder?: boolean;
  /** HSA catch-up eligibility. Implied by age65OrOlder. */
  age55OrOlder?: boolean;
}

export interface Dependents {
  /** Qualifying children under 17 at year end with a valid SSN (Child Tax Credit). */
  qualifyingChildrenUnder17: number;
  /** Other dependents (Credit for Other Dependents, $500 each). */
  otherDependents: number;
  /** EITC qualifying children (may differ from CTC count; capped at 3 for the credit). */
  eitcQualifyingChildren: number;
}

export interface W2Income {
  /** Box 1 wages, tips, other compensation. */
  wages: number;
  /** Box 2 federal income tax withheld. */
  federalWithholding: number;
  /** Box 5 Medicare wages (used for Additional Medicare Tax). Defaults to `wages` if 0. */
  medicareWages?: number;
  /** Box 3 Social Security wages (Schedule SE line 8a). When 0/undefined falls back to medicareWages, then wages. */
  socialSecurityWages?: number;
  /** OBBBA: qualified tips included in Box 1 (deductible 2025-2028, subject to cap and phaseout). */
  qualifiedTips?: number;
  /** OBBBA: qualified overtime premium pay included in Box 1 (deductible 2025-2028). */
  qualifiedOvertime?: number;
}

export interface InvestmentIncome {
  taxableInterest: number;
  taxExemptInterest: number;
  ordinaryDividends: number;
  /** Subset of ordinaryDividends that is qualified. */
  qualifiedDividends: number;
  /** Net short-term capital gain or loss (negative = loss) from Schedule D line 7. */
  netShortTermGain: number;
  /** Net long-term capital gain or loss (negative = loss) from Schedule D line 15. */
  netLongTermGain: number;
  /** Section 1256 contracts (index options, futures) net gain/loss — split 60% LT / 40% ST. */
  section1256Gain: number;
  /** Prior-year capital loss carryforward (enter as a positive number). Short-term portion. */
  shortTermLossCarryover: number;
  /** Prior-year capital loss carryforward (positive number). Long-term portion. */
  longTermLossCarryover: number;
}

export interface OtherIncome {
  /** Schedule C net profit (or loss, negative). Drives SE tax and QBI. */
  selfEmploymentNetProfit: number;
  /** Whether the SE business is a Specified Service Trade or Business (affects QBI above threshold). */
  selfEmploymentIsSSTB: boolean;
  /** W-2 wages paid by the business (QBI W-2 wage limitation). */
  qbiW2Wages?: number;
  /** Unadjusted basis immediately after acquisition of qualified property (QBI UBIA limitation). */
  qbiUBIA?: number;
  /** Taxable IRA distributions. */
  iraDistributions: number;
  /** Taxable pensions and annuities. */
  pensions: number;
  /** Gross Social Security benefits (box 5 of SSA-1099). Engine computes the taxable portion. */
  socialSecurityBenefits: number;
  unemploymentCompensation: number;
  /** Net rental / royalty / partnership income from Schedule E (negative allowed). */
  scheduleEIncome: number;
  /** Any other taxable income (Schedule 1 line 8z, gambling, prizes, etc). */
  otherIncome: number;
  /** State tax refund received that is taxable (only if itemized last year and benefited). */
  taxableStateRefund: number;
}

export interface Adjustments {
  hsaContribution: number;
  /** HDHP coverage type for the HSA cap. Defaults to "family". */
  hsaCoverage?: "self" | "family";
  /** Taxpayer's traditional IRA contribution. */
  traditionalIraContribution: number;
  /** Spouse's traditional IRA contribution (MFJ). Each spouse is phased out on their own regime. */
  spouseTraditionalIraContribution?: number;
  /** Whether the taxpayer (or spouse) is covered by a workplace retirement plan — affects IRA deductibility. */
  coveredByWorkplacePlan: boolean;
  spouseCoveredByWorkplacePlan: boolean;
  studentLoanInterest: number;
  /** SEP / SIMPLE / solo 401(k) contributions by the self-employed. */
  selfEmployedRetirement: number;
  selfEmployedHealthInsurance: number;
  educatorExpenses: number;
  /** OBBBA: qualified passenger vehicle loan interest (2025-2028, capped, phased out). */
  carLoanInterest: number;
  otherAdjustments: number;
}

export interface ItemizedInputs {
  medicalExpenses: number;
  /** State and local income taxes paid (or general sales taxes if elected). */
  stateLocalIncomeOrSalesTax: number;
  realEstateTaxes: number;
  personalPropertyTaxes: number;
  mortgageInterest: number;
  /** Original mortgage principal, used to apply the $750k acquisition-debt limit (0 = assume under limit). */
  mortgagePrincipal: number;
  charitableCash: number;
  charitableNonCash: number;
  /** Casualty losses in federally declared disaster areas, already net of the per-event and 10% floors. */
  casualtyLosses: number;
  otherItemized: number;
}

export interface DeductionChoice {
  method: "auto" | "standard" | "itemized";
  itemized: ItemizedInputs;
}

export interface CreditInputs {
  /** Child and dependent care expenses paid (engine applies the per-child cap and AGI-based rate). */
  childCareExpenses: number;
  /** Number of qualifying persons for the dependent care credit. */
  childCareQualifyingPersons: number;
  /** Qualified education expenses for American Opportunity Credit (per student aggregate; engine caps). */
  americanOpportunityExpenses: number;
  /** Number of students for AOTC. */
  americanOpportunityStudents: number;
  foreignTaxPaid: number;
  /** Retirement savings contributions eligible for the Saver's Credit. */
  retirementSaversContributions: number;
  /** Any other nonrefundable credits (energy credits, adoption, etc.). */
  otherNonrefundableCredits: number;
  /** Any other refundable credits. */
  otherRefundableCredits: number;
}

export interface Payments {
  estimatedTaxPaid: number;
  /** Prior-year total tax (Form 1040 line 24 of last year's return) for the safe-harbor test. */
  priorYearTotalTax: number;
  priorYearAGI: number;
  /** Last year's total tax was $0 (full 12-month year): no estimated-tax penalty can apply. */
  priorYearTaxWasZero?: boolean;
  /** Excess Social Security withheld from multiple employers (rare). */
  excessSocialSecurityWithheld: number;
}

export interface AMTInputs {
  /** ISO bargain element exercised and held (AMT preference). */
  isoBargainElement: number;
  /** Private activity bond interest (AMT preference). */
  privateActivityBondInterest: number;
  otherAmtAdjustments: number;
}

export interface TaxInput {
  taxYear: TaxYear;
  filingStatus: FilingStatus;
  taxpayer: PersonFlags;
  /** Required when filingStatus is mfj or mfs. */
  spouse?: PersonFlags;
  dependents: Dependents;
  w2: W2Income;
  /** Spouse W-2 (MFJ). Kept separate because Additional Medicare and tips/overtime caps are per-return but wages can be analysed per person. */
  spouseW2?: W2Income;
  investments: InvestmentIncome;
  other: OtherIncome;
  adjustments: Adjustments;
  deductions: DeductionChoice;
  credits: CreditInputs;
  payments: Payments;
  amt: AMTInputs;
  /** Can the taxpayer be claimed as a dependent on someone else's return? (limits standard deduction) */
  claimedAsDependent: boolean;
  /** MFS only: spouse had no gross income and is not a dependent, so the spouse's 65+/blind additional standard deduction counts. */
  spouseHadNoGrossIncome?: boolean;
  /** Earned income from prior year — only used if the user elects the EITC lookback. Leave 0. */
  options?: {
    /** Split section 1256 gains 60% long-term / 40% short-term (default true). When false the whole 1256 amount is treated as short-term. */
    includeSection1256In60_40?: boolean;
    /** Estimated-tax installments still ahead (1-4). The engine has no clock, so it defaults to 4. */
    installmentsRemaining?: number;
  };
}

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

export type TraceSeverity = "info" | "warn";

export interface TraceLine {
  /** Stable identifier, e.g. "agi", "std_deduction", "ltcg_15pct". */
  id: string;
  /** Section grouping for the UI: "income" | "adjustments" | "deductions" | "tax" | "credits" | "payments" | "other_taxes". */
  section: string;
  label: string;
  amount: number;
  /** Form/line reference, e.g. "Form 1040, line 11". */
  ref?: string;
  /** Plain-English explanation of how the amount was derived. */
  note?: string;
  severity?: TraceSeverity;
}

export interface DeductionDetail {
  method: "standard" | "itemized";
  standardDeduction: number;
  itemizedTotal: number;
  itemizedBreakdown: {
    medical: number;
    saltAllowed: number;
    saltCap: number;
    mortgageInterest: number;
    charitable: number;
    casualty: number;
    other: number;
  };
  /** OBBBA senior deduction (2025-2028), reported separately from the standard deduction. */
  seniorDeduction: number;
  /** OBBBA no-tax-on-tips deduction. */
  tipsDeduction: number;
  /** OBBBA no-tax-on-overtime deduction. */
  overtimeDeduction: number;
  /** OBBBA car loan interest deduction. */
  carLoanInterestDeduction: number;
  /** OBBBA above-the-line charitable deduction for non-itemizers (2026+). */
  nonItemizerCharitable: number;
  qbiDeduction: number;
}

export interface CapitalGainsDetail {
  netShortTerm: number;
  netLongTerm: number;
  /** Net capital gain or loss after netting ST/LT and carryovers. */
  netCapitalGainOrLoss: number;
  /** Loss deducted against ordinary income this year (max 3,000 / 1,500 MFS). */
  capitalLossDeducted: number;
  /** Loss carried forward to next year, split by character. */
  carryforwardShortTerm: number;
  carryforwardLongTerm: number;
  /** Amount taxed at each preferential rate. */
  taxedAt0: number;
  taxedAt15: number;
  taxedAt20: number;
  preferentialTax: number;
}

export interface SocialSecurityDetail {
  grossBenefits: number;
  taxableBenefits: number;
  provisionalIncome: number;
}

export interface SelfEmploymentDetail {
  netProfit: number;
  netEarnings: number; // 92.35%
  socialSecurityTax: number;
  medicareTax: number;
  totalSETax: number;
  halfSETaxDeduction: number;
}

export interface AMTDetail {
  amti: number;
  exemption: number;
  tentativeMinimumTax: number;
  amtOwed: number;
}

export interface CreditsDetail {
  childTaxCredit: number;
  otherDependentCredit: number;
  additionalChildTaxCredit: number; // refundable portion
  earnedIncomeCredit: number;
  childCareCredit: number;
  americanOpportunityNonrefundable: number;
  americanOpportunityRefundable: number;
  saversCredit: number;
  foreignTaxCredit: number;
  otherNonrefundable: number;
  otherRefundable: number;
  totalNonrefundable: number;
  totalRefundable: number;
}

export interface SafeHarborDetail {
  requiredAnnualPayment: number;
  basis: "90pct_current" | "100pct_prior" | "110pct_prior" | "none_owed";
  totalWithholdingAndEstimates: number;
  shortfall: number;
  meetsSafeHarbor: boolean;
  /** Suggested equal quarterly estimated payment to cover the shortfall over remaining quarters. */
  suggestedQuarterly: number;
}

export interface TaxResult {
  input: TaxInput;
  totalIncome: number;
  totalAdjustments: number;
  agi: number;
  magi: number; // AGI + tax-exempt interest (used for NIIT, senior deduction etc. where appropriate)
  deduction: DeductionDetail;
  taxableIncome: number;
  /** Tax on ordinary income (bracket schedule). */
  ordinaryIncomeTax: number;
  capitalGains: CapitalGainsDetail;
  /** Regular tax = ordinary tax + preferential tax (Form 1040 line 16). */
  regularTax: number;
  amt: AMTDetail;
  socialSecurity: SocialSecurityDetail;
  selfEmployment: SelfEmploymentDetail;
  niit: number;
  additionalMedicareTax: number;
  credits: CreditsDetail;
  /** Tax after nonrefundable credits (line 22) + other taxes (SE, NIIT, Add'l Medicare) = line 24. */
  totalTax: number;
  totalPayments: number;
  /** Positive = refund, negative = balance due. */
  refundOrBalanceDue: number;
  effectiveRateOnAGI: number;
  effectiveRateOnTaxableIncome: number;
  /** Marginal federal rate on the next $1,000 of ordinary income (includes phase-outs, computed numerically). */
  marginalRateOrdinary: number;
  /** Marginal rate on the next $1,000 of long-term capital gain (includes NIIT). */
  marginalRateLTCG: number;
  /** The statutory bracket the last ordinary dollar fell in. */
  topBracket: number;
  safeHarbor: SafeHarborDetail;
  trace: TraceLine[];
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Parameters (per tax year)                                           */
/* ------------------------------------------------------------------ */

export type ByStatus<T> = Record<FilingStatus, T>;

export interface Bracket {
  rate: number;
  /** Upper bound of taxable income for this bracket (Infinity for the top). */
  upTo: number;
}

export interface TaxYearParams {
  year: TaxYear;
  sources: string[];
  brackets: ByStatus<Bracket[]>;
  standardDeduction: ByStatus<number>;
  /** Additional standard deduction per condition (age 65+ or blind). */
  additionalStandardDeduction: { married: number; unmarried: number };
  /** Standard deduction for someone claimed as a dependent: greater of `dependentMin` or earned income + `dependentEarnedPlus`, capped at normal. */
  dependentStandardDeduction: { min: number; earnedPlus: number };
  personalExemption: number;
  /** OBBBA senior deduction (2025-2028): per qualifying individual, MAGI phaseout. */
  seniorDeduction: { amount: number; phaseoutStart: ByStatus<number>; phaseoutRate: number } | null;
  ltcgBreakpoints: ByStatus<{ zeroUpTo: number; fifteenUpTo: number }>;
  niit: { rate: number; threshold: ByStatus<number> };
  additionalMedicare: { rate: number; threshold: ByStatus<number> };
  socialSecurity: { wageBase: number; rate: number; medicareRate: number; seFactor: number };
  amt: {
    exemption: ByStatus<number>;
    phaseoutStart: ByStatus<number>;
    phaseoutRate: number;
    rate28Threshold: number; // 26% below, 28% above (MFS uses half)
    rate28ThresholdMFS: number;
  };
  childTaxCredit: {
    perChild: number;
    otherDependent: number;
    refundableMax: number;
    refundableEarnedIncomeFloor: number;
    refundableRate: number;
    phaseoutStart: ByStatus<number>;
    phaseoutPer1000: number;
  };
  eitc: {
    /** Index = number of qualifying children (0..3). */
    maxCredit: number[];
    earnedIncomeAmount: number[]; // income at which max credit is reached
    phaseoutStart: number[]; // for single/hoh
    phaseoutStartMFJ: number[];
    phaseoutEnd: number[]; // completed phaseout, single/hoh
    phaseoutEndMFJ: number[];
    investmentIncomeLimit: number;
  };
  qbi: {
    rate: number;
    thresholdStart: ByStatus<number>;
    phaseInRange: ByStatus<number>;
    /** OBBBA (2026+): minimum deduction when active QBI is at least `minQbi`. */
    minimumDeduction?: { amount: number; minQbi: number };
  };
  salt: {
    cap: ByStatus<number>;
    phaseoutStart: ByStatus<number>;
    phaseoutRate: number;
    floor: ByStatus<number>;
  };
  /** OBBBA 2025-2028 deductions. null when not in effect. */
  tipsDeduction: { max: number; phaseoutStart: ByStatus<number>; phaseoutRate: number } | null;
  overtimeDeduction: { max: ByStatus<number>; phaseoutStart: ByStatus<number>; phaseoutRate: number } | null;
  carLoanInterest: { max: number; phaseoutStart: ByStatus<number>; phaseoutPer1000: number } | null;
  charitable: {
    /** Above-the-line charitable deduction for non-itemizers (2026+), else null. */
    nonItemizerMax: ByStatus<number> | null;
    /** AGI floor for itemized charitable (2026+: 0.005), else 0. */
    itemizedAgiFloor: number;
    cashAgiLimit: number; // 0.60
    nonCashAgiLimit: number; // 0.30
    /** 2026+: itemized deductions worth at most 35 cents per dollar for 37% bracket taxpayers (Pease-like). */
    topBracketValueCap: number | null;
  };
  itemized: {
    medicalAgiFloor: number;
    mortgageDebtLimit: number;
  };
  studentLoanInterest: { max: number; phaseoutStart: ByStatus<number>; phaseoutRange: ByStatus<number> };
  iraDeduction: {
    limit: number;
    catchUp50: number;
    /** Phaseout of deductibility when covered by a workplace plan. */
    coveredPhaseoutStart: ByStatus<number>;
    coveredPhaseoutRange: ByStatus<number>;
    /** Phaseout when only the spouse is covered (MFJ). */
    spouseCoveredPhaseoutStart: number;
    spouseCoveredPhaseoutRange: number;
  };
  hsa: { selfOnly: number; family: number; catchUp55: number };
  retirement401k: { limit: number; catchUp50: number; catchUp60to63: number };
  socialSecurityBenefits: {
    /** Provisional income thresholds for 50% / 85% inclusion. */
    base: ByStatus<number>;
    adjusted: ByStatus<number>;
  };
  capitalLossLimit: ByStatus<number>;
  kiddieTaxThreshold: number;
  childCareCredit: {
    maxExpensesPerPerson: number;
    maxPersons: number;
    topRate: number;
    bottomRate: number;
    phaseStart: number;
    /** AGI step per 1-point rate reduction in the first phase-down (default 2,000). */
    phaseStep?: number;
    /** OBBBA (2026+): two-stage phase-down. Rate first falls from topRate to midRate, then (above secondPhaseStart) to bottomRate. */
    midRate?: number;
    secondPhaseStart?: ByStatus<number>;
    secondPhaseStep?: ByStatus<number>;
  };
  aotc: { max: number; first: number; secondRate: number; secondUpTo: number; refundableShare: number; phaseoutStart: ByStatus<number>; phaseoutRange: ByStatus<number> };
  saversCredit: { maxContribution: number; tiers: Array<{ agiUpTo: ByStatus<number>; rate: number }> };
  estimatedTax: {
    safeHarborPriorYearRate: number; // 1.00
    safeHarborHighIncomeRate: number; // 1.10
    highIncomeAGI: ByStatus<number>; // 150k / 75k mfs
    currentYearRate: number; // 0.90
    minimumOwed: number; // 1,000
    dueDates: string[]; // ISO dates for the four installments
  };
}

/* ------------------------------------------------------------------ */
/* 1099-B / Form 8949 import                                           */
/* ------------------------------------------------------------------ */

export interface BrokerLot {
  description: string;
  /** ISO date yyyy-mm-dd, or "VARIOUS". */
  dateAcquired: string;
  /** ISO date yyyy-mm-dd. */
  dateSold: string;
  proceeds: number;
  costBasis: number;
  /** Wash sale loss disallowed reported by broker (code W), positive number. For a generic Form 8949
   * "Amount of adjustment" column this holds the signed adjustment (added to gain). */
  washSaleDisallowed: number;
  /** Inherited property: always long-term regardless of dates. */
  inherited?: boolean;
  /** Broker-reported term, if any. Engine derives from dates when absent. */
  term?: "short" | "long";
  /** Section 1256 contract (broker 1099-B box for regulated futures / index options). */
  section1256?: boolean;
  /** Original row number in the imported file, for error messages. */
  row: number;
}

export interface BrokerImportResult {
  lots: BrokerLot[];
  /** Rows that could not be parsed, with reasons. */
  errors: Array<{ row: number; message: string }>;
  /** Detected column mapping, for display. */
  detectedColumns: Record<string, string>;
}

export interface CapitalGainsSummary {
  shortTermProceeds: number;
  shortTermBasis: number;
  shortTermWashAdjustments: number;
  netShortTerm: number;
  longTermProceeds: number;
  longTermBasis: number;
  longTermWashAdjustments: number;
  netLongTerm: number;
  section1256Net: number;
  lotCount: number;
  /** Lots sold within the year but acquired on/after the 30-day wash window of a loss — informational. */
  potentialWashSales: number;
}

/* ------------------------------------------------------------------ */
/* Scenarios / analysis helpers                                        */
/* ------------------------------------------------------------------ */

export interface SweepPoint {
  income: number;
  totalTax: number;
  marginalRate: number;
  effectiveRate: number;
}
