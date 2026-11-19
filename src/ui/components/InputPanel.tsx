import { SUPPORTED_YEARS } from "../../engine";
import type { FilingStatus, TaxInput, TaxYear } from "../../engine";
import { useScenarios } from "../hooks/useScenarios";
import { FILING_STATUS_LABEL, money } from "../format";
import { CurrencyField, Section, Segmented, StepperField, SubHeading, Toggle } from "./fields";

type Update = (m: (d: TaxInput) => void) => void;

const STATUS_OPTIONS: { value: FilingStatus; label: string; title: string }[] = [
  { value: "single", label: "Single", title: FILING_STATUS_LABEL.single },
  { value: "mfj", label: "MFJ", title: FILING_STATUS_LABEL.mfj },
  { value: "mfs", label: "MFS", title: FILING_STATUS_LABEL.mfs },
  { value: "hoh", label: "HoH", title: FILING_STATUS_LABEL.hoh },
];

function sum(...xs: Array<number | undefined>): number {
  return xs.reduce<number>((a, b) => a + (b ?? 0), 0);
}

function summaryMoney(n: number): string | undefined {
  return n ? money(n) : undefined;
}

export function InputPanel({ onOpenImport }: { onOpenImport(): void }) {
  const { active, update } = useScenarios();
  const input = active.input;
  const married = input.filingStatus === "mfj" || input.filingStatus === "mfs";

  return (
    <div className="input-panel" aria-label="Tax inputs">
      <ProfileSection input={input} update={update} married={married} />
      <WagesSection input={input} update={update} />
      <InvestmentsSection input={input} update={update} onOpenImport={onOpenImport} />
      <OtherIncomeSection input={input} update={update} />
      <AdjustmentsSection input={input} update={update} />
      <DeductionsSection input={input} update={update} />
      <CreditsSection input={input} update={update} />
      <PaymentsSection input={input} update={update} />
      <AmtSection input={input} update={update} />
    </div>
  );
}

interface SectionArgs {
  input: TaxInput;
  update: Update;
}

