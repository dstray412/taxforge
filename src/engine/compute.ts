/**
 * TaxForge core computation: Form 1040 (with Schedules 1, 1-A, 2, 3, A, B, C-summary, D, SE,
 * 8812, 8959, 8960, 6251-simplified, 2441, 8863, 8880, 8995 and the 2210 safe-harbor test).
 *
 * Arithmetic is kept unrounded internally; tax lines are rounded to whole dollars at the end of
 * each schedule, the way the IRS forms instruct. Every material step emits a TraceLine.
 */
import type {
  AMTDetail,
  Bracket,
  ByStatus,
  CapitalGainsDetail,
  CreditsDetail,
  DeductionDetail,
  FilingStatus,
  InvestmentIncome,
  PersonFlags,
  SafeHarborDetail,
  SelfEmploymentDetail,
  TaxInput,
  TaxResult,
  TaxYear,
  TaxYearParams,
  TraceLine,
  TraceSeverity,
  W2Income,
} from "./types";
import { getParams, SUPPORTED_YEARS } from "./params";

/* ------------------------------------------------------------------ */
/* Named constants                                                     */
/* ------------------------------------------------------------------ */

/** Below this taxable income the IRS requires the Tax Table (midpoint of a $50 / $25 row). */
const TAX_TABLE_LIMIT = 100_000;
/** Probe size for numerical marginal rates. */
const MARGINAL_DELTA = 1_000;
/** Schedule SE: no SE tax when net earnings are below $400. */
const SE_MINIMUM_NET_EARNINGS = 400;
/** Form 8863: first-tier AOTC expenses are 100% creditable. */
const AOTC_FIRST_RATE = 1;
/** Educator expense cap per eligible educator. */
const EDUCATOR_CAP_PER_PERSON = 300;
/** Foreign tax credit de minimis election (no Form 1116). */
const FTC_DE_MINIMIS: ByStatus<number> = { single: 300, mfj: 600, mfs: 300, hoh: 300 };
/** IRA deduction partial-phaseout rounding (Pub 590-A): round up to $10, minimum $200. */
const IRA_ROUND_TO = 10;
const IRA_MIN_PARTIAL = 200;
/** EIC Table row width. */
const EIC_TABLE_ROW = 50;
/** The 37% rate: the OBBBA 2026 itemized-deduction value cap applies to income taxed at this rate. */
const TOP_RATE = 0.37;
/** Default count of estimated-tax installments (engine has no clock). */
const DEFAULT_INSTALLMENTS = 4;

const FILING_STATUSES: readonly FilingStatus[] = ["single", "mfj", "mfs", "hoh"];

/* ------------------------------------------------------------------ */
/* Small pure helpers                                                  */
/* ------------------------------------------------------------------ */

