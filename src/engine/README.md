# Engine API contract

All functions are pure and synchronous.

```ts
computeTax(input: TaxInput): TaxResult
getParams(year: TaxYear): TaxYearParams
SUPPORTED_YEARS: TaxYear[]            // [2025, 2026]
defaultInput(year?: TaxYear): TaxInput // all-zero, single, no dependents

// 1099-B import
parse1099B(csvText: string): BrokerImportResult
//   Accepts CSV/TSV exported by common brokers (Webull, Robinhood, Fidelity, Schwab,
//   E*TRADE, thinkorswim, Interactive Brokers, generic "Form 8949" CSVs). Header detection
//   is fuzzy: matches Description/Symbol, Date Acquired/Open Date, Date Sold/Close Date,
//   Proceeds/Sales Price, Cost Basis/Cost, Wash Sale Loss Disallowed/Adjustment, Term.
summarizeLots(lots: BrokerLot[], taxYear: TaxYear): CapitalGainsSummary
//   Only lots with dateSold inside taxYear count. Term: > 1 year holding = long.
//   Section 1256 lots are reported separately (the engine splits 60/40).

// Analysis
sweepOrdinaryIncome(base: TaxInput, from: number, to: number, step: number): SweepPoint[]
//   Varies w2.wages from..to and recomputes; marginalRate from finite difference.
sweepLongTermGains(base: TaxInput, from: number, to: number, step: number): SweepPoint[]
```
