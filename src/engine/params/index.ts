import type { TaxYear, TaxYearParams } from "../types";
import { PARAMS_2025 } from "./2025";
import { PARAMS_2026 } from "./2026";

/** Tax years the engine has parameters for, oldest first. */
export const SUPPORTED_YEARS: TaxYear[] = [2025, 2026];

const BY_YEAR: Record<TaxYear, TaxYearParams> = { 2025: PARAMS_2025, 2026: PARAMS_2026 };

/**
 * Returns the statutory / inflation-adjusted parameters for a tax year.
 * @throws Error when the year is not in {@link SUPPORTED_YEARS}.
 */
export function getParams(year: TaxYear): TaxYearParams {
  const params = BY_YEAR[year];
  if (!params) throw new Error(`Unsupported tax year: ${String(year)}`);
  return params;
}
