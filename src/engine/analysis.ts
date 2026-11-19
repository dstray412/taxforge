/**
 * Scenario sweeps for charts: recompute the full return across a range of one income type.
 */
import type { SweepPoint, TaxInput } from "./types";
import { computeTax } from "./compute";

/** Upper bound on points per sweep so a bad step can't freeze the UI. */
const MAX_POINTS = 2_000;

function* range(from: number, to: number, step: number): Generator<number> {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return;
  if (!(step > 0) || to < from) {
    yield from;
    return;
  }
  const n = Math.min(MAX_POINTS, Math.floor((to - from) / step + 1e-9) + 1);
  for (let i = 0; i < n; i++) yield from + i * step;
}

/**
 * Vary W-2 wages from `from` to `to` (inclusive) by `step`, holding everything else in `base`
 * fixed. Medicare and Social Security wages, if explicitly set, move with wages. `marginalRate` is the engine's
 * finite-difference marginal ordinary rate at each point.
 */
export function sweepOrdinaryIncome(base: TaxInput, from: number, to: number, step: number): SweepPoint[] {
  const out: SweepPoint[] = [];
  const mw = base.w2?.medicareWages ?? 0;
  const sw = base.w2?.socialSecurityWages ?? 0;
  for (const income of range(from, to, step)) {
    const delta = income - (base.w2?.wages ?? 0);
    const w2 = {
      ...base.w2,
      wages: income,
      medicareWages: mw > 0 ? Math.max(0, mw + delta) : mw,
      socialSecurityWages: sw > 0 ? Math.max(0, sw + delta) : sw,
    };
    const r = computeTax({ ...base, w2 });
    out.push({ income, totalTax: r.totalTax, marginalRate: r.marginalRateOrdinary, effectiveRate: r.effectiveRateOnAGI });
  }
  return out;
}

/**
 * Vary net long-term capital gain from `from` to `to` by `step`. `marginalRate` is the engine's
 * finite-difference marginal LTCG rate (includes NIIT and phase-out effects).
 */
export function sweepLongTermGains(base: TaxInput, from: number, to: number, step: number): SweepPoint[] {
  const out: SweepPoint[] = [];
  for (const income of range(from, to, step)) {
    const r = computeTax({ ...base, investments: { ...base.investments, netLongTermGain: income } });
    out.push({ income, totalTax: r.totalTax, marginalRate: r.marginalRateLTCG, effectiveRate: r.effectiveRateOnAGI });
  }
  return out;
}