function ProfileSection({ input, update, married }: SectionArgs & { married: boolean }) {
  const kids = input.dependents.qualifyingChildrenUnder17 + input.dependents.otherDependents;
  return (
    <Section
      title="Profile"
      summary={`${input.taxYear} · ${STATUS_OPTIONS.find((o) => o.value === input.filingStatus)?.label}${kids ? ` · ${kids} dep.` : ""}`}
      defaultOpen
    >
      <Segmented<TaxYear>
        label="Tax year"
        value={input.taxYear}
        options={SUPPORTED_YEARS.map((y) => ({ value: y, label: String(y) }))}
        onChange={(y) => update((d) => void (d.taxYear = y))}
        help="Brackets and limits switch with the year"
      />
      <Segmented<FilingStatus>
        label="Filing status"
        value={input.filingStatus}
        options={STATUS_OPTIONS}
        onChange={(s) => update((d) => void (d.filingStatus = s))}
        help={FILING_STATUS_LABEL[input.filingStatus]}
      />
      <div className="span-2 toggle-stack">
        <Toggle
          label="Age 65 or older"
          checked={input.taxpayer.age65OrOlder}
          onChange={(v) => update((d) => void (d.taxpayer.age65OrOlder = v))}
          help="Additional standard deduction; senior deduction (2025-2028)"
        />
        <Toggle
          label="Age 50 or older"
          checked={input.taxpayer.age50OrOlder ?? false}
          onChange={(v) => update((d) => void (d.taxpayer.age50OrOlder = v))}
          help="IRA catch-up contribution"
        />
        <Toggle
          label="Age 55 or older"
          checked={input.taxpayer.age55OrOlder ?? false}
          onChange={(v) => update((d) => void (d.taxpayer.age55OrOlder = v))}
          help="HSA catch-up contribution"
        />
        <Toggle
          label="Blind"
          checked={input.taxpayer.blind}
          onChange={(v) => update((d) => void (d.taxpayer.blind = v))}
          help="Additional standard deduction"
        />
        <Toggle
          label="Can be claimed as a dependent"
          checked={input.claimedAsDependent}
          onChange={(v) => update((d) => void (d.claimedAsDependent = v))}
          help="Limits the standard deduction"
        />
      </div>
      {married && input.spouse && (
        <div className="span-2 spouse-block">
          <SubHeading>Spouse</SubHeading>
          <div className="toggle-stack">
            <Toggle
              label="Spouse age 65 or older"
              checked={input.spouse.age65OrOlder}
              onChange={(v) => update((d) => void (d.spouse && (d.spouse.age65OrOlder = v)))}
              help="Additional standard deduction"
            />
            <Toggle
              label="Spouse age 50 or older"
              checked={input.spouse.age50OrOlder ?? false}
              onChange={(v) => update((d) => void (d.spouse && (d.spouse.age50OrOlder = v)))}
              help="IRA catch-up contribution"
            />
            <Toggle
              label="Spouse age 55 or older"
              checked={input.spouse.age55OrOlder ?? false}
              onChange={(v) => update((d) => void (d.spouse && (d.spouse.age55OrOlder = v)))}
              help="HSA catch-up contribution"
            />
            <Toggle
              label="Spouse blind"
              checked={input.spouse.blind}
              onChange={(v) => update((d) => void (d.spouse && (d.spouse.blind = v)))}
              help="Additional standard deduction"
            />
            {input.filingStatus === "mfs" && (
              <Toggle
                label="Spouse had no income and files no return"
                checked={input.spouseHadNoGrossIncome ?? false}
                onChange={(v) => update((d) => void (d.spouseHadNoGrossIncome = v))}
                help="Allows the spouse's 65+/blind additional standard deduction"
              />
            )}
          </div>
        </div>
      )}
      <SubHeading>Dependents</SubHeading>
      <StepperField
        label="Children under 17"
        value={input.dependents.qualifyingChildrenUnder17}
        onChange={(v) => update((d) => void (d.dependents.qualifyingChildrenUnder17 = v))}
        help="Child Tax Credit, Schedule 8812"
      />
      <StepperField
        label="Other dependents"
        value={input.dependents.otherDependents}
        onChange={(v) => update((d) => void (d.dependents.otherDependents = v))}
        help="Credit for other dependents ($500)"
      />
      <StepperField
        label="EITC qualifying children"
        value={input.dependents.eitcQualifyingChildren}
        onChange={(v) => update((d) => void (d.dependents.eitcQualifyingChildren = v))}
        help="Schedule EIC, capped at 3"
      />
    </Section>
  );
}

