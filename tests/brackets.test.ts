import { describe, expect, it } from "vitest";
import { computeTax } from "../src/engine";
import { getParams } from "../src/engine/params";
import { bracketRateFor, taxFromBrackets, taxFromTable } from "../src/engine/compute";
import type { Bracket } from "../src/engine/types";
import { make } from "./helpers";

describe("bracket schedule (exact Tax Computation Worksheet math)", () => {
  // Each expected value is summed bracket by bracket by hand from the published schedule.
  const cases: Array<[2025 | 2026, "single" | "mfj" | "mfs" | "hoh", number, number]> = [
    // 1,192.50 + 0.12×36,550 + 0.22×1,525
    [2025, "single", 50_000, 5_914],
    // 2,385 + 0.12×73,100 + 0.22×3,050
    [2025, "mfj", 100_000, 11_828],
    // through 35% (375,800) = 101,077.25, + 0.37×24,200
    [2025, "mfs", 400_000, 110_031.25],
    // 1,700 + 0.12×47,850 + 0.22×15,150
    [2025, "hoh", 80_000, 10_775],
    // 1,240 + 0.12×37,600
    [2026, "single", 50_000, 5_752],
    // 2,480 + 9,120 + 0.22×110,600 + 0.24×38,600
    [2026, "mfj", 250_000, 45_196],
    // through 35% (384,350) = 103,291.75, + 0.37×615,650
    [2026, "mfs", 1_000_000, 331_082.25],
    // 1,770 + 0.12×49,750 + 0.22×38,250 + 0.24×14,300
    [2026, "hoh", 120_000, 19_587],
  ];
  for (const [year, fs, ti, expected] of cases) {
    it(`${year} ${fs} taxable ${ti} → ${expected}`, () => {
      expect(taxFromBrackets(ti, getParams(year).brackets[fs])).toBeCloseTo(expected, 2);
    });
  }

  it("every status/year has 7 ascending brackets ending at Infinity", () => {
    for (const year of [2025, 2026] as const) {
      for (const fs of ["single", "mfj", "mfs", "hoh"] as const) {
        const b = getParams(year).brackets[fs];
        expect(b.map((x) => x.rate)).toEqual([0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]);
        for (let i = 1; i < b.length; i++) expect(b[i]!.upTo).toBeGreaterThan(b[i - 1]!.upTo);
        expect(b[6]!.upTo).toBe(Infinity);
      }
    }
  });

  it("bracketRateFor picks the bracket of the last dollar", () => {
    const b = getParams(2025).brackets.single;
    expect(bracketRateFor(0, b)).toBe(0);
    expect(bracketRateFor(11_925, b)).toBe(0.1);
    expect(bracketRateFor(11_926, b)).toBe(0.12);
    expect(bracketRateFor(1_000_000, b)).toBe(0.37);
  });
});

describe("Tax Table (taxable income under $100,000)", () => {
  it("matches the published 2024 IRS Tax Table row for single $50,000-$50,050 ($6,059)", () => {
    const b2024: Bracket[] = [
      { rate: 0.1, upTo: 11_600 },
      { rate: 0.12, upTo: 47_150 },
      { rate: 0.22, upTo: 100_525 },
      { rate: 0.24, upTo: 191_950 },
      { rate: 0.32, upTo: 243_725 },
      { rate: 0.35, upTo: 609_350 },
      { rate: 0.37, upTo: Infinity },
    ];
    expect(taxFromTable(50_000, b2024)).toBe(6_059);
    expect(taxFromTable(50_049, b2024)).toBe(6_059);
  });

  it("small rows: 0-5 → 0, 5-15 → 1, 15-25 → 2, 25-50 → 4", () => {
    const b = getParams(2025).brackets.single;
    expect(taxFromTable(4, b)).toBe(0);
    expect(taxFromTable(10, b)).toBe(1);
    expect(taxFromTable(20, b)).toBe(2);
    expect(taxFromTable(30, b)).toBe(4);
  });

  it("2025 single taxable $50,000 via computeTax uses the $50 row midpoint (50,025) → $5,920", () => {
    // wages 65,750 − standard deduction 15,750 = 50,000; schedule tax at 50,025 = 5,919.50 → 5,920.
    const r = computeTax(make(2025, { w2: { wages: 65_750 } }));
    expect(r.taxableIncome).toBe(50_000);
    expect(r.regularTax).toBe(5_920);
    expect(r.topBracket).toBe(0.22);
  });

  it("at or above $100,000 uses the exact schedule", () => {
    // 2026 MFJ TI 250,000 → 45,196 exactly (wages 282,200 − 32,200).
    const r = computeTax(make(2026, { filingStatus: "mfj", w2: { wages: 282_200 } }));
    expect(r.taxableIncome).toBe(250_000);
    expect(r.regularTax).toBe(45_196);
  });
});
