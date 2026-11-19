/**
 * 1099-B / Form 8949 CSV import and lot summarization.
 * Pure string parsing: no I/O; dates are handled as ISO strings and day numbers via Date.UTC.
 */
import type { BrokerImportResult, BrokerLot, CapitalGainsSummary, TaxYear } from "./types";

type Column =
  | "description"
  | "symbol"
  | "dateAcquired"
  | "dateSold"
  | "proceeds"
  | "costBasis"
  | "washSale"
  | "adjustment"
  | "gainLoss"
  | "term"
  | "section1256";

/** Max rows scanned when looking for the header row (brokers put preamble lines first). */
const HEADER_SCAN_ROWS = 40;
const WASH_WINDOW_DAYS = 30;
const MS_PER_DAY = 86_400_000;

/** Normalizes a header cell: lowercase, alphanumerics only. */
function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Header classification, in priority order: the first rule that matches wins, so specific
 * concepts ("wash sale loss disallowed") are tested before generic ones ("loss").
 */
const RULES: Array<[Column, (h: string) => boolean]> = [
  ["washSale", (h) => h.includes("wash") || h.includes("disallowed")],
  // Generic Form 8949 column (g): signed, may be positive or negative for non-wash codes.
  ["adjustment", (h) => h.includes("amountofadjustment") || h === "adjustment" || h === "adjustmentamount" || h === "adjustments"],
  ["section1256", (h) => h.includes("1256") || h.includes("regulatedfutures")],
  ["term", (h) => ["term", "termtype", "type", "stlt", "longshort", "shortlong", "shortlongterm", "shorttermlongterm", "longorshort", "shortorlong", "gaintype", "holding"].includes(h) || h.includes("holdingperiod") || h === "termcode"],
  ["dateAcquired", (h) => h.includes("acqui") || h.includes("opendate") || h.includes("dateopen") || h.includes("purchas") || h.includes("buydate") || h === "opened"],
  ["dateSold", (h) => h.includes("sold") || h.includes("closedate") || h.includes("dateclose") || h.includes("saledate") || h.includes("dateofsale") || h.includes("selldate") || h.includes("disposed") || h === "closed" || h.includes("datetime")],
  ["proceeds", (h) => h.includes("proceed") || h.includes("salesprice") || h.includes("saleprice") || h.includes("amountrealized")],
  ["costBasis", (h) => h.includes("cost") || h.includes("basis")],
  ["gainLoss", (h) => h.includes("gain") || h.includes("loss") || h.includes("pnl") || h.includes("pl") && h.length <= 4 || h.includes("realized")],
  ["symbol", (h) => h === "symbol" || h === "ticker" || h.includes("symbol") || h === "underlying"],
  ["description", (h) => h.includes("desc") || h.includes("security") || h === "name" || h.includes("instrument") || h.includes("property")],
];

function classify(header: string): Column | null {
  const h = norm(header);
  if (!h) return null;
  for (const [col, test] of RULES) if (test(h)) return col;
  return null;
}

/** RFC-4180-ish CSV/TSV parser: quoted fields, doubled quotes, newlines inside quotes. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parses a money cell: "$1,234.56", "(1,234.56)", "-$12", "1234.5-", "--" (zero).
 * @returns the number, or null when the cell is not numeric.
 */