function WagesSection({ input, update }: SectionArgs) {
  const total = sum(input.w2.wages, input.spouseW2?.wages);
  return (
    <Section title="Wages" summary={summaryMoney(total)} defaultOpen>
      <CurrencyField
        label="Wages, tips, compensation"
        value={input.w2.wages}
        onChange={(v) => update((d) => void (d.w2.wages = v))}
        help="W-2 box 1"
      />
      <CurrencyField
        label="Federal tax withheld"
        value={input.w2.federalWithholding}
        onChange={(v) => update((d) => void (d.w2.federalWithholding = v))}
        help="W-2 box 2"
      />
      <CurrencyField
        label="Medicare wages"
        value={input.w2.medicareWages ?? 0}
        onChange={(v) => update((d) => void (d.w2.medicareWages = v))}
        help="W-2 box 5; blank uses box 1"
      />
      <CurrencyField
        label="Social Security wages"
        value={input.w2.socialSecurityWages ?? 0}
        onChange={(v) => update((d) => void (d.w2.socialSecurityWages = v))}
        help="W-2 box 3; used for Schedule SE and the wage base"
      />
      <CurrencyField
        label="Qualified tips"
        value={input.w2.qualifiedTips ?? 0}
        onChange={(v) => update((d) => void (d.w2.qualifiedTips = v))}
        help="Included in box 1; Schedule 1-A"
      />
      <CurrencyField
        label="Qualified overtime premium"
        value={input.w2.qualifiedOvertime ?? 0}
        onChange={(v) => update((d) => void (d.w2.qualifiedOvertime = v))}
        help="The half-time premium only; Schedule 1-A"
      />
      {input.spouseW2 && (
        <>
          <SubHeading>Spouse W-2</SubHeading>
          <CurrencyField
            label="Spouse wages"
            value={input.spouseW2.wages}
            onChange={(v) => update((d) => void (d.spouseW2 && (d.spouseW2.wages = v)))}
            help="Spouse W-2 box 1"
          />
          <CurrencyField
            label="Spouse tax withheld"
            value={input.spouseW2.federalWithholding}
            onChange={(v) => update((d) => void (d.spouseW2 && (d.spouseW2.federalWithholding = v)))}
            help="Spouse W-2 box 2"
          />
          <CurrencyField
            label="Spouse Medicare wages"
            value={input.spouseW2.medicareWages ?? 0}
            onChange={(v) => update((d) => void (d.spouseW2 && (d.spouseW2.medicareWages = v)))}
            help="Spouse W-2 box 5"
          />
          <CurrencyField
            label="Spouse Social Security wages"
            value={input.spouseW2.socialSecurityWages ?? 0}
            onChange={(v) => update((d) => void (d.spouseW2 && (d.spouseW2.socialSecurityWages = v)))}
            help="W-2 box 3; used for Schedule SE and the wage base"
          />
          <CurrencyField
            label="Spouse qualified tips"
            value={input.spouseW2.qualifiedTips ?? 0}
            onChange={(v) => update((d) => void (d.spouseW2 && (d.spouseW2.qualifiedTips = v)))}
            help="Included in spouse box 1"
          />
          <CurrencyField
            label="Spouse qualified overtime"
            value={input.spouseW2.qualifiedOvertime ?? 0}
            onChange={(v) => update((d) => void (d.spouseW2 && (d.spouseW2.qualifiedOvertime = v)))}
            help="Premium portion only"
          />
        </>
      )}
    </Section>
  );
}

function InvestmentsSection({ input, update, onOpenImport }: SectionArgs & { onOpenImport(): void }) {
  const inv = input.investments;
  const gains = inv.netShortTermGain + inv.netLongTermGain + inv.section1256Gain;
  const total = inv.taxableInterest + inv.ordinaryDividends + gains;
  return (
    <Section title="Investments" summary={summaryMoney(total)} defaultOpen>
      <div className="span-2 import-callout">
        <div>
          <strong>Have a 1099-B?</strong>
          <span>Paste or drop your broker CSV to fill capital gains.</span>
        </div>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onOpenImport}>
          Import 1099-B
        </button>
      </div>
      <CurrencyField
        label="Taxable interest"
        value={inv.taxableInterest}
        onChange={(v) => update((d) => void (d.investments.taxableInterest = v))}
        help="1099-INT box 1; 1040 line 2b"
      />
      <CurrencyField
        label="Tax-exempt interest"
        value={inv.taxExemptInterest}
        onChange={(v) => update((d) => void (d.investments.taxExemptInterest = v))}
        help="1099-INT box 8; 1040 line 2a"
      />
      <CurrencyField
        label="Ordinary dividends"
        value={inv.ordinaryDividends}
        onChange={(v) => update((d) => void (d.investments.ordinaryDividends = v))}
        help="1099-DIV box 1a; 1040 line 3b"
      />
      <CurrencyField
        label="Qualified dividends"
        value={inv.qualifiedDividends}
        onChange={(v) => update((d) => void (d.investments.qualifiedDividends = v))}
        help="1099-DIV box 1b; part of box 1a"
      />
      <CurrencyField
        label="Net short-term gain / loss"
        value={inv.netShortTermGain}
        allowNegative
        onChange={(v) => update((d) => void (d.investments.netShortTermGain = v))}
        help="Schedule D line 7; negative for a loss"
      />
      <CurrencyField
        label="Net long-term gain / loss"
        value={inv.netLongTermGain}
        allowNegative
        onChange={(v) => update((d) => void (d.investments.netLongTermGain = v))}
        help="Schedule D line 15; negative for a loss"
      />
      <CurrencyField
        label="Section 1256 net gain / loss"
        value={inv.section1256Gain}
        allowNegative
        onChange={(v) => update((d) => void (d.investments.section1256Gain = v))}
        help="Form 6781; split 60% long / 40% short"
      />
      <span className="span-1 grid-spacer" aria-hidden="true" />
      <CurrencyField
        label="Short-term loss carryover"
        value={inv.shortTermLossCarryover}
        onChange={(v) => update((d) => void (d.investments.shortTermLossCarryover = v))}
        help="Prior-year worksheet; enter as positive"
      />
      <CurrencyField
        label="Long-term loss carryover"
        value={inv.longTermLossCarryover}
        onChange={(v) => update((d) => void (d.investments.longTermLossCarryover = v))}
        help="Prior-year worksheet; enter as positive"
      />
    </Section>
  );
}

