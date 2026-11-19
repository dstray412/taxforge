import { defaultInput, SUPPORTED_YEARS } from "../../engine";
import type { TaxInput, TaxYear } from "../../engine";

export interface Scenario {
  id: string;
  name: string;
  input: TaxInput;
}

export interface ScenarioState {
  scenarios: Scenario[];
  activeId: string;
}

export const STORAGE_KEY = "taxforge.scenarios.v1";

export function newId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function clone<T>(v: T): T {
  return typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge `raw` onto `base`, keeping only keys whose types match the base (plus optional extras). */
function mergeInto(base: unknown, raw: unknown): unknown {
  if (isObj(base)) {
    if (!isObj(raw)) return base;
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(raw)) {
      if (k in base) out[k] = mergeInto(base[k], v);
      else if (v !== undefined) out[k] = v; // optional fields (spouse, spouseW2, options, w2 extras)
    }
    return out;
  }
  if (typeof base === "number") return typeof raw === "number" && Number.isFinite(raw) ? raw : base;
  if (typeof base === "boolean") return typeof raw === "boolean" ? raw : base;
  if (typeof base === "string") return typeof raw === "string" ? raw : base;
  return raw === undefined ? base : raw;
}

export function isSupportedYear(y: unknown): y is TaxYear {
  return typeof y === "number" && (SUPPORTED_YEARS as number[]).includes(y);
}

/** Bring any persisted / imported object up to the current TaxInput shape. */
export function normalizeInput(raw: unknown): TaxInput {
  const year: TaxYear = isObj(raw) && isSupportedYear(raw.taxYear) ? raw.taxYear : 2026;
  const merged = mergeInto(defaultInput(year), raw) as TaxInput;
  merged.taxYear = year;
  // Enum-valued optional fields: drop anything unrecognised so the engine default applies.
  const cov = merged.adjustments.hsaCoverage as unknown;
  if (cov !== undefined && cov !== "self" && cov !== "family") delete merged.adjustments.hsaCoverage;
  return ensureSpouseShape(merged);
}

export const emptyFlags = () => ({ age65OrOlder: false, blind: false, age50OrOlder: false, age55OrOlder: false });
export const emptyW2 = () => ({
  wages: 0,
  federalWithholding: 0,
  medicareWages: 0,
  socialSecurityWages: 0,
  qualifiedTips: 0,
  qualifiedOvertime: 0,
});

/** Spouse data exists only for married statuses; spouse W-2 only for MFJ. */
export function ensureSpouseShape(input: TaxInput): TaxInput {
  const married = input.filingStatus === "mfj" || input.filingStatus === "mfs";
  if (married) {
    input.spouse = input.spouse ?? emptyFlags();
  } else {
    delete input.spouse;
  }
  if (input.filingStatus === "mfj") {
    input.spouseW2 = input.spouseW2 ?? emptyW2();
  } else {
    delete input.spouseW2;
  }
  return input;
}

/** First-run example: single, $95k wages, a little LTCG. */
export function sampleInput(): TaxInput {
  const d = defaultInput(2026);
  d.filingStatus = "single";
  d.w2.wages = 95_000;
  d.w2.federalWithholding = 11_400;
  d.investments.taxableInterest = 420;
  d.investments.ordinaryDividends = 1_850;
  d.investments.qualifiedDividends = 1_500;
  d.investments.netLongTermGain = 6_500;
  d.adjustments.hsaContribution = 2_000;
  d.payments.priorYearTotalTax = 10_900;
  d.payments.priorYearAGI = 91_000;
  return ensureSpouseShape(d);
}

export function initialState(): ScenarioState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isObj(parsed) && Array.isArray(parsed.scenarios) && parsed.scenarios.length > 0) {
        const scenarios: Scenario[] = parsed.scenarios.filter(isObj).map((s, i) => ({
          id: typeof s.id === "string" ? s.id : newId(),
          name: typeof s.name === "string" && s.name.trim() ? s.name : `Scenario ${i + 1}`,
          input: normalizeInput(s.input),
        }));
        if (scenarios.length > 0) {
          const activeId =
            typeof parsed.activeId === "string" && scenarios.some((s) => s.id === parsed.activeId)
              ? parsed.activeId
              : scenarios[0].id;
          return { scenarios, activeId };
        }
      }
    }
  } catch {
    /* corrupted or blocked storage: fall through to the sample */
  }
  const first: Scenario = { id: newId(), name: "2026 baseline", input: sampleInput() };
  return { scenarios: [first], activeId: first.id };
}

export function persist(state: ScenarioState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full / private mode: in-memory only */
  }
}

export function uniqueName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}