/** Clamp `x` into [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Round to cents (removes binary floating noise). */
export function cents(x: number): number {
  const r = Math.round(x * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/** Round to whole dollars the way the IRS does (50 cents and up rounds up). */
export function roundDollar(x: number): number {
  const r = Math.round(cents(x));
  return Object.is(r, -0) ? 0 : r;
}

/**
 * Generic linear phase-out: reduce `amount` by `rate` per dollar of `excess`, never below zero.
 * @param amount the full benefit
 * @param excess income above the phase-out threshold (negative values are treated as 0)
 * @param rate reduction per dollar of excess
 */
export function phaseOut(amount: number, excess: number, rate: number): number {
  return Math.max(0, amount - Math.max(0, excess) * rate);
}

/** Tax on `income` from a bracket schedule, exact (Tax Computation Worksheet math, unrounded). */
export function taxFromBrackets(income: number, brackets: Bracket[]): number {
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    if (income <= lower) break;
    tax += (Math.min(income, b.upTo) - lower) * b.rate;
    lower = b.upTo;
  }
  return tax;
}

/** Statutory rate of the bracket that the last dollar of `income` falls in (0 when income is 0). */
export function bracketRateFor(income: number, brackets: Bracket[]): number {
  if (income <= 0) return 0;
  let lower = 0;
  for (const b of brackets) {
    if (income > lower && income <= b.upTo) return b.rate;
    lower = b.upTo;
  }
  return brackets[brackets.length - 1]?.rate ?? 0;
}

/** Lower bound of the bracket taxed at `rate` (Infinity if the schedule has no such rate). */
export function bracketStart(rate: number, brackets: Bracket[]): number {
  let lower = 0;
  for (const b of brackets) {
    if (b.rate === rate) return lower;
    lower = b.upTo;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Tax the way Form 1040 line 16 instructs: below $100,000 use the Tax Table (tax computed on the
 * midpoint of the $50 row, or $25 row under $3,000, rounded to whole dollars); at or above
 * $100,000 use the Tax Computation Worksheet (exact schedule).
 */
export function taxFromTable(income: number, brackets: Bracket[]): number {
  if (income >= TAX_TABLE_LIMIT) return taxFromBrackets(income, brackets);
  if (income < 5) return 0;
  let mid: number;
  if (income < 15) mid = 10;
  else if (income < 25) mid = 20;
  else if (income < 3_000) mid = Math.floor(income / 25) * 25 + 12.5;
  else mid = Math.floor(income / 50) * 50 + 25;
  return roundDollar(taxFromBrackets(mid, brackets));
}

function usd(x: number): string {
  const r = cents(x);
  const abs = Math.abs(r);
  const whole = Math.floor(abs);
  const c = Math.round((abs - whole) * 100);
  const body = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${r < 0 ? "-" : ""}$${body}${c ? "." + String(c).padStart(2, "0") : ""}`;
}

function pct(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

/* ------------------------------------------------------------------ */
/* Input sanitizing                                                    */
/* ------------------------------------------------------------------ */

interface NumOpts {
  allowNegative?: boolean;
  integer?: boolean;
}

function makeNum(warnings: string[]) {
  return (v: unknown, path: string, opts: NumOpts = {}): number => {
    let x: number;
    if (typeof v === "number") x = v;
    else if (typeof v === "string" && v.trim() !== "") x = Number(v.replace(/[$,\s]/g, ""));
    else x = 0;
    if (!Number.isFinite(x)) {
      warnings.push(`${path} was not a valid number and was treated as 0.`);
      x = 0;
    }
    if (!opts.allowNegative && x < 0) {
      warnings.push(`${path} cannot be negative; ${usd(x)} was treated as 0.`);
      x = 0;
    }
    if (opts.integer) x = Math.floor(x);
    return x;
  };
}

function bool(v: unknown): boolean {
  return v === true || v === "true";
}

/**
 * Returns a fully-populated, finite, clamped copy of `raw` plus any warnings produced.
 * Missing sections and fields are treated as zero / false. Exported for tests.
 */
export function sanitizeInput(raw: TaxInput): { input: TaxInput; warnings: string[] } {
  const warnings: string[] = [];
  const num = makeNum(warnings);
  const src = (raw ?? {}) as Partial<TaxInput>;

  const yearNum = Number(src.taxYear);
  let taxYear: TaxYear;
  if ((SUPPORTED_YEARS as number[]).includes(yearNum)) taxYear = yearNum as TaxYear;
  else {
    taxYear = SUPPORTED_YEARS[SUPPORTED_YEARS.length - 1] as TaxYear;
    warnings.push(`Tax year ${String(src.taxYear)} is not supported; computed as ${taxYear}.`);
  }

  let filingStatus: FilingStatus = "single";
  if (FILING_STATUSES.includes(src.filingStatus as FilingStatus)) filingStatus = src.filingStatus as FilingStatus;
  else warnings.push(`Unknown filing status "${String(src.filingStatus)}"; computed as single.`);

  const person = (p: Partial<PersonFlags> | undefined): PersonFlags => {
    const age65OrOlder = bool(p?.age65OrOlder);
    const age55OrOlder = age65OrOlder || bool(p?.age55OrOlder);
    return { age65OrOlder, blind: bool(p?.blind), age50OrOlder: age55OrOlder || bool(p?.age50OrOlder), age55OrOlder };
  };

  const w2 = (w: Partial<W2Income> | undefined, label: string): W2Income => {
    const wages = num(w?.wages, `${label} wages`);
    const tipsRaw = num(w?.qualifiedTips, `${label} qualified tips`);
    const otRaw = num(w?.qualifiedOvertime, `${label} qualified overtime`);
    if (tipsRaw > wages) warnings.push(`${label} qualified tips exceed Box 1 wages; limited to wages.`);
    if (otRaw > wages) warnings.push(`${label} qualified overtime exceeds Box 1 wages; limited to wages.`);
    return {
      wages,
      federalWithholding: num(w?.federalWithholding, `${label} federal withholding`),
      medicareWages: num(w?.medicareWages, `${label} Medicare wages`),
      socialSecurityWages: num(w?.socialSecurityWages, `${label} Social Security wages`),
      qualifiedTips: Math.min(tipsRaw, wages),
      qualifiedOvertime: Math.min(otRaw, wages),
    };
  };

  const inv: Partial<TaxInput["investments"]> = src.investments ?? {};
  const oth: Partial<TaxInput["other"]> = src.other ?? {};
  const adj: Partial<TaxInput["adjustments"]> = src.adjustments ?? {};
  const ded: Partial<TaxInput["deductions"]> = src.deductions ?? {};
  const it: Partial<TaxInput["deductions"]["itemized"]> = ded.itemized ?? {};
  const cr: Partial<TaxInput["credits"]> = src.credits ?? {};
  const pay: Partial<TaxInput["payments"]> = src.payments ?? {};
  const amt: Partial<TaxInput["amt"]> = src.amt ?? {};
  const dep: Partial<TaxInput["dependents"]> = src.dependents ?? {};
  const neg = { allowNegative: true };
  const int = { integer: true };

  const ordinaryDividends = num(inv.ordinaryDividends, "Ordinary dividends");
  let qualifiedDividends = num(inv.qualifiedDividends, "Qualified dividends");
  if (qualifiedDividends > ordinaryDividends) {
    warnings.push("Qualified dividends exceed ordinary dividends; limited to ordinary dividends.");
    qualifiedDividends = ordinaryDividends;
  }

  const method = ded.method === "standard" || ded.method === "itemized" ? ded.method : "auto";
  const installments = src.options?.installmentsRemaining;

  const input: TaxInput = {
    taxYear,
    filingStatus,
    taxpayer: person(src.taxpayer),
    spouse: filingStatus === "mfj" || filingStatus === "mfs" ? person(src.spouse) : undefined,
    dependents: {
      qualifyingChildrenUnder17: num(dep.qualifyingChildrenUnder17, "Qualifying children", int),
      otherDependents: num(dep.otherDependents, "Other dependents", int),
      eitcQualifyingChildren: num(dep.eitcQualifyingChildren, "EITC qualifying children", int),
    },
    w2: w2(src.w2, "Your W-2"),
    spouseW2: src.spouseW2 ? w2(src.spouseW2, "Spouse W-2") : undefined,
    investments: {
      taxableInterest: num(inv.taxableInterest, "Taxable interest"),
      taxExemptInterest: num(inv.taxExemptInterest, "Tax-exempt interest"),
      ordinaryDividends,
      qualifiedDividends,
      netShortTermGain: num(inv.netShortTermGain, "Net short-term gain", neg),
      netLongTermGain: num(inv.netLongTermGain, "Net long-term gain", neg),
      section1256Gain: num(inv.section1256Gain, "Section 1256 gain", neg),
      shortTermLossCarryover: Math.abs(num(inv.shortTermLossCarryover, "Short-term loss carryover", neg)),
      longTermLossCarryover: Math.abs(num(inv.longTermLossCarryover, "Long-term loss carryover", neg)),
    },
    other: {
      selfEmploymentNetProfit: num(oth.selfEmploymentNetProfit, "Schedule C net profit", neg),
      selfEmploymentIsSSTB: bool(oth.selfEmploymentIsSSTB),
      qbiW2Wages: num(oth.qbiW2Wages, "QBI W-2 wages"),
      qbiUBIA: num(oth.qbiUBIA, "QBI UBIA"),
      iraDistributions: num(oth.iraDistributions, "IRA distributions"),
      pensions: num(oth.pensions, "Pensions"),
      socialSecurityBenefits: num(oth.socialSecurityBenefits, "Social Security benefits"),
      unemploymentCompensation: num(oth.unemploymentCompensation, "Unemployment compensation"),
      scheduleEIncome: num(oth.scheduleEIncome, "Schedule E income", neg),
      otherIncome: num(oth.otherIncome, "Other income", neg),
      taxableStateRefund: num(oth.taxableStateRefund, "Taxable state refund"),
    },
    adjustments: {
      hsaContribution: num(adj.hsaContribution, "HSA contribution"),
      hsaCoverage: adj.hsaCoverage === "self" ? "self" : "family",
      traditionalIraContribution: num(adj.traditionalIraContribution, "Traditional IRA contribution"),
      spouseTraditionalIraContribution: num(adj.spouseTraditionalIraContribution, "Spouse traditional IRA contribution"),
      coveredByWorkplacePlan: bool(adj.coveredByWorkplacePlan),
      spouseCoveredByWorkplacePlan: bool(adj.spouseCoveredByWorkplacePlan),
      studentLoanInterest: num(adj.studentLoanInterest, "Student loan interest"),
      selfEmployedRetirement: num(adj.selfEmployedRetirement, "Self-employed retirement"),
      selfEmployedHealthInsurance: num(adj.selfEmployedHealthInsurance, "Self-employed health insurance"),
      educatorExpenses: num(adj.educatorExpenses, "Educator expenses"),
      carLoanInterest: num(adj.carLoanInterest, "Car loan interest"),
      otherAdjustments: num(adj.otherAdjustments, "Other adjustments"),
    },
    deductions: {
      method,
      itemized: {
        medicalExpenses: num(it.medicalExpenses, "Medical expenses"),
        stateLocalIncomeOrSalesTax: num(it.stateLocalIncomeOrSalesTax, "State/local income or sales tax"),
        realEstateTaxes: num(it.realEstateTaxes, "Real estate taxes"),
        personalPropertyTaxes: num(it.personalPropertyTaxes, "Personal property taxes"),
        mortgageInterest: num(it.mortgageInterest, "Mortgage interest"),
        mortgagePrincipal: num(it.mortgagePrincipal, "Mortgage principal"),
        charitableCash: num(it.charitableCash, "Cash charitable gifts"),
        charitableNonCash: num(it.charitableNonCash, "Non-cash charitable gifts"),
        casualtyLosses: num(it.casualtyLosses, "Casualty losses"),
        otherItemized: num(it.otherItemized, "Other itemized deductions"),
      },
    },
    credits: {
      childCareExpenses: num(cr.childCareExpenses, "Child care expenses"),
      childCareQualifyingPersons: num(cr.childCareQualifyingPersons, "Child care qualifying persons", int),
      americanOpportunityExpenses: num(cr.americanOpportunityExpenses, "AOTC expenses"),
      americanOpportunityStudents: num(cr.americanOpportunityStudents, "AOTC students", int),
      foreignTaxPaid: num(cr.foreignTaxPaid, "Foreign tax paid"),
      retirementSaversContributions: num(cr.retirementSaversContributions, "Saver's credit contributions"),
      otherNonrefundableCredits: num(cr.otherNonrefundableCredits, "Other nonrefundable credits"),
      otherRefundableCredits: num(cr.otherRefundableCredits, "Other refundable credits"),
    },
    payments: {
      estimatedTaxPaid: num(pay.estimatedTaxPaid, "Estimated tax paid"),
      priorYearTotalTax: num(pay.priorYearTotalTax, "Prior-year total tax"),
      priorYearAGI: num(pay.priorYearAGI, "Prior-year AGI", neg),
      priorYearTaxWasZero: bool(pay.priorYearTaxWasZero),
      excessSocialSecurityWithheld: num(pay.excessSocialSecurityWithheld, "Excess Social Security withheld"),
    },
    amt: {
      isoBargainElement: num(amt.isoBargainElement, "ISO bargain element"),
      privateActivityBondInterest: num(amt.privateActivityBondInterest, "Private activity bond interest"),
      otherAmtAdjustments: num(amt.otherAmtAdjustments, "Other AMT adjustments", neg),
    },
    claimedAsDependent: bool(src.claimedAsDependent),
    spouseHadNoGrossIncome: bool(src.spouseHadNoGrossIncome),
    options: {
      includeSection1256In60_40: src.options?.includeSection1256In60_40 !== false,
      installmentsRemaining:
        installments === undefined ? DEFAULT_INSTALLMENTS : clamp(Math.round(num(installments, "Installments remaining")) || 1, 1, 4),
    },
  };
  if ((input.adjustments.spouseTraditionalIraContribution ?? 0) > 0 && filingStatus !== "mfj") {
    warnings.push("A spouse IRA contribution was entered but the filing status is not married filing jointly; it was ignored.");
  }
  if (input.spouseW2 && filingStatus !== "mfj") {
    warnings.push("A spouse W-2 was entered but the filing status is not married filing jointly; it was ignored.");
  }
  return { input, warnings };
}

/* ------------------------------------------------------------------ */
/* Schedule-level computations (exported for unit tests)               */
/* ------------------------------------------------------------------ */

export interface ScheduleDResult {
  /** Net short-term after 1256 split and carryover. */
  st: number;
  lt: number;
  total: number;
  /** Amount on Form 1040 line 7 (gain, or the allowed loss as a negative). */
  line7: number;
  lossDeducted: number;
  carryST: number;
  carryLT: number;
  /** Net capital gain eligible for preferential rates (LT gain net of ST loss), >= 0. */
  netCapitalGain: number;
  st1256: number;
  lt1256: number;
}

/**
 * Schedule D netting: section 1256 60/40 split, carryovers, the $3,000 ($1,500 MFS) loss limit and
 * the Capital Loss Carryover Worksheet split of the unused loss into short- and long-term parts.
 * When `split1256` is false the 1256 amount is treated entirely as short-term.
 */
export function scheduleD(inv: InvestmentIncome, lossLimit: number, split1256: boolean): ScheduleDResult {
  const g = inv.section1256Gain;
  const lt1256 = split1256 ? g * 0.6 : 0;
  const st1256 = g - lt1256;
  const st = inv.netShortTermGain + st1256 - inv.shortTermLossCarryover;
  const lt = inv.netLongTermGain + lt1256 - inv.longTermLossCarryover;
  const total = st + lt;
  if (total >= 0) {
    return { st, lt, total, line7: total, lossDeducted: 0, carryST: 0, carryLT: 0, netCapitalGain: Math.max(0, Math.min(lt, total)), st1256, lt1256 };
  }
  const loss = -total;
  const lossDeducted = Math.min(lossLimit, loss);
  const unused = loss - lossDeducted;
  let carryST = 0;
  let carryLT = 0;
  if (st < 0 && lt < 0) {
    // The deduction absorbs short-term loss first.
    const stUsed = Math.min(-st, lossDeducted);
    carryST = -st - stUsed;
    carryLT = -lt - (lossDeducted - stUsed);
  } else if (st < 0) carryST = unused;
  else carryLT = unused;
  return { st, lt, total, line7: -lossDeducted, lossDeducted, carryST, carryLT, netCapitalGain: 0, st1256, lt1256 };
}

/**
 * Capital Loss Carryover Worksheet (Schedule D instructions). `used` is worksheet line 4: the smaller
 * of the loss deducted and (taxable income before the floor at zero + loss deducted), never below 0.
 * The unused loss carries forward, short-term absorbed first.
 */
export function capitalLossCarryover(st: number, lt: number, lossDeducted: number, unclampedTaxableIncome: number): { used: number; carryST: number; carryLT: number } {
  const used = Math.min(lossDeducted, Math.max(0, unclampedTaxableIncome + lossDeducted));
  const stLoss = Math.max(0, -st);
  const ltLoss = Math.max(0, -lt);
  const carryST = Math.max(0, stLoss - (used + Math.max(0, lt)));
  const carryLT = Math.max(0, ltLoss - (Math.max(0, st) + Math.max(0, used - stLoss)));
  return { used, carryST, carryLT };
}

/** W-2 Social Security wages (Box 3) with fallback to Medicare wages (Box 5), then Box 1. */
export function socialSecurityWagesOf(w: W2Income | undefined): number {
  if (!w) return 0;
  if ((w.socialSecurityWages ?? 0) > 0) return w.socialSecurityWages ?? 0;
  if ((w.medicareWages ?? 0) > 0) return w.medicareWages ?? 0;
  return w.wages;
}

/**
 * Schedule SE. Net earnings = 92.35% of net profit; the 12.4% Social Security part applies only up
 * to the wage base remaining after W-2 Social Security wages; 2.9% Medicare applies to all.
 * Total SE tax is rounded to whole dollars; the deduction is half of it.
 */
export function scheduleSE(
  netProfit: number,
  w2SocialSecurityWages: number,
  ss: TaxYearParams["socialSecurity"],
): SelfEmploymentDetail {
  const netEarnings = Math.max(0, netProfit) * ss.seFactor;
  if (netEarnings < SE_MINIMUM_NET_EARNINGS) {
    return { netProfit, netEarnings, socialSecurityTax: 0, medicareTax: 0, totalSETax: 0, halfSETaxDeduction: 0 };
  }
  const ssBase = Math.min(netEarnings, Math.max(0, ss.wageBase - w2SocialSecurityWages));
  const socialSecurityTax = ssBase * ss.rate;
  const medicareTax = netEarnings * ss.medicareRate;
  const totalSETax = roundDollar(socialSecurityTax + medicareTax);
  return {
    netProfit,
    netEarnings: cents(netEarnings),
    socialSecurityTax: cents(socialSecurityTax),
    medicareTax: cents(medicareTax),
    totalSETax,
    halfSETaxDeduction: cents(totalSETax / 2),
  };
}

/**
 * Social Security Benefits Worksheet (Form 1040 instructions).
 * @param benefits gross benefits (SSA-1099 box 5)
 * @param otherIncomeForProvisional income excluding benefits, plus tax-exempt interest, minus adjustments
 * @returns taxable benefits and provisional income
 */
export function taxableSocialSecurity(
  benefits: number,
  otherIncomeForProvisional: number,
  base: number,
  adjusted: number,
): { taxable: number; provisional: number } {
  const provisional = otherIncomeForProvisional + benefits * 0.5;
  if (benefits <= 0) return { taxable: 0, provisional };
  const line9 = provisional - base;
  if (line9 <= 0) return { taxable: 0, provisional };
  const line10 = adjusted - base;
  const line11 = Math.max(0, line9 - line10);
  const line12 = Math.min(line9, line10);
  const line14 = Math.min(line12 / 2, benefits / 2);
  const line16 = line14 + line11 * 0.85;
  return { taxable: Math.min(line16, benefits * 0.85), provisional };
}

export interface QDCGResult {
  ordinaryPortion: number;
  preferentialIncome: number;
  taxedAt0: number;
  taxedAt15: number;
  taxedAt20: number;
  ordinaryTax: number;
  preferentialTax: number;
  allOrdinaryTax: number;
  /** Final regular tax, whole dollars. */
  tax: number;
}

/**
 * Qualified Dividends and Capital Gain Tax Worksheet: preferential income is stacked on top of
 * ordinary income and taxed 0/15/20% by breakpoint; result is the smaller of that and the tax on
 * everything as ordinary income.
 */
export function qdcgTax(
  taxableIncome: number,
  qualifiedDividends: number,
  netCapitalGain: number,
  brackets: Bracket[],
  bp: { zeroUpTo: number; fifteenUpTo: number },
): QDCGResult {
  const ti = Math.max(0, taxableIncome);
  const pref = Math.min(ti, Math.max(0, qualifiedDividends + netCapitalGain));
  const ord = ti - pref;
  const taxedAt0 = Math.max(0, Math.min(ti, bp.zeroUpTo) - ord);
  const upper15 = Math.min(ti, bp.fifteenUpTo);
  const taxedAt15 = Math.max(0, Math.min(pref - taxedAt0, upper15 - ord - taxedAt0));
  const taxedAt20 = Math.max(0, pref - taxedAt0 - taxedAt15);
  const ordinaryTax = taxFromTable(ord, brackets);
  const preferentialTax = taxedAt15 * 0.15 + taxedAt20 * 0.2;
  const allOrdinaryTax = taxFromTable(ti, brackets);
  const tax = pref > 0 ? roundDollar(Math.min(ordinaryTax + preferentialTax, allOrdinaryTax)) : roundDollar(allOrdinaryTax);
  return { ordinaryPortion: ord, preferentialIncome: pref, taxedAt0, taxedAt15, taxedAt20, ordinaryTax, preferentialTax, allOrdinaryTax, tax };
}

/**
 * Tentative minimum tax (Form 6251 Part II/III simplified): 26% / 28% on the AMT base, with
 * qualified dividends and net capital gain keeping their 0/15/20% rates. Per Part III lines 19-30,
 * the 0% and 15% bands are measured against REGULAR-tax ordinary taxable income
 * (`regularOrdinaryIncome`, QDCG worksheet line 5), not AMT ordinary income.
 */
export function tentativeMinimumTax(
  amtBase: number,
  preferentialIncome: number,
  rate28Threshold: number,
  bp: { zeroUpTo: number; fifteenUpTo: number },
  regularOrdinaryIncome: number,
): number {
  const base = Math.max(0, amtBase);
  const flat = (x: number): number => (x <= rate28Threshold ? x * 0.26 : x * 0.28 - rate28Threshold * 0.02);
  const pref = Math.min(base, Math.max(0, preferentialIncome));
  if (pref <= 0) return flat(base);
  const ord = base - pref;
  const regOrd = Math.max(0, regularOrdinaryIncome);
  const at0 = Math.min(pref, Math.max(0, bp.zeroUpTo - regOrd));
  const at15 = Math.min(pref - at0, Math.max(0, bp.fifteenUpTo - regOrd - at0));
  const at20 = Math.max(0, pref - at0 - at15);
  return Math.min(flat(ord) + at15 * 0.15 + at20 * 0.2, flat(base));
}

/**
 * Per-person traditional IRA deduction limit after the sec. 219(g) phaseout: reduced limit is
 * rounded up to the next $10 and, if above zero, is at least $200 (Pub 590-A).
 */
export function iraDeductibleLimit(limit: number, magi: number, start: number, range: number): number {
  if (!Number.isFinite(start) || magi <= start) return limit;
  const frac = clamp((start + range - magi) / range, 0, 1);
  if (frac <= 0) return 0;
  const reduced = Math.ceil((limit * frac) / IRA_ROUND_TO) * IRA_ROUND_TO;
  return Math.min(limit, Math.max(IRA_MIN_PARTIAL, reduced));
}

/**
 * Sec. 199A component for one business (Form 8995-A Parts II/III): 20% of QBI limited by the greater
 * of 50% of W-2 wages or 25% of W-2 wages + 2.5% of UBIA, phased in across the threshold range; an SSTB
 * first scales QBI, wages and UBIA by its applicable percentage.
 */
export function qbiComponent(
  qbi: number,
  w2Wages: number,
  ubia: number,
  taxableIncomeBeforeQbi: number,
  threshold: number,
  range: number,
  isSSTB: boolean,
  rate: number,
): { component: number; applicable: number; wageLimit: number; phaseFraction: number } {
  const over = taxableIncomeBeforeQbi - threshold;
  if (over <= 0) return { component: rate * qbi, applicable: 1, wageLimit: Number.POSITIVE_INFINITY, phaseFraction: 0 };
  const phaseFraction = clamp(over / range, 0, 1);
  const applicable = isSSTB ? 1 - phaseFraction : 1;
  const tentative = rate * qbi * applicable;
  const wageLimit = Math.max(0.5 * w2Wages * applicable, 0.25 * w2Wages * applicable + 0.025 * ubia * applicable);
  if (tentative <= wageLimit) return { component: tentative, applicable, wageLimit, phaseFraction };
  const component = phaseFraction >= 1 ? wageLimit : tentative - (tentative - wageLimit) * phaseFraction;
  return { component, applicable, wageLimit, phaseFraction };
}

/**
 * Earned Income Credit, using the EIC Table convention (credit computed at the midpoint of the
 * $50 income row, rounded to dollars). Phase-out uses the greater of earned income and AGI.
 */
export function eitcAmount(earned: number, agi: number, children: number, joint: boolean, e: TaxYearParams["eitc"]): number {
  if (earned <= 0) return 0;
  const i = clamp(Math.floor(children), 0, 3);
  const max = e.maxCredit[i] ?? 0;
  const ei = e.earnedIncomeAmount[i] ?? 1;
  const start = (joint ? e.phaseoutStartMFJ[i] : e.phaseoutStart[i]) ?? 0;
  const end = (joint ? e.phaseoutEndMFJ[i] : e.phaseoutEnd[i]) ?? 0;
  if (end <= start) return 0;
  const inRate = max / ei;
  const outRate = max / (end - start);
  const creditAt = (x: number): number => {
    if (x >= end) return 0;
    const mid = Math.floor(x / EIC_TABLE_ROW) * EIC_TABLE_ROW + EIC_TABLE_ROW / 2;
    return Math.max(0, Math.min(max, mid * inRate) - Math.max(0, mid - start) * outRate);
  };
  let credit = creditAt(earned);
  if (agi > start && agi !== earned) credit = Math.min(credit, creditAt(Math.max(0, agi)));
  return roundDollar(credit);
}

/**
 * Child and dependent care credit rate (Form 2441). 2025: 35% minus 1 point per $2,000 (or part)
 * of AGI over $15,000, floor 20%. 2026 (OBBBA): 50% stepping down to 35%, then a second step-down
 * to 20% above $75,000 ($150,000 MFJ).
 */
export function childCareRate(agi: number, fs: FilingStatus, c: TaxYearParams["childCareCredit"]): number {
  const step = c.phaseStep ?? 2_000;
  const steps1 = Math.ceil(Math.max(0, agi - c.phaseStart) / step);
  if (c.midRate === undefined || !c.secondPhaseStart) {
    return Math.max(c.bottomRate, cents(c.topRate - 0.01 * steps1));
  }
  let rate = Math.max(c.midRate, cents(c.topRate - 0.01 * steps1));
  const step2 = c.secondPhaseStep?.[fs] ?? step;
  const steps2 = Math.ceil(Math.max(0, agi - c.secondPhaseStart[fs]) / step2);
  if (steps2 > 0) rate = Math.max(c.bottomRate, Math.min(rate, cents(c.midRate - 0.01 * steps2)));
  return rate;
}

/**
 * Car loan interest deduction phaseout: reduced by $200 for each $1,000 (or fraction) of MAGI above
 * the threshold.
 */
function carLoanPhase(amount: number, magi: number, start: number, per1000: number): number {
  const steps = Math.ceil(Math.max(0, magi - start) / 1_000);
  return Math.max(0, amount - steps * per1000);
}

/* ------------------------------------------------------------------ */
/* Core computation                                                    */
/* ------------------------------------------------------------------ */

type Section = "income" | "adjustments" | "deductions" | "tax" | "credits" | "payments" | "other_taxes";

function computeCore(inp: TaxInput, baseWarnings: string[]): TaxResult {
  const p = getParams(inp.taxYear);
  const fs = inp.filingStatus;
  const joint = fs === "mfj";
  const married = fs === "mfj" || fs === "mfs";
  const brackets = p.brackets[fs];
  const trace: TraceLine[] = [];
  const warnings: string[] = [...baseWarnings];
  const add = (
    id: string,
    section: Section,
    label: string,
    amount: number,
    ref: string | undefined,
    note: string,
    severity: TraceSeverity = "info",
  ): void => {
    trace.push({ id, section, label, amount: cents(amount), ref, note, severity });
  };
  const warn = (msg: string): void => {
    if (!warnings.includes(msg)) warnings.push(msg);
  };

  const inv = inp.investments;
  const oth = inp.other;
  const adj = inp.adjustments;
  const spouseW2 = joint ? inp.spouseW2 : undefined;
  const spouseFlags: PersonFlags = joint || fs === "mfs" ? inp.spouse ?? { age65OrOlder: false, blind: false } : { age65OrOlder: false, blind: false };

  /* ---------------- Income ---------------- */
  const wagesTp = inp.w2.wages;
  const wagesSp = spouseW2?.wages ?? 0;
  const wages = wagesTp + wagesSp;
  add("wages", "income", "Wages, salaries, tips", wages, "Form 1040, line 1a",
    joint ? `Your W-2 box 1 (${usd(wagesTp)}) plus your spouse's (${usd(wagesSp)}).` : "W-2 box 1 wages.");
  add("interest", "income", "Taxable interest", inv.taxableInterest, "Form 1040, line 2b",
    `Taxable interest. Tax-exempt interest of ${usd(inv.taxExemptInterest)} is not taxed but counts toward Social Security taxability.`);
  add("dividends", "income", "Ordinary dividends", inv.ordinaryDividends, "Form 1040, line 3b",
    `All ordinary dividends are income; the ${usd(inv.qualifiedDividends)} qualified portion is later taxed at capital-gain rates.`);

  const split1256 = inp.options?.includeSection1256In60_40 !== false;
  const sd = scheduleD(inv, p.capitalLossLimit[fs], split1256);
  if (inv.section1256Gain !== 0) {
    add("sec1256", "income", "Section 1256 contracts", inv.section1256Gain, "Form 6781",
      split1256
        ? `Marked-to-market 1256 result split 60% long-term (${usd(sd.lt1256)}) and 40% short-term (${usd(sd.st1256)}) regardless of holding period.`
        : "60/40 split disabled: the whole 1256 amount is treated as short-term.");
  }
  add("cg_short", "income", "Net short-term gain/loss", sd.st, "Schedule D, line 7",
    `Short-term ${usd(inv.netShortTermGain)}${sd.st1256 ? ` + 1256 share ${usd(sd.st1256)}` : ""}${inv.shortTermLossCarryover ? ` − carryover ${usd(inv.shortTermLossCarryover)}` : ""}.`);
  add("cg_long", "income", "Net long-term gain/loss", sd.lt, "Schedule D, line 15",
    `Long-term ${usd(inv.netLongTermGain)}${sd.lt1256 ? ` + 1256 share ${usd(sd.lt1256)}` : ""}${inv.longTermLossCarryover ? ` − carryover ${usd(inv.longTermLossCarryover)}` : ""}.`);
  if (sd.total >= 0) {
    add("cg_net", "income", "Capital gain", sd.line7, "Form 1040, line 7",
      `Short- and long-term results net to a ${usd(sd.total)} gain. Of that, ${usd(sd.netCapitalGain)} is "net capital gain" (long-term gain not offset by short-term losses) eligible for 0/15/20% rates.`);
  } else {
    add("cg_net", "income", "Capital loss deducted", sd.line7, "Form 1040, line 7",
      `Net loss of ${usd(-sd.total)}; only ${usd(sd.lossDeducted)} may offset other income this year (${usd(p.capitalLossLimit[fs])} limit). The carryforward is computed after taxable income (see "Capital loss carryover").`);
  }
  if (inv.netShortTermGain !== 0 || inv.netLongTermGain !== 0) {
    warn("Capital gains are assumed to already reflect wash-sale adjustments (Form 8949 code W) reported by your broker.");
  }

  // Schedule SE first (needed for adjustments and provisional income).
  // Schedule SE line 8a uses W-2 box 3 Social Security wages (fallback: box 5, then box 1).
  const ssWagesTp = socialSecurityWagesOf(inp.w2);
  const se = scheduleSE(oth.selfEmploymentNetProfit, ssWagesTp, p.socialSecurity);
  if (oth.selfEmploymentNetProfit !== 0) {
    add("sch_c", "income", "Business income (Schedule C)", oth.selfEmploymentNetProfit, "Schedule 1, line 3", "Net profit or loss from self-employment.");
  }
  const otherSched1 =
    oth.unemploymentCompensation + oth.scheduleEIncome + oth.otherIncome + oth.taxableStateRefund;
  if (otherSched1 !== 0) {
    add("sched1_other", "income", "Other Schedule 1 income", otherSched1, "Schedule 1, lines 1, 5, 7, 8z",
      `Unemployment ${usd(oth.unemploymentCompensation)} + Schedule E ${usd(oth.scheduleEIncome)} + other ${usd(oth.otherIncome)} + taxable state refund ${usd(oth.taxableStateRefund)}.`);
  }
  if (oth.iraDistributions + oth.pensions > 0) {
    add("ira_pensions", "income", "IRA distributions and pensions", oth.iraDistributions + oth.pensions, "Form 1040, lines 4b, 5b",
      `Taxable IRA distributions ${usd(oth.iraDistributions)} + pensions/annuities ${usd(oth.pensions)}.`);
  }

  /* ---------------- Adjustments not depending on MAGI ---------------- */
  const educatorCap = EDUCATOR_CAP_PER_PERSON * (joint ? 2 : 1);
  const educator = Math.min(adj.educatorExpenses, educatorCap);
  const hsaBaseCap = adj.hsaCoverage === "self" ? p.hsa.selfOnly : p.hsa.family;
  const hsaCatchUps = (inp.taxpayer.age55OrOlder ? 1 : 0) + (joint && spouseFlags.age55OrOlder ? 1 : 0);
  const hsaCap = hsaBaseCap + p.hsa.catchUp55 * hsaCatchUps;
  const hsa = Math.min(adj.hsaContribution, hsaCap);
  if (adj.hsaContribution > hsaCap) {
    warn(`HSA contribution limited to ${usd(hsaCap)} (${adj.hsaCoverage === "self" ? "self-only" : "family"} limit${hsaCatchUps ? ` plus ${hsaCatchUps} age-55 catch-up` : ""}).`);
  }
  const halfSE = se.halfSETaxDeduction;
  const seRetCap = Math.max(0, oth.selfEmploymentNetProfit - halfSE);
  const seRetirement = Math.min(adj.selfEmployedRetirement, seRetCap);
  if (adj.selfEmployedRetirement > seRetCap) warn(`Self-employed retirement contributions limited to ${usd(seRetCap)} (net profit less half of SE tax).`);
  else if (seRetirement > 0.25 * se.netEarnings) {
    warn("Self-employed retirement contributions exceed 25% of net SE earnings; SEP-IRA employer contributions are limited to about 20% of net earnings (solo 401(k) deferrals can be higher). Check your plan limit.");
  }
  const seHealthCap = Math.max(0, oth.selfEmploymentNetProfit - halfSE - seRetirement);
  const seHealth = Math.min(adj.selfEmployedHealthInsurance, seHealthCap);
  if (adj.selfEmployedHealthInsurance > seHealthCap) warn(`Self-employed health insurance deduction limited to ${usd(seHealthCap)} (business net earnings).`);
  const otherAdj = adj.otherAdjustments;
  const baseAdjustments = educator + hsa + halfSE + seRetirement + seHealth + otherAdj;

  /* ---------------- Social Security & IRA (Pub 590-A Appendix B) ---------------- */
  const capGainLine = sd.line7;
  const incomeExSS =
    wages + inv.taxableInterest + inv.ordinaryDividends + capGainLine + oth.iraDistributions + oth.pensions +
    oth.selfEmploymentNetProfit + otherSched1;
  const ssBase = p.socialSecurityBenefits.base[fs];
  const ssAdj = p.socialSecurityBenefits.adjusted[fs];
  // Worksheet 1: taxable benefits figured WITHOUT the IRA deduction give the MAGI for IRA phaseouts.
  const ssForIra = taxableSocialSecurity(oth.socialSecurityBenefits, incomeExSS + inv.taxExemptInterest - baseAdjustments, ssBase, ssAdj);
  const iraMagi = incomeExSS + ssForIra.taxable - baseAdjustments;

  const earnedTp = wagesTp + Math.max(0, se.netEarnings > 0 ? oth.selfEmploymentNetProfit - halfSE : 0);
  const earnedSp = wagesSp;
  const earnedIncome = Math.max(0, wages + (oth.selfEmploymentNetProfit - halfSE));
  const iraP = p.iraDeduction;
  const compensation = joint ? earnedTp + earnedSp : earnedTp;
  // Each spouse is phased out on their own regime (sec. 219(g)): covered → covered range;
  // not covered but spouse covered → spouse-covered range (MFS: the 0-10k covered range); otherwise none.
  const regime = (selfCovered: boolean, otherCovered: boolean): { start: number; range: number; label: string } => {
    if (selfCovered) return { start: iraP.coveredPhaseoutStart[fs], range: iraP.coveredPhaseoutRange[fs], label: "covered by a workplace plan" };
    if (otherCovered && joint) return { start: iraP.spouseCoveredPhaseoutStart, range: iraP.spouseCoveredPhaseoutRange, label: "not covered, spouse covered" };
    if (otherCovered && fs === "mfs") return { start: iraP.coveredPhaseoutStart.mfs, range: iraP.coveredPhaseoutRange.mfs, label: "MFS, spouse covered" };
    return { start: Number.POSITIVE_INFINITY, range: 1, label: "no workplace plan" };
  };
  const iraPerson = (contribution: number, flags: PersonFlags, selfCovered: boolean, otherCovered: boolean, compLeft: number) => {
    const annual = Math.min(iraP.limit + (flags.age50OrOlder ? iraP.catchUp50 : 0), Math.max(0, compLeft));
    const r = regime(selfCovered, otherCovered);
    const allowed = iraDeductibleLimit(annual, iraMagi, r.start, r.range);
    return { deduction: Math.min(contribution, allowed), annual, allowed, regime: r };
  };
  const iraTp = iraPerson(adj.traditionalIraContribution, inp.taxpayer, adj.coveredByWorkplacePlan, adj.spouseCoveredByWorkplacePlan, compensation);
  const iraSp = joint
    ? iraPerson(adj.spouseTraditionalIraContribution ?? 0, spouseFlags, adj.spouseCoveredByWorkplacePlan, adj.coveredByWorkplacePlan, compensation - Math.min(adj.traditionalIraContribution, iraTp.annual))
    : null;
  const iraDeduction = iraTp.deduction + (iraSp?.deduction ?? 0);
  const iraNote = (who: string, contribution: number, x: ReturnType<typeof iraPerson>): string =>
    `${who}: contributed ${usd(contribution)}, annual limit ${usd(x.annual)} (catch-up if 50+, capped at compensation), ${x.regime.label}` +
    (Number.isFinite(x.regime.start)
      ? ` → phaseout ${usd(x.regime.start)}-${usd(x.regime.start + x.regime.range)} of MAGI ${usd(iraMagi)}, deductible limit ${usd(x.allowed)}; deducted ${usd(x.deduction)}.`
      : `; fully deductible ${usd(x.deduction)}.`);
  if (adj.traditionalIraContribution > 0 || (iraSp && (adj.spouseTraditionalIraContribution ?? 0) > 0)) {
    add("ira_deduction", "adjustments", "Traditional IRA deduction", iraDeduction, "Schedule 1, line 20",
      iraNote("You", adj.traditionalIraContribution, iraTp) + (iraSp ? " " + iraNote("Spouse", adj.spouseTraditionalIraContribution ?? 0, iraSp) : "") +
        (oth.socialSecurityBenefits > 0 ? " MAGI includes Social Security figured without the IRA deduction (Pub 590-A Worksheet 1)." : ""));
  }

  // Worksheet 2 / 1040 SS worksheet line 6: subtract adjustments INCLUDING the IRA deduction.
  const ssw = taxableSocialSecurity(oth.socialSecurityBenefits, incomeExSS + inv.taxExemptInterest - baseAdjustments - iraDeduction, ssBase, ssAdj);
  const taxableSS = ssw.taxable;
  if (oth.socialSecurityBenefits > 0) {
    add("ss_taxable", "income", "Taxable Social Security", taxableSS, "Form 1040, line 6b",
      `Provisional income = other income + tax-exempt interest − adjustments (incl. IRA deduction) + half of benefits = ${usd(ssw.provisional)}. ` +
        `Up to 50% of benefits are taxable above ${usd(ssBase)} and up to 85% above ${usd(ssAdj)}; result: ${usd(taxableSS)} of ${usd(oth.socialSecurityBenefits)} (${pct(taxableSS / oth.socialSecurityBenefits)}).`);
    if (fs === "mfs") warn("MFS Social Security: assumes you lived with your spouse during the year (0 base amount, up to 85% taxable).");
  }
  const totalIncome = incomeExSS + taxableSS;
  add("total_income", "income", "Total income", totalIncome, "Form 1040, line 9", "Sum of all income lines above.");
  const people = joint ? 2 : 1;

  const slMagi = totalIncome - baseAdjustments - iraDeduction;
  let studentLoan = 0;
  if (adj.studentLoanInterest > 0) {
    if (fs === "mfs" || inp.claimedAsDependent) {
      add("student_loan", "adjustments", "Student loan interest", 0, "Schedule 1, line 21",
        "Not allowed for married filing separately or for someone claimed as a dependent.", "warn");
    } else {
      const base = Math.min(adj.studentLoanInterest, p.studentLoanInterest.max);
      const start = p.studentLoanInterest.phaseoutStart[fs];
      const range = p.studentLoanInterest.phaseoutRange[fs];
      studentLoan = base * (1 - clamp((slMagi - start) / range, 0, 1));
      add("student_loan", "adjustments", "Student loan interest", studentLoan, "Schedule 1, line 21",
        `Lesser of interest paid and ${usd(p.studentLoanInterest.max)} = ${usd(base)}, phased out between MAGI ${usd(start)} and ${usd(start + range)} (yours: ${usd(slMagi)}).`);
    }
  }

  if (educator > 0) add("educator", "adjustments", "Educator expenses", educator, "Schedule 1, line 11", `Up to ${usd(EDUCATOR_CAP_PER_PERSON)} per eligible educator.`);
  if (hsa > 0) add("hsa", "adjustments", "HSA deduction", hsa, "Schedule 1, line 13", "Contributions made outside payroll (payroll HSA contributions are already excluded from W-2 wages).");
  if (halfSE > 0) add("half_se", "adjustments", "Deductible part of SE tax", halfSE, "Schedule 1, line 15", `Half of the ${usd(se.totalSETax)} self-employment tax.`);
  if (seRetirement > 0) add("se_retirement", "adjustments", "SEP / SIMPLE / solo 401(k)", seRetirement, "Schedule 1, line 16", "Self-employed retirement contributions.");
  if (seHealth > 0) add("se_health", "adjustments", "Self-employed health insurance", seHealth, "Schedule 1, line 17", "Limited to business net earnings after half-SE and retirement deductions.");
  if (otherAdj !== 0) add("other_adj", "adjustments", "Other adjustments", otherAdj, "Schedule 1, line 24z", "Other adjustments as entered.");

  const totalAdjustments = baseAdjustments + iraDeduction + studentLoan;
  add("total_adjustments", "adjustments", "Total adjustments", totalAdjustments, "Schedule 1, line 26", "Sum of above-the-line adjustments.");
  const agi = totalIncome - totalAdjustments;
  add("agi", "adjustments", "Adjusted gross income", agi, "Form 1040, line 11", `Total income ${usd(totalIncome)} − adjustments ${usd(totalAdjustments)}.`);
  const magi = agi + inv.taxExemptInterest;
  // MAGI for OBBBA deductions, SALT, CTC, NIIT etc. = AGI + foreign exclusions (not modeled) = AGI.
  const phaseMagi = agi;
  const agiPos = Math.max(0, agi);

  /* ---------------- Standard deduction ---------------- */
  const addlPer = married ? p.additionalStandardDeduction.married : p.additionalStandardDeduction.unmarried;
  const addlCount =
    (inp.taxpayer.age65OrOlder ? 1 : 0) + (inp.taxpayer.blind ? 1 : 0) +
    // MFS: the spouse's amounts count only if the spouse had no gross income and isn't a dependent (Pub 501).
    (joint || (fs === "mfs" && inp.spouseHadNoGrossIncome) ? (spouseFlags.age65OrOlder ? 1 : 0) + (spouseFlags.blind ? 1 : 0) : 0);
  let baseStd = p.standardDeduction[fs];
  let stdNote = `Basic standard deduction for ${fs.toUpperCase()}: ${usd(baseStd)}.`;
  if (inp.claimedAsDependent) {
    const limited = Math.min(baseStd, Math.max(p.dependentStandardDeduction.min, earnedIncome + p.dependentStandardDeduction.earnedPlus));
    stdNote = `Claimed as a dependent: greater of ${usd(p.dependentStandardDeduction.min)} or earned income + ${usd(p.dependentStandardDeduction.earnedPlus)}, capped at ${usd(baseStd)} = ${usd(limited)}.`;
    baseStd = limited;
  }
  const standardDeduction = baseStd + addlCount * addlPer;
  if (addlCount > 0) stdNote += ` Plus ${addlCount} × ${usd(addlPer)} for age 65+/blindness.`;

  /* ---------------- OBBBA additional deductions (both methods) ---------------- */
  let seniorDeduction = 0;
  if (p.seniorDeduction) {
    const seniors = (inp.taxpayer.age65OrOlder ? 1 : 0) + (married ? (spouseFlags.age65OrOlder ? 1 : 0) : 0);
    if (seniors > 0 && fs === "mfs") {
      add("senior", "deductions", "Senior deduction", 0, "Schedule 1-A, Part V", "Married taxpayers must file jointly to claim the senior deduction.", "warn");
      warn("The OBBBA senior deduction is not available when married filing separately.");
    } else if (seniors > 0) {
      const sp = p.seniorDeduction;
      const each = phaseOut(sp.amount, phaseMagi - sp.phaseoutStart[fs], sp.phaseoutRate);
      seniorDeduction = each * seniors;
      add("senior", "deductions", "Senior deduction", seniorDeduction, "Schedule 1-A, Part V",
        `${usd(sp.amount)} per person age 65+ (${seniors}), each reduced by ${pct(sp.phaseoutRate)} of MAGI over ${usd(sp.phaseoutStart[fs])} (MAGI ${usd(phaseMagi)}).`);
    }
  }

  let tipsDeduction = 0;
  let overtimeDeduction = 0;
  const tips = (inp.w2.qualifiedTips ?? 0) + (spouseW2?.qualifiedTips ?? 0);
  const overtime = (inp.w2.qualifiedOvertime ?? 0) + (spouseW2?.qualifiedOvertime ?? 0);
  if ((tips > 0 || overtime > 0) && fs === "mfs") {
    warn("The OBBBA tips and overtime deductions require a joint return if married; not allowed for MFS.");
  } else {
    if (tips > 0 && p.tipsDeduction) {
      const tp = p.tipsDeduction;
      tipsDeduction = phaseOut(Math.min(tips, tp.max), phaseMagi - tp.phaseoutStart[fs], tp.phaseoutRate);
      add("tips", "deductions", "No tax on tips", tipsDeduction, "Schedule 1-A, Part II",
        `Qualified tips ${usd(tips)}, capped at ${usd(tp.max)}, reduced by $100 per $1,000 of MAGI over ${usd(tp.phaseoutStart[fs])}.`);
    }
    if (overtime > 0 && p.overtimeDeduction) {
      const op = p.overtimeDeduction;
      overtimeDeduction = phaseOut(Math.min(overtime, op.max[fs]), phaseMagi - op.phaseoutStart[fs], op.phaseoutRate);
      add("overtime", "deductions", "No tax on overtime", overtimeDeduction, "Schedule 1-A, Part III",
        `Qualified overtime premium ${usd(overtime)}, capped at ${usd(op.max[fs])}, reduced by $100 per $1,000 of MAGI over ${usd(op.phaseoutStart[fs])}.`);
    }
  }
  let carLoanInterestDeduction = 0;
  if (adj.carLoanInterest > 0 && p.carLoanInterest) {
    const cp = p.carLoanInterest;
    carLoanInterestDeduction = carLoanPhase(Math.min(adj.carLoanInterest, cp.max), phaseMagi, cp.phaseoutStart[fs], cp.phaseoutPer1000);
    add("car_loan", "deductions", "Car loan interest", carLoanInterestDeduction, "Schedule 1-A, Part IV",
      `Interest on a new US-assembled personal vehicle, capped at ${usd(cp.max)}, reduced by ${usd(cp.phaseoutPer1000)} per $1,000 (or part) of MAGI over ${usd(cp.phaseoutStart[fs])}. Reduces taxable income, not AGI.`);
  }
  const additionalDeductions = seniorDeduction + tipsDeduction + overtimeDeduction + carLoanInterestDeduction;

  /* ---------------- Itemized deductions ---------------- */
  const it = inp.deductions.itemized;
  const medical = Math.max(0, it.medicalExpenses - p.itemized.medicalAgiFloor * agiPos);
  const saltPaid = it.stateLocalIncomeOrSalesTax + it.realEstateTaxes + it.personalPropertyTaxes;
  const saltCap = Math.max(p.salt.floor[fs], p.salt.cap[fs] - p.salt.phaseoutRate * Math.max(0, phaseMagi - p.salt.phaseoutStart[fs]));
  const saltAllowed = Math.min(saltPaid, saltCap);
  const debtLimit = fs === "mfs" ? p.itemized.mortgageDebtLimit / 2 : p.itemized.mortgageDebtLimit;
  const mortgageInterest = it.mortgagePrincipal > debtLimit ? it.mortgageInterest * (debtLimit / it.mortgagePrincipal) : it.mortgageInterest;
  const cashAllowed = Math.min(it.charitableCash, p.charitable.cashAgiLimit * agiPos);
  const nonCashAllowed = Math.min(it.charitableNonCash, p.charitable.nonCashAgiLimit * agiPos, Math.max(0, p.charitable.cashAgiLimit * agiPos - cashAllowed));
  const charityFloor = p.charitable.itemizedAgiFloor * agiPos;
  const charitable = Math.max(0, cashAllowed + nonCashAllowed - charityFloor);
  if (cashAllowed + nonCashAllowed < it.charitableCash + it.charitableNonCash) {
    warn("Some charitable gifts exceed the AGI percentage limits; the excess carries forward up to 5 years (not modeled).");
  }
  const casualty = it.casualtyLosses;
  const otherIt = it.otherItemized;
  const itemizedBeforeCap = medical + saltAllowed + mortgageInterest + charitable + casualty + otherIt;

  /* QBI (sec. 199A) as a function of taxable income before QBI; used twice (sec. 68 base, then final). */
  const qbiThreshold = p.qbi.thresholdStart[fs];
  const qbiRange = p.qbi.phaseInRange[fs];
  const qbiAmount = oth.selfEmploymentNetProfit - halfSE - seHealth - seRetirement;
  const qbiW2 = oth.qbiW2Wages ?? 0;
  const qbiUbia = oth.qbiUBIA ?? 0;
  const computeQbi = (tiBeforeQbi: number) => {
    if (oth.selfEmploymentNetProfit === 0 || qbiAmount <= 0) return null;
    const c = qbiComponent(qbiAmount, qbiW2, qbiUbia, tiBeforeQbi, qbiThreshold, qbiRange, oth.selfEmploymentIsSSTB, p.qbi.rate);
    const incomeLimit = p.qbi.rate * Math.max(0, tiBeforeQbi - (sd.netCapitalGain + inv.qualifiedDividends));
    let deduction = Math.max(0, Math.min(c.component, incomeLimit));
    // OBBBA sec. 199A(i) (2026+): at least $400 when QBI is at least $1,000 (never more than taxable income).
    const minimum = p.qbi.minimumDeduction;
    if (minimum && qbiAmount >= minimum.minQbi && deduction < minimum.amount) deduction = Math.min(minimum.amount, tiBeforeQbi);
    return { deduction, incomeLimit, ...c };
  };

  // Sec. 68 (2026+): reduce itemized deductions by 2/37 of the lesser of itemized deductions or taxable
  // income (before sec. 68, increased by itemized deductions) above the 37% bracket start. That base is
  // AGI − OBBBA below-the-line deductions − QBI, so QBI is first estimated using unreduced itemized.
  let itemizedCapReduction = 0;
  let sec68Base = 0;
  if (p.charitable.topBracketValueCap !== null && itemizedBeforeCap > 0) {
    const top37 = bracketStart(TOP_RATE, brackets);
    const qbiForCap = computeQbi(Math.max(0, agi - itemizedBeforeCap - additionalDeductions))?.deduction ?? 0;
    sec68Base = Math.max(0, agi - additionalDeductions - qbiForCap);
    const excess = Math.max(0, sec68Base - top37);
    itemizedCapReduction = ((TOP_RATE - p.charitable.topBracketValueCap) / TOP_RATE) * Math.min(itemizedBeforeCap, excess);
  }
  const itemizedTotal = Math.max(0, itemizedBeforeCap - itemizedCapReduction);

  const nonItemizerMax = p.charitable.nonItemizerMax ? p.charitable.nonItemizerMax[fs] : 0;
  const nonItemizerPotential = Math.min(it.charitableCash, nonItemizerMax);

  let method: "standard" | "itemized";
  const m = inp.deductions.method;
  if (m === "standard" || m === "itemized") method = m;
  else method = itemizedTotal > standardDeduction + nonItemizerPotential ? "itemized" : "standard";
  const nonItemizerCharitable = method === "standard" ? nonItemizerPotential : 0;
  if (fs === "mfs" && method === "standard") warn("MFS: if your spouse itemizes, you must itemize too (standard deduction becomes $0).");

  add("std_deduction", "deductions", "Standard deduction", standardDeduction, "Form 1040, line 12", stdNote);
  if (itemizedBeforeCap > 0 || method === "itemized") {
    add("medical", "deductions", "Medical (over 7.5% of AGI)", medical, "Schedule A, line 4",
      `Expenses ${usd(it.medicalExpenses)} − ${pct(p.itemized.medicalAgiFloor)} of AGI (${usd(p.itemized.medicalAgiFloor * agiPos)}).`);
    add("salt", "deductions", "State and local taxes (SALT)", saltAllowed, "Schedule A, line 5e",
      `Paid ${usd(saltPaid)}. OBBBA cap ${usd(p.salt.cap[fs])}, reduced by ${pct(p.salt.phaseoutRate)} of MAGI over ${usd(p.salt.phaseoutStart[fs])} but not below ${usd(p.salt.floor[fs])} → cap ${usd(saltCap)}.`);
    add("mortgage", "deductions", "Mortgage interest", mortgageInterest, "Schedule A, line 8",
      it.mortgagePrincipal > debtLimit
        ? `Interest ${usd(it.mortgageInterest)} × (${usd(debtLimit)} limit ÷ ${usd(it.mortgagePrincipal)} principal).`
        : "Acquisition debt is within the limit, so all interest is deductible.");
    add("charitable", "deductions", "Charitable gifts", charitable, "Schedule A, line 14",
      `Cash ${usd(cashAllowed)} (≤ ${pct(p.charitable.cashAgiLimit)} of AGI) + non-cash ${usd(nonCashAllowed)} (≤ ${pct(p.charitable.nonCashAgiLimit)} of AGI)` +
        (charityFloor > 0 ? ` − 2026 floor of ${pct(p.charitable.itemizedAgiFloor)} of AGI (${usd(charityFloor)}).` : "."));
    if (casualty > 0) add("casualty", "deductions", "Casualty losses", casualty, "Schedule A, line 15", "Federally declared disaster losses, as entered (already net of floors).");
    if (otherIt > 0) add("other_itemized", "deductions", "Other itemized", otherIt, "Schedule A, line 16", "Other itemized deductions as entered.");
    if (itemizedCapReduction > 0) {
      add("itemized_cap", "deductions", "37% bracket value cap", -itemizedCapReduction, "IRC §68 (OBBBA)",
        `Itemized deductions are worth at most ${pct(p.charitable.topBracketValueCap ?? 0)} per dollar for income in the 37% bracket: reduction = 2/37 × lesser of itemized deductions (${usd(itemizedBeforeCap)}) or taxable income before this rule plus itemized deductions (AGI − OBBBA deductions − QBI = ${usd(sec68Base)}) above ${usd(bracketStart(TOP_RATE, brackets))}.`);
    }
    add("itemized_total", "deductions", "Total itemized", itemizedTotal, "Schedule A, line 17", "Sum of Schedule A lines after limits.");
  }
  const chosenDeduction = method === "standard" ? standardDeduction : itemizedTotal;
  add("deduction_choice", "deductions", method === "standard" ? "Using standard deduction" : "Using itemized deductions", chosenDeduction, "Form 1040, line 12",
    m === "auto"
      ? `Auto-selected the larger: standard ${usd(standardDeduction)}${nonItemizerPotential > 0 ? ` (+ ${usd(nonItemizerPotential)} non-itemizer charitable)` : ""} vs itemized ${usd(itemizedTotal)}.`
      : `You chose the ${method} deduction.`);
  if (nonItemizerCharitable > 0) {
    add("nonitemizer_charitable", "deductions", "Charitable deduction (non-itemizers)", nonItemizerCharitable, "Form 1040 (OBBBA §170(p))",
      `2026+: cash gifts up to ${usd(nonItemizerMax)} deductible even with the standard deduction.`);
  }

  /* ---------------- QBI (final pass, with sec. 68-reduced deductions) ---------------- */
  const tiBeforeQbi = Math.max(0, agi - chosenDeduction - additionalDeductions - nonItemizerCharitable);
  let qbiDeduction = 0;
  if (oth.selfEmploymentNetProfit !== 0) {
    const qr = computeQbi(tiBeforeQbi);
    if (!qr) {
      add("qbi", "deductions", "QBI deduction", 0, "Form 8995", "Qualified business income is zero or a loss; no deduction (a loss carries forward).");
      if (qbiAmount < 0) warn("Negative qualified business income carries forward to reduce next year's QBI (not modeled).");
    } else {
      qbiDeduction = qr.deduction;
      const minimum = p.qbi.minimumDeduction;
      let limitNote = "";
      if (qr.phaseFraction > 0) {
        limitNote = ` Taxable income ${usd(tiBeforeQbi)} is above the ${usd(qbiThreshold)} threshold (${pct(qr.phaseFraction)} through the ${usd(qbiRange)} phase-in range), so the W-2 wage / UBIA limit applies using your inputs: greater of 50% of W-2 wages (${usd(qbiW2)}) or 25% of W-2 wages + 2.5% of UBIA (${usd(qbiUbia)}) = ${usd(qr.wageLimit)}${oth.selfEmploymentIsSSTB ? `, after scaling by the SSTB applicable percentage ${pct(qr.applicable)}` : ""}.`;
      }
      add("qbi", "deductions", "QBI deduction", qbiDeduction, "Form 8995 / 8995-A",
        `QBI = profit − half SE tax − SE health − SE retirement = ${usd(qbiAmount)}. Component after limits ${usd(qr.component)}.${limitNote} ` +
          `Limited to 20% of taxable income before QBI less net capital gain and qualified dividends (${usd(qr.incomeLimit)})` +
          (minimum ? `; 2026+ minimum ${usd(minimum.amount)} when QBI is at least ${usd(minimum.minQbi)}.` : "."));
    }
  }

  const taxableIncomeUnclamped = agi - chosenDeduction - additionalDeductions - nonItemizerCharitable - qbiDeduction;
  const taxableIncome = Math.max(0, taxableIncomeUnclamped);
  const carry = sd.total < 0 ? capitalLossCarryover(sd.st, sd.lt, sd.lossDeducted, taxableIncomeUnclamped) : { used: 0, carryST: 0, carryLT: 0 };
  if (sd.total < 0) {
    add("capital_loss_carryover", "income", "Capital loss carryover to next year", carry.carryST + carry.carryLT, "Capital Loss Carryover Worksheet",
      `Of the ${usd(sd.lossDeducted)} loss deduction, only ${usd(carry.used)} actually reduced taxable income (worksheet line 4: lesser of the deduction and taxable income before the zero floor plus the deduction). ` +
        `Unused net loss carries forward: ${usd(carry.carryST)} short-term, ${usd(carry.carryLT)} long-term (short-term absorbed first).`);
  }
  add("taxable_income", "deductions", "Taxable income", taxableIncome, "Form 1040, line 15",
    `AGI ${usd(agi)} − deduction ${usd(chosenDeduction)}${additionalDeductions + nonItemizerCharitable > 0 ? ` − OBBBA deductions ${usd(additionalDeductions + nonItemizerCharitable)}` : ""}${qbiDeduction > 0 ? ` − QBI ${usd(qbiDeduction)}` : ""}, not below zero.`);

  /* ---------------- Regular tax ---------------- */
  const bp = p.ltcgBreakpoints[fs];
  const q = qdcgTax(taxableIncome, inv.qualifiedDividends, sd.netCapitalGain, brackets, bp);
  const regularTax = q.tax;
  const usedTable = taxableIncome < TAX_TABLE_LIMIT;
  add("ordinary_tax", "tax", "Tax on ordinary income", q.ordinaryTax, "QDCG Worksheet, line 22",
    `${usd(q.ordinaryPortion)} of ordinary income taxed by the ${fs.toUpperCase()} bracket schedule` +
      (q.ordinaryPortion < TAX_TABLE_LIMIT ? " (Tax Table: computed at the midpoint of its $50 row and rounded)." : "."));
  if (q.preferentialIncome > 0) {
    add("ltcg_0pct", "tax", "Taxed at 0%", q.taxedAt0, "QDCG Worksheet, line 9",
      `Qualified dividends + net capital gain (${usd(q.preferentialIncome)}) stack on top of ordinary income; the part below ${usd(bp.zeroUpTo)} is taxed at 0%.`);
    add("ltcg_15pct", "tax", "Taxed at 15%", q.taxedAt15, "QDCG Worksheet, line 17", `Portion between ${usd(bp.zeroUpTo)} and ${usd(bp.fifteenUpTo)} → ${usd(q.taxedAt15 * 0.15)} tax.`);
    add("ltcg_20pct", "tax", "Taxed at 20%", q.taxedAt20, "QDCG Worksheet, line 20", `Portion above ${usd(bp.fifteenUpTo)} → ${usd(q.taxedAt20 * 0.2)} tax.`);
  }
  add("regular_tax", "tax", "Regular tax", regularTax, "Form 1040, line 16",
    q.preferentialIncome > 0
      ? `Lesser of worksheet tax ${usd(q.ordinaryTax + q.preferentialTax)} and tax on all income as ordinary ${usd(q.allOrdinaryTax)}, rounded.`
      : `Tax on ${usd(taxableIncome)} from the ${usedTable ? "Tax Table" : "Tax Computation Worksheet"}.`);
  const capitalGains: CapitalGainsDetail = {
    netShortTerm: cents(sd.st),
    netLongTerm: cents(sd.lt),
    netCapitalGainOrLoss: cents(sd.total),
    capitalLossDeducted: cents(sd.lossDeducted),
    carryforwardShortTerm: cents(carry.carryST),
    carryforwardLongTerm: cents(carry.carryLT),
    taxedAt0: cents(q.taxedAt0),
    taxedAt15: cents(q.taxedAt15),
    taxedAt20: cents(q.taxedAt20),
    preferentialTax: cents(q.preferentialTax),
  };

  /* ---------------- AMT ---------------- */
  const amtAddBack = method === "standard" ? standardDeduction : saltAllowed;
  const prefs = inp.amt.isoBargainElement + inp.amt.privateActivityBondInterest + inp.amt.otherAmtAdjustments;
  // Sec. 56(b)(1)(F): sec. 68 does not apply for AMT, so AMT itemized deductions are the unreduced
  // amounts; AMTI therefore excludes the 2026 sec. 68 reduction that was added back into taxable income.
  // 2025 Instructions for Form 6251 (line 1a): the OBBBA senior deduction (Schedule 1-A line 37) is
  // treated as a personal exemption and added back to AMTI under sec. 56(b)(5)(D). Tips, overtime and
  // car loan interest deductions are not added back.
  const sec68AmtAdjustment = method === "itemized" ? itemizedCapReduction : 0;
  const amti = Math.max(0, taxableIncome + amtAddBack + seniorDeduction + prefs - sec68AmtAdjustment);
  const amtExemption = phaseOut(p.amt.exemption[fs], amti - p.amt.phaseoutStart[fs], p.amt.phaseoutRate);
  const amtBase = Math.max(0, amti - amtExemption);
  const th28 = fs === "mfs" ? p.amt.rate28ThresholdMFS : p.amt.rate28Threshold;
  const tmt = roundDollar(tentativeMinimumTax(amtBase, q.preferentialIncome, th28, bp, q.ordinaryPortion));
  const amtOwed = Math.max(0, tmt - regularTax);
  add("amti", "tax", "Alternative minimum taxable income", amti, "Form 6251, line 4",
    `Taxable income + ${method === "standard" ? "standard deduction" : "SALT"} add-back (${usd(amtAddBack)})${seniorDeduction > 0 ? ` + senior deduction add-back ${usd(seniorDeduction)} (Form 6251 line 1a)` : ""} + preferences (ISO ${usd(inp.amt.isoBargainElement)}, private activity bonds ${usd(inp.amt.privateActivityBondInterest)}, other ${usd(inp.amt.otherAmtAdjustments)})${sec68AmtAdjustment > 0 ? ` − sec. 68 reduction ${usd(sec68AmtAdjustment)} (sec. 68 does not apply for AMT)` : ""}.`);
  add("amt_exemption", "tax", "AMT exemption", amtExemption, "Form 6251, line 5",
    `${usd(p.amt.exemption[fs])} reduced by ${pct(p.amt.phaseoutRate)} of AMTI over ${usd(p.amt.phaseoutStart[fs])}.`);
  add("tmt", "tax", "Tentative minimum tax", tmt, "Form 6251, line 9",
    `26% on the first ${usd(th28)} of AMTI after exemption, 28% above; capital gains and qualified dividends keep their 0/15/20% rates, with the 0%/15% bands measured above regular-tax ordinary income (${usd(q.ordinaryPortion)}).`);
  add("amt", "tax", "Alternative minimum tax", amtOwed, "Schedule 2, line 2",
    amtOwed > 0 ? `Tentative minimum tax ${usd(tmt)} exceeds regular tax ${usd(regularTax)}.` : "Tentative minimum tax does not exceed regular tax, so no AMT.",
    amtOwed > 0 ? "warn" : "info");
  if (amtOwed > 0 || prefs > 0) warn("AMT is a simplified Form 6251 (no AMT foreign tax credit, minimum tax credit carryforward, or depreciation adjustments).");
  const amtDetail: AMTDetail = { amti: cents(amti), exemption: cents(amtExemption), tentativeMinimumTax: tmt, amtOwed };

  /* ---------------- Nonrefundable credits ---------------- */
  const liability = regularTax + amtOwed;
  let remaining = liability;
  const take = (x: number): number => {
    const used = roundDollar(Math.min(Math.max(0, x), remaining));
    remaining -= used;
    return used;
  };
  const cr = inp.credits;

  // Foreign tax credit
  let foreignTaxCredit = 0;
  if (cr.foreignTaxPaid > 0) {
    foreignTaxCredit = take(cr.foreignTaxPaid);
    const deMinimis = cr.foreignTaxPaid <= FTC_DE_MINIMIS[fs];
    if (!deMinimis) warn("Foreign tax above the de minimis amount normally requires Form 1116 limits (not modeled; full credit assumed up to your tax).");
    add("ftc", "credits", "Foreign tax credit", foreignTaxCredit, "Schedule 3, line 1",
      deMinimis ? `Foreign tax ${usd(cr.foreignTaxPaid)} is within the ${usd(FTC_DE_MINIMIS[fs])} election limit, so no Form 1116.` : "Full credit assumed (Form 1116 limitation not modeled).");
  }

  // Child and dependent care
  let childCareCredit = 0;
  if (cr.childCareExpenses > 0 && cr.childCareQualifyingPersons > 0) {
    if (fs === "mfs") {
      add("child_care", "credits", "Child & dependent care credit", 0, "Form 2441", "Generally not allowed for married filing separately.", "warn");
    } else {
      const persons = Math.min(cr.childCareQualifyingPersons, p.childCareCredit.maxPersons);
      const earnedLimit = joint ? Math.min(earnedTp, earnedSp) : earnedTp;
      const expenses = Math.min(cr.childCareExpenses, p.childCareCredit.maxExpensesPerPerson * persons, Math.max(0, earnedLimit));
      const rate = childCareRate(agi, fs, p.childCareCredit);
      childCareCredit = take(expenses * rate);
      add("child_care", "credits", "Child & dependent care credit", childCareCredit, "Form 2441",
        `Qualified expenses ${usd(expenses)} (≤ ${usd(p.childCareCredit.maxExpensesPerPerson)} per person, ≤ ${joint ? "lower-earning spouse's" : "your"} earned income) × ${pct(rate)} AGI-based rate.`);
    }
  }

  // American Opportunity Credit
  let aotcNon = 0;
  let aotcRef = 0;
  if (cr.americanOpportunityExpenses > 0 && cr.americanOpportunityStudents > 0) {
    if (fs === "mfs") {
      add("aotc", "credits", "American Opportunity Credit", 0, "Form 8863", "Not allowed for married filing separately.", "warn");
    } else {
      const a = p.aotc;
      const perStudent = cr.americanOpportunityExpenses / cr.americanOpportunityStudents;
      const perCredit = Math.min(perStudent, a.first) * AOTC_FIRST_RATE + Math.min(Math.max(0, perStudent - a.first), a.secondUpTo) * a.secondRate;
      const gross = Math.min(perCredit, a.max) * cr.americanOpportunityStudents;
      const frac = clamp((a.phaseoutStart[fs] + a.phaseoutRange[fs] - phaseMagi) / a.phaseoutRange[fs], 0, 1);
      const allowed = gross * frac;
      aotcRef = inp.claimedAsDependent ? 0 : roundDollar(allowed * a.refundableShare);
      aotcNon = take(allowed - aotcRef);
      add("aotc", "credits", "American Opportunity Credit (nonrefundable 60%)", aotcNon, "Form 8863, line 19",
        `100% of the first ${usd(a.first)} + 25% of the next ${usd(a.secondUpTo)} per student = ${usd(gross)}, × phase-out fraction ${pct(frac)} = ${usd(allowed)}; 40% (${usd(aotcRef)}) is refundable.`);
    }
  }

  // Saver's credit
  let saversCredit = 0;
  if (cr.retirementSaversContributions > 0) {
    if (inp.claimedAsDependent) {
      add("savers", "credits", "Saver's credit", 0, "Form 8880", "Not available to someone claimed as a dependent.", "warn");
    } else {
      const contrib = Math.min(cr.retirementSaversContributions, p.saversCredit.maxContribution * people);
      const tier = p.saversCredit.tiers.find((t) => agi <= t.agiUpTo[fs]);
      const rate = tier?.rate ?? 0;
      saversCredit = take(contrib * rate);
      add("savers", "credits", "Saver's credit", saversCredit, "Form 8880",
        `Eligible contributions ${usd(contrib)} × ${pct(rate)} (rate set by AGI ${usd(agi)}).`);
    }
  }

  // Child tax credit / credit for other dependents (Schedule 8812)
  const ctcP = p.childTaxCredit;
  const kids = inp.dependents.qualifyingChildrenUnder17;
  const others = inp.dependents.otherDependents;
  const ctcGross = kids * ctcP.perChild;
  const odcGross = others * ctcP.otherDependent;
  const ctcReduction = ctcP.phaseoutPer1000 * Math.ceil(Math.max(0, phaseMagi - ctcP.phaseoutStart[fs]) / 1_000);
  const ctcAfterPhase = Math.max(0, ctcGross + odcGross - ctcReduction);
  const ctcPart = Math.min(ctcGross, ctcAfterPhase);
  const ctcUsedTotal = take(ctcAfterPhase);
  const childTaxCredit = Math.min(ctcPart, ctcUsedTotal);
  const otherDependentCredit = ctcUsedTotal - childTaxCredit;
  let additionalChildTaxCredit = 0;
  if (ctcGross + odcGross > 0) {
    add("ctc", "credits", "Child tax credit / other dependents", ctcUsedTotal, "Form 1040, line 19",
      `${kids} × ${usd(ctcP.perChild)} + ${others} × ${usd(ctcP.otherDependent)} = ${usd(ctcGross + odcGross)}, less ${usd(ctcP.phaseoutPer1000)} per $1,000 (or part) of MAGI over ${usd(ctcP.phaseoutStart[fs])} (${usd(ctcReduction)}) = ${usd(ctcAfterPhase)}; ${usd(ctcUsedTotal)} usable against your tax.`);
    if (kids > 0) {
      const unused = ctcAfterPhase - ctcUsedTotal;
      const earnedCap = ctcP.refundableRate * Math.max(0, earnedIncome - ctcP.refundableEarnedIncomeFloor);
      additionalChildTaxCredit = roundDollar(Math.min(unused, kids * ctcP.refundableMax, earnedCap));
      add("actc", "credits", "Additional child tax credit (refundable)", additionalChildTaxCredit, "Schedule 8812, line 27",
        `Lesser of unused credit ${usd(unused)}, ${kids} × ${usd(ctcP.refundableMax)}, and 15% of earned income over ${usd(ctcP.refundableEarnedIncomeFloor)} (${usd(earnedCap)}).`);
    }
  }

  const otherNonrefundable = take(cr.otherNonrefundableCredits);
  if (cr.otherNonrefundableCredits > 0) add("other_nonref", "credits", "Other nonrefundable credits", otherNonrefundable, "Schedule 3, line 6z", "As entered, limited to remaining tax.");
  const totalNonrefundable = foreignTaxCredit + childCareCredit + aotcNon + saversCredit + ctcUsedTotal + otherNonrefundable;
  const taxAfterCredits = Math.max(0, liability - totalNonrefundable);
  add("tax_after_credits", "credits", "Tax after nonrefundable credits", taxAfterCredits, "Form 1040, line 22",
    `Regular tax ${usd(regularTax)} + AMT ${usd(amtOwed)} − nonrefundable credits ${usd(totalNonrefundable)}.`);

  /* ---------------- EITC ---------------- */
  let earnedIncomeCredit = 0;
  const investmentIncomeEitc =
    inv.taxableInterest + inv.taxExemptInterest + inv.ordinaryDividends + Math.max(0, sd.line7) + Math.max(0, oth.scheduleEIncome);
  const eitcKids = Math.min(3, inp.dependents.eitcQualifyingChildren);
  if (earnedIncome > 0) {
    if (fs === "mfs") {
      if (agi < (p.eitc.phaseoutEndMFJ[3] ?? 0)) warn("EITC is not allowed for married filing separately in this model (the separated-spouse exception is not modeled).");
    } else if (inp.claimedAsDependent) {
      // Not eligible; silent unless they would otherwise qualify.
    } else if (investmentIncomeEitc > p.eitc.investmentIncomeLimit) {
      add("eitc", "credits", "Earned income credit", 0, "Form 1040, line 27",
        `Investment income ${usd(investmentIncomeEitc)} exceeds the ${usd(p.eitc.investmentIncomeLimit)} limit, so no EITC.`, "warn");
    } else if (eitcKids === 0 && inp.taxpayer.age65OrOlder && (!joint || spouseFlags.age65OrOlder)) {
      add("eitc", "credits", "Earned income credit", 0, "Form 1040, line 27", "Without a qualifying child the EITC requires age 25-64.", "warn");
    } else {
      earnedIncomeCredit = eitcAmount(earnedIncome, agi, eitcKids, joint, p.eitc);
      if (earnedIncomeCredit > 0) {
        add("eitc", "credits", "Earned income credit", earnedIncomeCredit, "Form 1040, line 27",
          `${eitcKids} qualifying child(ren): credit phases in with earned income ${usd(earnedIncome)} up to ${usd(p.eitc.maxCredit[eitcKids] ?? 0)}, then phases out above ${usd((joint ? p.eitc.phaseoutStartMFJ : p.eitc.phaseoutStart)[eitcKids] ?? 0)} of the greater of earned income or AGI (EIC Table $50-row midpoint).`);
      }
    }
  }

  const otherRefundable = roundDollar(cr.otherRefundableCredits);
  const totalRefundable = earnedIncomeCredit + additionalChildTaxCredit + aotcRef + otherRefundable;
  const credits: CreditsDetail = {
    childTaxCredit,
    otherDependentCredit,
    additionalChildTaxCredit,
    earnedIncomeCredit,
    childCareCredit,
    americanOpportunityNonrefundable: aotcNon,
    americanOpportunityRefundable: aotcRef,
    saversCredit,
    foreignTaxCredit,
    otherNonrefundable,
    otherRefundable,
    totalNonrefundable,
    totalRefundable,
  };

  /* ---------------- Other taxes ---------------- */
  if (se.totalSETax > 0) {
    add("se_tax", "other_taxes", "Self-employment tax", se.totalSETax, "Schedule SE, line 12",
      `Net earnings = ${pct(p.socialSecurity.seFactor)} × ${usd(oth.selfEmploymentNetProfit)} = ${usd(se.netEarnings)}. ` +
        `12.4% Social Security on up to ${usd(Math.max(0, p.socialSecurity.wageBase - wagesTp))} (wage base ${usd(p.socialSecurity.wageBase)} less W-2 wages) = ${usd(se.socialSecurityTax)}; 2.9% Medicare on all = ${usd(se.medicareTax)}.`);
  }
  const medWagesTp = inp.w2.medicareWages && inp.w2.medicareWages > 0 ? inp.w2.medicareWages : wagesTp;
  const medWagesSp = spouseW2 ? (spouseW2.medicareWages && spouseW2.medicareWages > 0 ? spouseW2.medicareWages : wagesSp) : 0;
  const medWages = medWagesTp + medWagesSp;
  const amThreshold = p.additionalMedicare.threshold[fs];
  const amWages = Math.max(0, medWages - amThreshold);
  const amSE = Math.max(0, se.netEarnings - Math.max(0, amThreshold - medWages));
  const additionalMedicareTax = roundDollar((amWages + (se.totalSETax > 0 ? amSE : 0)) * p.additionalMedicare.rate);
  if (additionalMedicareTax > 0) {
    add("addl_medicare", "other_taxes", "Additional Medicare Tax", additionalMedicareTax, "Form 8959",
      `0.9% on Medicare wages over ${usd(amThreshold)} (${usd(amWages)}) plus SE earnings over the threshold remaining after wages (${usd(se.totalSETax > 0 ? amSE : 0)}). Employer withholding of this tax is not separately modeled.`);
  }
  const nii = Math.max(0, inv.taxableInterest + inv.ordinaryDividends + sd.line7 + oth.scheduleEIncome);
  const niitThreshold = p.niit.threshold[fs];
  const niitBase = Math.min(nii, Math.max(0, phaseMagi - niitThreshold));
  const niit = roundDollar(niitBase * p.niit.rate);
  if (niit > 0 || nii > 0) {
    add("niit", "other_taxes", "Net investment income tax", niit, "Form 8960",
      `3.8% × lesser of net investment income ${usd(nii)} or MAGI over ${usd(niitThreshold)} (${usd(Math.max(0, phaseMagi - niitThreshold))}). Schedule E income is assumed passive.`);
  }
  const otherTaxes = se.totalSETax + additionalMedicareTax + niit;
  const totalTax = taxAfterCredits + otherTaxes;
  add("total_tax", "other_taxes", "Total tax", totalTax, "Form 1040, line 24",
    `Tax after credits ${usd(taxAfterCredits)} + SE tax ${usd(se.totalSETax)} + Additional Medicare ${usd(additionalMedicareTax)} + NIIT ${usd(niit)}.`);

  /* ---------------- Payments ---------------- */
  const withholding = inp.w2.federalWithholding + (spouseW2?.federalWithholding ?? 0);
  const pay = inp.payments;
  const withholdingLike = withholding + pay.excessSocialSecurityWithheld;
  const totalPayments = withholdingLike + pay.estimatedTaxPaid + totalRefundable;
  add("withholding", "payments", "Federal income tax withheld", withholding, "Form 1040, line 25", "W-2 box 2 (both spouses on a joint return).");
  if (pay.estimatedTaxPaid > 0) add("estimates", "payments", "Estimated tax payments", pay.estimatedTaxPaid, "Form 1040, line 26", "Quarterly payments made for this year.");
  if (pay.excessSocialSecurityWithheld > 0) add("excess_ss", "payments", "Excess Social Security withheld", pay.excessSocialSecurityWithheld, "Schedule 3, line 11", "Over-withholding from multiple employers.");
  if (totalRefundable > 0) add("refundable", "payments", "Refundable credits", totalRefundable, "Form 1040, lines 27-32", `EITC ${usd(earnedIncomeCredit)} + ACTC ${usd(additionalChildTaxCredit)} + AOTC ${usd(aotcRef)} + other ${usd(otherRefundable)}.`);
  add("total_payments", "payments", "Total payments", totalPayments, "Form 1040, line 33", "Withholding + estimates + refundable credits.");
  const refundOrBalanceDue = cents(totalPayments - totalTax);
  add(refundOrBalanceDue >= 0 ? "refund" : "balance_due", "payments", refundOrBalanceDue >= 0 ? "Refund" : "Amount you owe", Math.abs(refundOrBalanceDue),
    refundOrBalanceDue >= 0 ? "Form 1040, line 34" : "Form 1040, line 37", `Total payments ${usd(totalPayments)} − total tax ${usd(totalTax)}.`);

  /* ---------------- Safe harbor (Form 2210) ---------------- */
  const est = p.estimatedTax;
  const currentTax = Math.max(0, totalTax - totalRefundable);
  const ninety = est.currentYearRate * currentTax;
  const priorRate = pay.priorYearAGI > est.highIncomeAGI[fs] ? est.safeHarborHighIncomeRate : est.safeHarborPriorYearRate;
  const priorReq = pay.priorYearTotalTax > 0 ? priorRate * pay.priorYearTotalTax : Number.POSITIVE_INFINITY;
  const paidToward = withholdingLike + pay.estimatedTaxPaid;
  let basis: SafeHarborDetail["basis"];
  let requiredAnnualPayment: number;
  if (pay.priorYearTaxWasZero || currentTax - withholdingLike < est.minimumOwed) {
    basis = "none_owed";
    requiredAnnualPayment = 0;
  } else if (priorReq < ninety) {
    basis = priorRate > est.safeHarborPriorYearRate ? "110pct_prior" : "100pct_prior";
    requiredAnnualPayment = priorReq;
  } else {
    basis = "90pct_current";
    requiredAnnualPayment = ninety;
  }
  const shortfall = Math.max(0, requiredAnnualPayment - paidToward);
  const installments = inp.options?.installmentsRemaining ?? DEFAULT_INSTALLMENTS;
  const safeHarbor: SafeHarborDetail = {
    requiredAnnualPayment: roundDollar(requiredAnnualPayment),
    basis,
    totalWithholdingAndEstimates: cents(paidToward),
    shortfall: roundDollar(shortfall),
    meetsSafeHarbor: shortfall <= 0,
    suggestedQuarterly: roundDollar(shortfall / installments),
  };
  add("safe_harbor", "payments", "Safe-harbor required payment", safeHarbor.requiredAnnualPayment, "Form 2210",
    basis === "none_owed"
      ? pay.priorYearTaxWasZero
        ? "Last year's total tax was $0 (full 12-month year), so no estimated-tax penalty can apply this year."
        : `Tax after withholding is under ${usd(est.minimumOwed)}, so no underpayment penalty applies.`
      : `Lesser of 90% of this year's tax (${usd(ninety)})${pay.priorYearTotalTax > 0 ? ` and ${pct(priorRate)} of last year's tax (${usd(priorReq)})` : " (enter last year's tax to use the prior-year safe harbor)"}. ` +
        `Paid so far ${usd(paidToward)}; shortfall ${usd(shortfall)}${shortfall > 0 ? `, about ${usd(safeHarbor.suggestedQuarterly)} per remaining installment (${installments}; due ${est.dueDates.slice(-installments).join(", ")})` : ""}.`,
    shortfall > 0 ? "warn" : "info");

  /* ---------------- Rates & warnings ---------------- */
  const topBracket = bracketRateFor(q.ordinaryPortion, brackets);
  warn("State and local income taxes are not modeled; this is a federal-only estimate.");
  const unearned = inv.taxableInterest + inv.ordinaryDividends + Math.max(0, sd.line7);
  if (inp.claimedAsDependent && unearned > p.kiddieTaxThreshold) {
    warn(`Kiddie tax (Form 8615) is not modeled: unearned income over ${usd(p.kiddieTaxThreshold)} may be taxed at the parent's rate.`);
  }

  const deduction: DeductionDetail = {
    method,
    standardDeduction,
    itemizedTotal: cents(itemizedTotal),
    itemizedBreakdown: {
      medical: cents(medical),
      saltAllowed: cents(saltAllowed),
      saltCap: cents(saltCap),
      mortgageInterest: cents(mortgageInterest),
      charitable: cents(charitable),
      casualty: cents(casualty),
      other: cents(otherIt),
    },
    seniorDeduction: cents(seniorDeduction),
    tipsDeduction: cents(tipsDeduction),
    overtimeDeduction: cents(overtimeDeduction),
    carLoanInterestDeduction: cents(carLoanInterestDeduction),
    nonItemizerCharitable: cents(nonItemizerCharitable),
    qbiDeduction: cents(qbiDeduction),
  };

  return {
    input: inp,
    totalIncome: cents(totalIncome),
    totalAdjustments: cents(totalAdjustments),
    agi: cents(agi),
    magi: cents(magi),
    deduction,
    taxableIncome: cents(taxableIncome),
    ordinaryIncomeTax: cents(q.ordinaryTax),
    capitalGains,
    regularTax,
    amt: amtDetail,
    socialSecurity: { grossBenefits: oth.socialSecurityBenefits, taxableBenefits: cents(taxableSS), provisionalIncome: cents(ssw.provisional) },
    selfEmployment: se,
    niit,
    additionalMedicareTax,
    credits,
    totalTax: cents(totalTax),
    totalPayments: cents(totalPayments),
    refundOrBalanceDue,
    effectiveRateOnAGI: agi > 0 ? totalTax / agi : 0,
    effectiveRateOnTaxableIncome: taxableIncome > 0 ? totalTax / taxableIncome : 0,
    marginalRateOrdinary: 0,
    marginalRateLTCG: 0,
    topBracket,
    safeHarbor,
    trace,
    warnings,
  };
}

/** Net federal liability after refundable credits; the quantity marginal rates are measured on. */
function netLiability(r: TaxResult): number {
  return r.totalTax - r.credits.totalRefundable;
}

function withExtraWages(inp: TaxInput, delta: number): TaxInput {
  const mw = inp.w2.medicareWages ?? 0;
  const sw = inp.w2.socialSecurityWages ?? 0;
  return { ...inp, w2: { ...inp.w2, wages: inp.w2.wages + delta, medicareWages: mw > 0 ? mw + delta : mw, socialSecurityWages: sw > 0 ? sw + delta : sw } };
}

function withExtraLTCG(inp: TaxInput, delta: number): TaxInput {
  return { ...inp, investments: { ...inp.investments, netLongTermGain: inp.investments.netLongTermGain + delta } };
}

/**
 * Compute a full federal return for `input`. Pure and synchronous; never throws for bad numbers
 * (they are clamped and reported in `warnings`). Marginal rates are measured numerically by
 * re-running the core computation with +$1,000 of wages and +$1,000 of long-term gain, and are
 * measured on tax net of refundable credits so EITC/ACTC phase-outs show up.
 */
export function computeTax(input: TaxInput): TaxResult {
  const { input: clean, warnings } = sanitizeInput(input);
  const base = computeCore(clean, warnings);
  const plusWages = computeCore(withExtraWages(clean, MARGINAL_DELTA), []);
  const plusLtcg = computeCore(withExtraLTCG(clean, MARGINAL_DELTA), []);
  base.marginalRateOrdinary = cents((netLiability(plusWages) - netLiability(base)) / MARGINAL_DELTA * 100) / 100;
  base.marginalRateLTCG = cents((netLiability(plusLtcg) - netLiability(base)) / MARGINAL_DELTA * 100) / 100;
  base.trace.push({
    id: "marginal_rates",
    section: "tax",
    label: "Marginal rate on next $1,000 of wages",
    amount: base.marginalRateOrdinary,
    note: `Recomputed the whole return with $1,000 more wages: tax (net of refundable credits) rises by ${usd(netLiability(plusWages) - netLiability(base))}. The same test with $1,000 more long-term gain gives ${pct(base.marginalRateLTCG)}. Statutory bracket of the last ordinary dollar: ${pct(base.topBracket)}. Excludes payroll FICA on wages.`,
    severity: "info",
  });
  return base;
}