function OtherIncomeSection({ input, update }: SectionArgs) {
  const o = input.other;
  const total = sum(
    o.selfEmploymentNetProfit,
    o.iraDistributions,
    o.pensions,
    o.socialSecurityBenefits,
    o.unemploymentCompensation,
    o.scheduleEIncome,
    o.otherIncome,
    o.taxableStateRefund,
  );
  return (
    <Section title="Business & other income" summary={summaryMoney(total)}>
      <CurrencyField
        label="Self-employment net profit"
        value={o.selfEmploymentNetProfit}
        allowNegative
        onChange={(v) => update((d) => void (d.other.selfEmploymentNetProfit = v))}
        help="Schedule C line 31; drives SE tax and QBI"
      />
      <div className="field field--toggle-cell">
        <Toggle
          label="Specified service business"
          checked={o.selfEmploymentIsSSTB}
          onChange={(v) => update((d) => void (d.other.selfEmploymentIsSSTB = v))}
          help="SSTB; limits QBI above threshold"
        />
      </div>
      <CurrencyField
        label="W-2 wages paid by the business"
        value={o.qbiW2Wages ?? 0}
        onChange={(v) => update((d) => void (d.other.qbiW2Wages = v))}
        help="Sec. 199A wage limit; 0 for a solo business with no employees"
      />
      <CurrencyField
        label="Qualified property basis (UBIA)"
        value={o.qbiUBIA ?? 0}
        onChange={(v) => update((d) => void (d.other.qbiUBIA = v))}
        help="Unadjusted basis of depreciable business property"
      />
      <CurrencyField
        label="IRA distributions (taxable)"
        value={o.iraDistributions}
        onChange={(v) => update((d) => void (d.other.iraDistributions = v))}
        help="1099-R box 2a; 1040 line 4b. Roth conversions go here"
      />
      <CurrencyField
        label="Pensions and annuities"
        value={o.pensions}
        onChange={(v) => update((d) => void (d.other.pensions = v))}
        help="1099-R box 2a; 1040 line 5b"
      />
      <CurrencyField
        label="Social Security benefits"
        value={o.socialSecurityBenefits}
        onChange={(v) => update((d) => void (d.other.socialSecurityBenefits = v))}
        help="SSA-1099 box 5 (gross); taxable part computed"
      />
      <CurrencyField
        label="Unemployment compensation"
        value={o.unemploymentCompensation}
        onChange={(v) => update((d) => void (d.other.unemploymentCompensation = v))}
        help="1099-G box 1; Schedule 1 line 7"
      />
      <CurrencyField
        label="Rental, royalty, K-1 income"
        value={o.scheduleEIncome}
        allowNegative
        onChange={(v) => update((d) => void (d.other.scheduleEIncome = v))}
        help="Schedule E line 26 / 41"
      />
      <CurrencyField
        label="Other income"
        value={o.otherIncome}
        onChange={(v) => update((d) => void (d.other.otherIncome = v))}
        help="Schedule 1 line 8z; gambling, prizes"
      />
      <CurrencyField
        label="Taxable state refund"
        value={o.taxableStateRefund}
        onChange={(v) => update((d) => void (d.other.taxableStateRefund = v))}
        help="1099-G box 2; only if you itemized last year"
      />
    </Section>
  );
}