export function parseMoney(cell: string): number | null {
  let s = cell.trim();
  if (s === "" || s === "--" || s === "-" || /^n\/?a$/i.test(s)) return 0;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  s = s.replace(/[$,\s]/g, "").replace(/^USD/i, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** True for a blank / not-reported cell ("", "--", "N/A"). */
function isBlank(cell: string): boolean {
  return /^(|-+|n\/?a)$/i.test(cell.trim());
}

/**
 * Parses a date cell to ISO yyyy-mm-dd. Accepts MM/DD/YYYY, M/D/YY, MM-DD-YYYY, YYYY-MM-DD,
 * YYYYMMDD, "Jan 5, 2025", optional trailing time, and "VARIOUS" (returned as "VARIOUS").
 * @returns ISO string, "VARIOUS", or null if unparseable.
 */
export function parseDate(cell: string): string | null {
  const s = cell.trim();
  if (/^various$/i.test(s)) return "VARIOUS";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s);
  if (m) {
    let y = +m[3]!;
    if (m[3]!.length === 2) y += 2000;
    return iso(y, +m[1]!, +m[2]!);
  }
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (m) {
    const mo = MONTHS[m[1]!.toLowerCase()];
    if (mo) return iso(+m[3]!, mo, +m[2]!);
  }
  return null;
}

function parseTerm(cell: string): "short" | "long" | undefined {
  const s = cell.trim().toLowerCase();
  if (!s) return undefined;
  if (/^(s|st)\b|short/.test(s)) return "short";
  if (/^(l|lt)\b|long/.test(s)) return "long";
  return undefined;
}

function parseBool(cell: string): boolean {
  return /^(y|yes|true|1|x|1256|section 1256)$/i.test(cell.trim());
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, HEADER_SCAN_ROWS).join("\n");
  const tabs = (sample.match(/\t/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  const semis = (sample.match(/;/g) ?? []).length;
  if (tabs > commas && tabs >= semis) return "\t";
  if (semis > commas) return ";";
  return ",";
}

/**
 * Parse a broker 1099-B export (CSV/TSV) into lots. Header detection is fuzzy and tolerates preamble
 * rows; totals/subtotal and blank rows are skipped. Cost basis may be derived from proceeds and a
 * gain/loss column when the basis column is missing.
 */
export function parse1099B(csvText: string): BrokerImportResult {
  const errors: BrokerImportResult["errors"] = [];
  const lots: BrokerLot[] = [];
  const rows = parseDelimited(csvText ?? "", detectDelimiter(csvText ?? ""));

  let headerIdx = -1;
  let map: Partial<Record<Column, number>> = {};
  for (let r = 0; r < Math.min(rows.length, HEADER_SCAN_ROWS); r++) {
    const candidate: Partial<Record<Column, number>> = {};
    rows[r]!.forEach((cell, c) => {
      const col = classify(cell);
      if (col && candidate[col] === undefined) candidate[col] = c;
    });
    const hasCore = candidate.proceeds !== undefined && (candidate.dateSold !== undefined || candidate.costBasis !== undefined);
    if (hasCore && Object.keys(candidate).length >= 3) {
      headerIdx = r;
      map = candidate;
      break;
    }
  }
  if (headerIdx < 0) {
    return { lots, errors: [{ row: 0, message: "Could not find a header row with Proceeds and Date Sold / Cost Basis columns." }], detectedColumns: {} };
  }
  const header = rows[headerIdx]!;
  const detectedColumns: Record<string, string> = {};
  for (const [col, idx] of Object.entries(map)) detectedColumns[col] = (header[idx as number] ?? "").trim();

  const cell = (row: string[], col: Column): string => {
    const idx = map[col];
    return idx === undefined ? "" : (row[idx] ?? "").trim();
  };

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]!;
    const rowNum = r + 1;
    if (row.every((c) => c.trim() === "")) continue;
    const desc = cell(row, "symbol") || cell(row, "description");
    if (/^(sub)?totals?\b|^grand total/i.test(desc) || /^(sub)?totals?\b/i.test((row[0] ?? "").trim())) continue;

    const proceeds = parseMoney(cell(row, "proceeds"));
    if (proceeds === null) {
      errors.push({ row: rowNum, message: `Proceeds "${cell(row, "proceeds")}" is not a number.` });
      continue;
    }
    const basisCell = cell(row, "costBasis");
    let basis = map.costBasis !== undefined && !isBlank(basisCell) ? parseMoney(basisCell) : null;
    if (basis === null && map.gainLoss !== undefined && !isBlank(cell(row, "gainLoss"))) {
      const gl = parseMoney(cell(row, "gainLoss"));
      if (gl !== null) basis = proceeds - gl;
    }
    if (basis === null) {
      errors.push({
        row: rowNum,
        message: isBlank(basisCell) ? "missing cost basis" : `Cost basis "${basisCell}" is not a number.`,
      });
      continue;
    }
    const soldRaw = cell(row, "dateSold");
    const dateSold = parseDate(soldRaw);
    if (!dateSold || dateSold === "VARIOUS") {
      errors.push({ row: rowNum, message: `Date sold "${soldRaw}" is not a recognizable date.` });
      continue;
    }
    const acqRaw = cell(row, "dateAcquired");
    const inherited = row.some((c) => /inherited/i.test(c));
    const dateAcquired = !acqRaw || /inherit/i.test(acqRaw) ? "VARIOUS" : parseDate(acqRaw);
    if (!dateAcquired) {
      errors.push({ row: rowNum, message: `Date acquired "${acqRaw}" is not a recognizable date.` });
      continue;
    }
    // Only an explicitly named wash-sale column is sign-normalized; a generic adjustment keeps its sign.
    const wash = map.washSale !== undefined
      ? Math.abs(parseMoney(cell(row, "washSale")) ?? 0)
      : map.adjustment !== undefined ? parseMoney(cell(row, "adjustment")) ?? 0 : 0;
    const lot: BrokerLot = {
      description: desc || `Row ${rowNum}`,
      dateAcquired,
      dateSold,
      proceeds,
      costBasis: basis,
      washSaleDisallowed: wash,
      row: rowNum,
    };
    const term = map.term !== undefined ? parseTerm(cell(row, "term")) : undefined;
    if (term) lot.term = term;
    if (inherited) {
      lot.inherited = true;
      lot.term = "long";
    }
    if (map.section1256 !== undefined && parseBool(cell(row, "section1256"))) lot.section1256 = true;
    lots.push(lot);
  }
  return { lots, errors, detectedColumns };
}

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / MS_PER_DAY;
}

