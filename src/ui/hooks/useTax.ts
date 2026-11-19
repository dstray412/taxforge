import { useEffect, useMemo, useState } from "react";
import { computeTax } from "../../engine";
import type { TaxInput, TaxResult } from "../../engine";

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export interface TaxComputation {
  result: TaxResult | null;
  error: string | null;
  /** True while the latest input has not been recomputed yet. */
  pending: boolean;
}

export function safeCompute(input: TaxInput): { result: TaxResult | null; error: string | null } {
  try {
    return { result: computeTax(input), error: null };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Debounced live computation that keeps the last good result while recomputing or on error. */
export function useTaxResult(input: TaxInput, ms = 100): TaxComputation {
  const debounced = useDebounced(input, ms);
  const computed = useMemo(() => safeCompute(debounced), [debounced]);
  const [lastGood, setLastGood] = useState<TaxResult | null>(computed.result);
  useEffect(() => {
    if (computed.result) setLastGood(computed.result);
  }, [computed.result]);
  return {
    result: computed.result ?? lastGood,
    error: computed.error,
    pending: debounced !== input,
  };
}