function AdjustmentsSection({ input, update }: SectionArgs) {
  const a = input.adjustments;
  const total = sum(
    a.hsaContribution,
    a.traditionalIraContribution,
    a.spouseTraditionalIraContribution,
    a.studentLoanInterest,
    a.selfEmployedRetirement,
    a.selfEmployedHealthInsurance,
    a.educatorExpenses,
    a.carLoanInterest,
    a.otherAdjustments,
  );
  return (
    <Section title="Adjustments" summary={summaryMoney(total)}>
      <CurrencyField
        label="HSA contributions"
        value={a.hsaContribution}
        onChange={(v) => update((d) => void (d.adjustments.hsaContribution = v))}
        help="Form 8889; outside payroll only"
      />
      <Segmented<"self" | "family">
        label="HSA coverage"
        size="sm"
        value={a.hsaCoverage ?? "family"}
        options={[
          { value: "self", label: "Self-only" },
          { value: "family", label: "Family" },
        ]}
        onChange={(v) => update((d) => void (d.adjustments.hsaCoverage = v))}
        help="Sets the HSA contribution limit"
      />
      <CurrencyField
        label="Traditional IRA contributions"
        value={a.traditionalIraContribution}
        onChange={(v) => update((d) => void (d.adjustments.traditionalIraContribution = v))}
        help="Schedule 1 line 20; deductibility computed"
      />
      {input.filingStatus === "mfj" && (
        <CurrencyField
          label="Spouse traditional IRA contribution"
          value={a.spouseTraditionalIraContribution ?? 0}
          onChange={(v) => update((d) => void (d.adjustments.spouseTraditionalIraContribution = v))}
          help="Schedule 1 line 20; spouse's own limit"
        />
      )}
      <div className="span-2 toggle-stack">
        <Toggle
          label="Covered by a workplace plan"
          checked={a.coveredByWorkplacePlan}
          onChange={(v) => update((d) => void (d.adjustments.coveredByWorkplacePlan = v))}
          help="W-2 box 13 retirement plan checked"
        />
        {input.filingStatus === "mfj" && (
          <Toggle
            label="Spouse covered by a workplace plan"
            checked={a.spouseCoveredByWorkplacePlan}
            onChange={(v) => update((d) => void (d.adjustments.spouseCoveredByWorkplacePlan = v))}
            help="Spouse W-2 box 13"
          />
        )}
      </div>
      <CurrencyField
        label="Student loan interest"
        value={a.studentLoanInterest}
        onChange={(v) => update((d) => void (d.adjustments.studentLoanInterest = v))}
        help="1098-E box 1; capped at $2,500"
      />
      <CurrencyField
        label="Educator expenses"
        value={a.educatorExpenses}
        onChange={(v) => update((d) => void (d.adjustments.educatorExpenses = v))}
        help="Schedule 1 line 11"
      />
      <CurrencyField
        label="SEP / SIMPLE / solo 401(k)"
        value={a.selfEmployedRetirement}
        onChange={(v) => update((d) => void (d.adjustments.selfEmployedRetirement = v))}
        help="Schedule 1 line 16"
      />
      <CurrencyField
        label="Self-employed health insurance"
        value={a.selfEmployedHealthInsurance}
        onChange={(v) => update((d) => void (d.adjustments.selfEmployedHealthInsurance = v))}
        help="Schedule 1 line 17"
      />
      <CurrencyField
        label="Car loan interest"
        value={a.carLoanInterest}
        onChange={(v) => update((d) => void (d.adjustments.carLoanInterest = v))}
        help="New US-assembled vehicle; Schedule 1-A"
      />
      <CurrencyField
        label="Other adjustments"
        value={a.otherAdjustments}
        onChange={(v) => update((d) => void (d.adjustments.otherAdjustments = v))}
        help="Schedule 1 line 24z"
      />
    </Section>
  );
}

