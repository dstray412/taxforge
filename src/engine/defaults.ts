import type { TaxInput, TaxYear } from "./types";

/**
 * A blank return: single filer, no dependents, every dollar amount zero, auto deduction choice.
 * Returns a fresh object on every call so callers may mutate it freely.
 */
export function defaultInput(year: TaxYear = 2026): TaxInput {
  return {
    taxYear: year,
    filingStatus: "single",
    taxpayer: { age65OrOlder: false, blind: false, age50OrOlder: false, age55OrOlder: false },
    dependents: { qualifyingChildrenUnder17: 0, otherDependents: 0, eitcQualifyingChildren: 0 },
    w2: { wages: 0, federalWithholding: 0, medicareWages: 0, socialSecurityWages: 0, qualifiedTips: 0, qualifiedOvertime: 0 },
    investments: {
      taxableInterest: 0,
      taxExemptInterest: 0,
      ordinaryDividends: 0,
      qualifiedDividends: 0,
      netShortTermGain: 0,
      netLongTermGain: 0,
      section1256Gain: 0,
      shortTermLossCarryover: 0,
      longTermLossCarryover: 0,
    },
    other: {
      selfEmploymentNetProfit: 0,
      selfEmploymentIsSSTB: false,
      qbiW2Wages: 0,
      qbiUBIA: 0,
      iraDistributions: 0,
      pensions: 0,
      socialSecurityBenefits: 0,
      unemploymentCompensation: 0,
      scheduleEIncome: 0,
      otherIncome: 0,
      taxableStateRefund: 0,
    },
    adjustments: {
      hsaContribution: 0,
      hsaCoverage: "family",
      traditionalIraContribution: 0,
      spouseTraditionalIraContribution: 0,
      coveredByWorkplacePlan: false,
      spouseCoveredByWorkplacePlan: false,
      studentLoanInterest: 0,
      selfEmployedRetirement: 0,
      selfEmployedHealthInsurance: 0,
      educatorExpenses: 0,
      carLoanInterest: 0,
      otherAdjustments: 0,
    },
    deductions: {
      method: "auto",
      itemized: {
        medicalExpenses: 0,
        stateLocalIncomeOrSalesTax: 0,
        realEstateTaxes: 0,
        personalPropertyTaxes: 0,
        mortgageInterest: 0,
        mortgagePrincipal: 0,
        charitableCash: 0,
        charitableNonCash: 0,
        casualtyLosses: 0,
        otherItemized: 0,
      },
    },
    credits: {
      childCareExpenses: 0,
      childCareQualifyingPersons: 0,
      americanOpportunityExpenses: 0,
      americanOpportunityStudents: 0,
      foreignTaxPaid: 0,
      retirementSaversContributions: 0,
      otherNonrefundableCredits: 0,
      otherRefundableCredits: 0,
    },
    payments: { estimatedTaxPaid: 0, priorYearTotalTax: 0, priorYearAGI: 0, priorYearTaxWasZero: false, excessSocialSecurityWithheld: 0 },
    amt: { isoBargainElement: 0, privateActivityBondInterest: 0, otherAmtAdjustments: 0 },
    claimedAsDependent: false,
    spouseHadNoGrossIncome: false,
    options: { includeSection1256In60_40: true },
  };
}
