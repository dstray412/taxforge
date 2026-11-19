# TaxForge

Federal individual income tax planner for tax years 2025 and 2026 (post One Big Beautiful Bill Act).
Pure, tested calculation engine plus a React dashboard. Planning estimates only; it does not file returns.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest, 130+ engine tests
npm run build      # production bundle in dist/
npm run preview    # serve dist/ at http://localhost:4173
```

## What it models

- Form 1040 flow with a worksheet-style trace for every line (plain-English notes).
- Ordinary brackets, standard/itemized deductions, SALT cap with OBBBA phaseout, senior / tips / overtime / car-loan deductions, 2026 non-itemizer charitable and sec. 68 reduction.
- Qualified dividends and capital gains worksheet (0/15/20%), Schedule D netting, loss limit and carryforward, Section 1256 60/40.
- Schedule SE, QBI (sec. 199A) with SSTB phase-in and the 2026 minimum.
- Social Security taxability, AMT (simplified Form 6251), NIIT, Additional Medicare Tax.
- Credits: CTC/ACTC/ODC, EITC, child care, AOTC, Saver's, foreign tax.
- Estimated tax safe harbor (Form 2210 logic) with due dates.
- 1099-B CSV import (Webull, Robinhood, Fidelity, Schwab, thinkorswim, IBKR, generic) with wash-sale flags.
- Scenarios saved in the browser, side-by-side compare, marginal-rate sweeps, print summary, JSON export/import.

## Numbers

Every parameter is in `src/engine/params/2025.ts` and `2026.ts`, verified against Rev. Proc. 2024-40,
Rev. Proc. 2025-32 and the OBBBA statute text. The verification report with sources is `docs/TAX_PARAMS.md`.

## Not modeled

State taxes, kiddie tax, foreign income exclusions, full Form 6251, cross-broker wash sales.

## Layout

- `src/engine/` pure engine (`computeTax`, `parse1099B`, `summarizeLots`, sweeps). See `src/engine/README.md`.
- `src/ui/` React app.
- `tests/` vitest suites.