function DeductionsSection({ input, update }: SectionArgs) {
  const it = input.deductions.itemized;
  const total = sum(
    it.medicalExpenses,
    it.stateLocalIncomeOrSalesTax,
    it.realEstateTaxes,
    it.personalPropertyTaxes,
    it.mortgageInterest,
    it.charitableCash,
    it.charitableNonCash,
    it.casualtyLosses,
    it.otherItemized,
  );
  const methodLabel = { auto: "Best of both", standard: "Standard", itemized: "Itemized" }[input.deductions.method];
  return (
    <Section title="Deductions" summary={methodLabel}>
      <div className="span-2">
        <Segmented<"auto" | "standard" | "itemized">
          label="Method"
          value={input.deductions.method}
          options={[
            { value: "auto", label: "Auto" },
            { value: "standard", label: "Standard" },
            { value: "itemized", label: "Itemize" },
          ]}
          onChange={(m) => update((d) => void (d.deductions.method = m))}
          help={
            input.deductions.method === "auto"
              ? `Uses the larger of standard or itemized${total ? ` (itemized entered: ${money(total)})` : ""}`
              : input.deductions.method === "standard"
                ? "Ignores the itemized amounts below"
                : "Schedule A even if smaller than standard"
          }
        />
      </div>
      <SubHeading>Schedule A</SubHeading>
      <CurrencyField
        label="Medical and dental"
        value={it.medicalExpenses}
        onChange={(v) => update((d) => void (d.deductions.itemized.medicalExpenses = v))}
        help="Line 1; only above 7.5% of AGI counts"
      />
      <CurrencyField
        label="State and local income tax"
        value={it.stateLocalIncomeOrSalesTax}
        onChange={(v) => update((d) => void (d.deductions.itemized.stateLocalIncomeOrSalesTax = v))}
        help="Line 5a; or sales tax. SALT cap applies"
      />
      <CurrencyField
        label="Real estate taxes"
        value={it.realEstateTaxes}
        onChange={(v) => update((d) => void (d.deductions.itemized.realEstateTaxes = v))}
        help="Line 5b"
      />
      <CurrencyField
        label="Personal property taxes"
        value={it.personalPropertyTaxes}
        onChange={(v) => update((d) => void (d.deductions.itemized.personalPropertyTaxes = v))}
        help="Line 5c; vehicle registration etc."
      />
      <CurrencyField
        label="Mortgage interest"
        value={it.mortgageInterest}
        onChange={(v) => update((d) => void (d.deductions.itemized.mortgageInterest = v))}
        help="1098 box 1; line 8a"
      />
      <CurrencyField
        label="Mortgage principal"
        value={it.mortgagePrincipal}
        onChange={(v) => update((d) => void (d.deductions.itemized.mortgagePrincipal = v))}
        help="1098 box 2; for the $750k limit. 0 = under"
      />
      <CurrencyField
        label="Charitable, cash"
        value={it.charitableCash}
        onChange={(v) => update((d) => void (d.deductions.itemized.charitableCash = v))}
        help="Line 11; 60% of AGI limit"
      />
      <CurrencyField
        label="Charitable, non-cash"
        value={it.charitableNonCash}
        onChange={(v) => update((d) => void (d.deductions.itemized.charitableNonCash = v))}
        help="Line 12; Form 8283 over $500"
      />
      <CurrencyField
        label="Casualty losses"
        value={it.casualtyLosses}
        onChange={(v) => update((d) => void (d.deductions.itemized.casualtyLosses = v))}
        help="Form 4684; net of floors, disaster areas"
      />
      <CurrencyField
        label="Other itemized"
        value={it.otherItemized}
        onChange={(v) => update((d) => void (d.deductions.itemized.otherItemized = v))}
        help="Line 16"
      />
    </Section>
  );
}