/**
 * Holding period: long-term only if sold more than one year after acquisition, i.e. on or after the
 * day after the one-year anniversary (acquired 2025-01-10 → long if sold 2026-01-11 or later).
 * A Feb 29 acquisition's anniversary is Feb 28. "VARIOUS" without a broker term is treated as short
 * (inherited lots are always long; see summarizeLots).
 */
export function holdingTerm(dateAcquired: string, dateSold: string): "short" | "long" {
  if (dateAcquired === "VARIOUS") return "short";
  const [y, m, d] = dateAcquired.split("-");
  const md = `${m}-${d}` === "02-29" ? "02-28" : `${m}-${d}`;
  const anniversary = `${Number(y) + 1}-${md}`;
  return dateSold > anniversary ? "long" : "short";
}

/**
 * Summarize lots sold in `taxYear` into Schedule D totals. Gain = proceeds − basis + wash-sale
 * disallowed loss. Section 1256 lots are reported separately in `section1256Net`.
 * `potentialWashSales` counts loss lots (with no broker wash adjustment) for which another lot with
 * the same description was acquired within 30 days before or after the sale.
 */
export function summarizeLots(lots: BrokerLot[], taxYear: TaxYear): CapitalGainsSummary {
  const s: CapitalGainsSummary = {
    shortTermProceeds: 0,
    shortTermBasis: 0,
    shortTermWashAdjustments: 0,
    netShortTerm: 0,
    longTermProceeds: 0,
    longTermBasis: 0,
    longTermWashAdjustments: 0,
    netLongTerm: 0,
    section1256Net: 0,
    lotCount: 0,
    potentialWashSales: 0,
  };
  const prefix = `${taxYear}-`;
  lots.forEach((lot, i) => {
    if (!lot.dateSold.startsWith(prefix)) return;
    s.lotCount++;
    if (lot.section1256) {
      s.section1256Net += lot.proceeds - lot.costBasis;
      return;
    }
    const term = lot.inherited ? "long" : lot.term ?? holdingTerm(lot.dateAcquired, lot.dateSold);
    const gain = lot.proceeds - lot.costBasis + lot.washSaleDisallowed;
    if (term === "long") {
      s.longTermProceeds += lot.proceeds;
      s.longTermBasis += lot.costBasis;
      s.longTermWashAdjustments += lot.washSaleDisallowed;
      s.netLongTerm += gain;
    } else {
      s.shortTermProceeds += lot.proceeds;
      s.shortTermBasis += lot.costBasis;
      s.shortTermWashAdjustments += lot.washSaleDisallowed;
      s.netShortTerm += gain;
    }
    if (lot.proceeds - lot.costBasis < 0 && lot.washSaleDisallowed === 0) {
      const sold = dayNumber(lot.dateSold);
      const key = lot.description.trim().toUpperCase();
      const repurchased = lots.some(
        (o, j) =>
          j !== i &&
          o.dateAcquired !== "VARIOUS" &&
          o.description.trim().toUpperCase() === key &&
          Math.abs(dayNumber(o.dateAcquired) - sold) <= WASH_WINDOW_DAYS,
      );
      if (repurchased) s.potentialWashSales++;
    }
  });
  const round = (x: number): number => Math.round(x * 100) / 100;
  for (const k of Object.keys(s) as Array<keyof CapitalGainsSummary>) s[k] = round(s[k]);
  return s;
}
