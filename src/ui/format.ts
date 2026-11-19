/**
 * Pure formatting / parsing helpers. No React, no DOM.
 */

const usd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const num0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** $95,000 — negatives as -$1,200. */
export function money(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const r = Math.round(n);
  return r < 0 ? `-${usd0.format(-r)}` : usd0.format(r === 0 ? 0 : r);
}

/** +$1,200 / -$1,200 / $0 */
export function moneySigned(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const r = Math.round(n);
  if (r === 0) return "$0";
  return r > 0 ? `+${usd0.format(r)}` : `-${usd0.format(-r)}`;
}

/** Compact axis labels: $0, $50K, $1.2M. */
export function moneyCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sign}$${trimZeros((a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1))}M`;
  if (a >= 1_000) return `${sign}$${trimZeros((a / 1_000).toFixed(a >= 100_000 ? 0 : 1))}K`;
  return `${sign}$${Math.round(a)}`;
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Plain thousands-separated number for input display: 95,000 */
export function plainNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return num0.format(n);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

/** 0.2234 -> "22.3%" */
export function pct(rate: number, digits = 1): string {
  if (!Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(digits)}%`;
}

/** Bracket rate: 0.22 -> "22%", 0.325 -> "32.5%" */
export function ratePct(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return `${trimZeros((rate * 100).toFixed(2))}%`;
}

/** Signed percentage-point delta: +1.2 pts */
export function ptsSigned(deltaRate: number): string {
  if (!Number.isFinite(deltaRate)) return "—";
  const v = deltaRate * 100;
  if (Math.abs(v) < 0.05) return "0.0 pts";
  return `${v > 0 ? "+" : "-"}${Math.abs(v).toFixed(1)} pts`;
}

/**
 * Parse loose currency text: "95,000", "$95k", "1.2m", "(1,500)", "-2.5K", " 1 200 ".
 * Returns null when the text is not a number. Empty string parses as 0.
 */
export function parseCurrency(text: string): number | null {
  let s = text.trim().toLowerCase();
  if (s === "") return 0;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s$,_]/g, "").replace(/usd$/, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  const m = /^(\d*\.?\d+|\d+\.)(k|m|mm|b)?$/.exec(s);
  if (!m) return null;
  let v = parseFloat(m[1]);
  const suf = m[2];
  if (suf === "k") v *= 1_000;
  else if (suf === "m" || suf === "mm") v *= 1_000_000;
  else if (suf === "b") v *= 1_000_000_000;
  v = Math.round(v * 100) / 100;
  return negative ? -v : v;
}

/** "2026-04-15" -> "Apr 15, 2026" (parsed as a calendar date, no timezone shift). */
export function isoDateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function isoToLocalDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export const FILING_STATUS_LABEL: Record<string, string> = {
  single: "Single",
  mfj: "Married filing jointly",
  mfs: "Married filing separately",
  hoh: "Head of household",
};

export const FILING_STATUS_SHORT: Record<string, string> = {
  single: "Single",
  mfj: "MFJ",
  mfs: "MFS",
  hoh: "HoH",
};