function CreditsSection({ input, update }: SectionArgs) {
  const c = input.credits;
  const any =
    c.childCareExpenses + c.americanOpportunityExpenses + c.foreignTaxPaid + c.retirementSaversContributions +
    c.otherNonrefundableCredits + c.otherRefundableCredits;
  return (
    <Section title="Credits" summary={any ? "Entered" : undefined}>
      <CurrencyField
        label="Child and dependent care"
        value={c.childCareExpenses}
        onChange={(v) => update((d) => void (d.credits.childCareExpenses = v))}
        help="Form 2441 expenses paid"
      />
      <StepperField
        label="Care qualifying persons"
        value={c.childCareQualifyingPersons}
        max={10}
        onChange={(v) => update((d) => void (d.credits.childCareQualifyingPersons = v))}
        help="Form 2441; capped at 2"
      />
      <CurrencyField
        label="College expenses (AOTC)"
        value={c.americanOpportunityExpenses}
        onChange={(v) => update((d) => void (d.credits.americanOpportunityExpenses = v))}
        help="1098-T; Form 8863"
      />
      <StepperField
        label="AOTC students"
        value={c.americanOpportunityStudents}
        max={10}
        onChange={(v) => update((d) => void (d.credits.americanOpportunityStudents = v))}
        help="First four years of college"
      />
      <CurrencyField
        label="Foreign tax paid"
        value={c.foreignTaxPaid}
        onChange={(v) => update((d) => void (d.credits.foreignTaxPaid = v))}
        help="1099-DIV box 7; Form 1116"
      />
      <CurrencyField
        label="Saver's credit contributions"
        value={c.retirementSaversContributions}
        onChange={(v) => update((d) => void (d.credits.retirementSaversContributions = v))}
        help="Form 8880; IRA and 401(k) deferrals"
      />
      <CurrencyField
        label="Other nonrefundable credits"
        value={c.otherNonrefundableCredits}
        onChange={(v) => update((d) => void (d.credits.otherNonrefundableCredits = v))}
        help="Energy, adoption; Schedule 3 part I"
      />
      <CurrencyField
        label="Other refundable credits"
        value={c.otherRefundableCredits}
        onChange={(v) => update((d) => void (d.credits.otherRefundableCredits = v))}
        help="Schedule 3 part II"
      />
    </Section>
  );
}

function PaymentsSection({ input, update }: SectionArgs) {
  const p = input.payments;
  return (
    <Section title="Payments & prior year" summary={summaryMoney(p.estimatedTaxPaid)}>
      <CurrencyField
        label="Estimated tax paid"
        value={p.estimatedTaxPaid}
        onChange={(v) => update((d) => void (d.payments.estimatedTaxPaid = v))}
        help="1040-ES payments; 1040 line 26"
      />
      <CurrencyField
        label="Excess Social Security withheld"
        value={p.excessSocialSecurityWithheld}
        onChange={(v) => update((d) => void (d.payments.excessSocialSecurityWithheld = v))}
        help="Multiple employers; Schedule 3 line 11"
      />
      <CurrencyField
        label="Prior-year total tax"
        value={p.priorYearTotalTax}
        onChange={(v) => update((d) => void (d.payments.priorYearTotalTax = v))}
        help="Last year's 1040 line 24; safe harbor"
      />
      <CurrencyField
        label="Prior-year AGI"
        value={p.priorYearAGI}
        onChange={(v) => update((d) => void (d.payments.priorYearAGI = v))}
        help="Last year's 1040 line 11; 110% test"
      />
      <div className="span-2">
        <Toggle
          label="Last year's total tax was $0"
          checked={p.priorYearTaxWasZero ?? false}
          onChange={(v) => update((d) => void (d.payments.priorYearTaxWasZero = v))}
          help="No estimated-tax penalty applies (sec. 6654(e)(2))"
        />
      </div>
    </Section>
  );
}

function AmtSection({ input, update }: SectionArgs) {
  const a = input.amt;
  return (
    <Section title="AMT" summary={summaryMoney(a.isoBargainElement + a.privateActivityBondInterest + a.otherAmtAdjustments)}>
      <CurrencyField
        label="ISO bargain element"
        value={a.isoBargainElement}
        onChange={(v) => update((d) => void (d.amt.isoBargainElement = v))}
        help="Form 3921; exercised and held at year end"
      />
      <CurrencyField
        label="Private activity bond interest"
        value={a.privateActivityBondInterest}
        onChange={(v) => update((d) => void (d.amt.privateActivityBondInterest = v))}
        help="1099-INT box 9"
      />
      <CurrencyField
        label="Other AMT adjustments"
        value={a.otherAmtAdjustments}
        allowNegative
        onChange={(v) => update((d) => void (d.amt.otherAmtAdjustments = v))}
        help="Form 6251 other lines"
      />
    </Section>
  );
}
