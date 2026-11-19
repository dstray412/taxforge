import { defaultInput } from "../src/engine/defaults";
import type { TaxInput, TaxYear } from "../src/engine/types";

export type DeepPartial<T> = { [K in keyof T]?: NonNullable<T[K]> extends object ? DeepPartial<NonNullable<T[K]>> : T[K] };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function merge(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (isObj(v) && isObj(target[k])) merge(target[k] as Record<string, unknown>, v);
    else target[k] = v;
  }
}

/** defaultInput(year) deep-merged with `patch`. */
export function make(year: TaxYear, patch: DeepPartial<TaxInput> = {}): TaxInput {
  const base = defaultInput(year);
  merge(base as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  return base;
}
