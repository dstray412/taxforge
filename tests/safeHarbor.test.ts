import { describe, expect, it } from "vitest";
import { computeTax } from "../src/engine";
import { make } from "./helpers";

// 2025 single wages 100,000 → TI 84,250 → table tax (mid 84,275) 13,454.50 → 13,455; 90% = 12,109.50
const base = (payments: object, withholding = 5_000, options = {}) =>
  computeTax(make(2025, { w2: { wages: 100_000, federalWithholding: withholding }, payments, options }));

describe("Safe harbor (Form 2210)", () => {
  it("90% of current year when smaller than prior-year", () => {
    const r = base({ priorYearTotalTax: 20_000, priorYearAGI: 100_000 });
    expect(r.totalTax).toBe(13_455);
    expect(r.safeHarbor.basis).toBe("90pct_current");
    expect(r.safeHarbor.requiredAnnualPayment).toBe(12_110);
    expect(r.safeHarbor.shortfall).toBe(7_110);
    expect(r.safeHarbor.suggestedQuarterly).toBe(1_777);
    expect(r.safeHarbor.meetsSafeHarbor).toBe(false);
  });
  it("100% of prior year", () => {
    const r = base({ priorYearTotalTax: 10_000, priorYearAGI: 100_000 });
    expect(r.safeHarbor.basis).toBe("100pct_prior");
    expect(r.safeHarbor.requiredAnnualPayment).toBe(10_000);
    expect(r.safeHarbor.suggestedQuarterly).toBe(1_250);
  });
  it("110% of prior year when prior AGI > $150k", () => {
    const r = base({ priorYearTotalTax: 10_000, priorYearAGI: 200_000 });
    expect(r.safeHarbor.basis).toBe("110pct_prior");
    expect(r.safeHarbor.requiredAnnualPayment).toBe(11_000);
  });
  it("under $1,000 owed after withholding: no penalty", () => {
    const r = base({ priorYearTotalTax: 10_000, priorYearAGI: 100_000 }, 13_000);
    expect(r.safeHarbor.basis).toBe("none_owed");
    expect(r.safeHarbor.meetsSafeHarbor).toBe(true);
  });
  it("installmentsRemaining spreads the shortfall", () => {
    const r = base({ priorYearTotalTax: 10_000, priorYearAGI: 100_000 }, 5_000, { installmentsRemaining: 2 });
    expect(r.safeHarbor.suggestedQuarterly).toBe(2_500);
  });
});
