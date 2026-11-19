import { describe, expect, it } from "vitest";
import { parse1099B, summarizeLots } from "../src/engine";
import { holdingTerm, parseDate, parseMoney } from "../src/engine/form8949";

const WEBULL = `Symbol,Quantity,Date Acquired,Date Sold,Proceeds,Cost Basis,Wash Sale Loss Disallowed,Gain/Loss,Term
AAPL,10,01/10/2025,03/15/2025,"$1,800.00","$2,000.00",$0.00,($200.00),Short
TSLA,5,VARIOUS,06/01/2025,"$1,000.00","$1,300.00",$100.00,($200.00),Short
MSFT,3,01/10/2024,02/01/2025,"$1,500.00","$900.00",--,$600.00,Long
Total,,,,"$4,300.00","$4,200.00",$100.00,$200.00,
`;

const ROBINHOOD = `Robinhood Securities LLC
Form 1099-B Tax Year 2025

DESCRIPTION,CUSIP,QUANTITY,DATE ACQUIRED,DATE SOLD OR DISPOSED,PROCEEDS,COST BASIS,ACCRUED MARKET DISCOUNT,WASH SALE LOSS DISALLOWED,TERM
"100 sh NVDA",67066G104,100,2025-02-03,2025-02-20,9500.00,10000.00,0.00,0.00,SHORT TERM
"SPY 01/17/2025 Call",,1,2025-01-02,2025-01-17,2500.00,1500.00,0.00,0.00,SHORT TERM
"100 sh NVDA",67066G104,100,2025-03-01,2025-12-01,11000.00,10200.00,0.00,0.00,SHORT TERM
`;

const GENERIC_TSV = [
  "Description of property\tDate acquired\tDate sold or disposed\tProceeds (sales price)\tCost or other basis\tAdjustment code\tAmount of adjustment\tSection 1256",
  "ES futures\t2025-03-01\t2025-04-01\t15000\t10000\t\t0\tYes",
  "XYZ\t3/5/24\t3/6/25\t1,000\t400\t\t0\tNo",
  "ABC\t2025-01-10\t2026-01-11\t500\t800\tW\t100\tNo",
  "BAD\tnot a date\t2025-05-05\t100\t50\t\t0\tNo",
].join("\n");

describe("cell parsers", () => {
  it("money", () => {
    expect(parseMoney("(1,234.56)")).toBe(-1234.56);
    expect(parseMoney("$1,234")).toBe(1234);
    expect(parseMoney("-$12.50")).toBe(-12.5);
    expect(parseMoney("--")).toBe(0);
    expect(parseMoney("abc")).toBeNull();
  });
  it("dates", () => {
    expect(parseDate("01/10/2025")).toBe("2025-01-10");
    expect(parseDate("1/5/25")).toBe("2025-01-05");
    expect(parseDate("2025-03-04 10:22:11")).toBe("2025-03-04");
    expect(parseDate("Various")).toBe("VARIOUS");
    expect(parseDate("Jan 5, 2025")).toBe("2025-01-05");
    expect(parseDate("garbage")).toBeNull();
  });
  it("holding period: more than one year", () => {
    expect(holdingTerm("2025-01-10", "2026-01-10")).toBe("short");
    expect(holdingTerm("2025-01-10", "2026-01-11")).toBe("long");
    expect(holdingTerm("VARIOUS", "2026-01-11")).toBe("short");
  });
});

describe("parse1099B", () => {
  it("Webull-style: quoted $ values, parentheses, VARIOUS, totals row skipped", () => {
    const r = parse1099B(WEBULL);
    expect(r.errors).toEqual([]);
    expect(r.lots).toHaveLength(3);
    expect(r.detectedColumns.washSale).toBe("Wash Sale Loss Disallowed");
    expect(r.detectedColumns.gainLoss).toBe("Gain/Loss");
    expect(r.lots[1]).toMatchObject({ description: "TSLA", dateAcquired: "VARIOUS", proceeds: 1000, costBasis: 1300, washSaleDisallowed: 100, term: "short" });
    expect(r.lots[2]!.washSaleDisallowed).toBe(0);
    const s = summarizeLots(r.lots, 2025);
    expect(s.lotCount).toBe(3);
    expect(s.shortTermProceeds).toBe(2800);
    expect(s.shortTermBasis).toBe(3300);
    expect(s.shortTermWashAdjustments).toBe(100);
    expect(s.netShortTerm).toBe(-400); // −200 + (−300 + 100)
    expect(s.netLongTerm).toBe(600);
    expect(s.potentialWashSales).toBe(0);
  });

  it("Robinhood-style: preamble rows, uppercase headers, ISO dates, repurchase flagged", () => {
    const r = parse1099B(ROBINHOOD);
    expect(r.errors).toEqual([]);
    expect(r.lots).toHaveLength(3);
    expect(r.detectedColumns.dateSold).toBe("DATE SOLD OR DISPOSED");
    expect(r.lots[0]!.description).toBe("100 sh NVDA");
    const s = summarizeLots(r.lots, 2025);
    expect(s.netShortTerm).toBe(1300); // −500 + 1,000 + 800
    expect(s.potentialWashSales).toBe(1); // NVDA loss 2/20, rebought 3/1
  });

  it("generic Form 8949 TSV: 1256 column, M/D/YY dates, adjustment amount, bad row reported", () => {
    const r = parse1099B(GENERIC_TSV);
    expect(r.lots).toHaveLength(3);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.row).toBe(5);
    expect(r.lots[0]!.section1256).toBe(true);
    expect(r.lots[2]!.washSaleDisallowed).toBe(100);
    const s25 = summarizeLots(r.lots, 2025);
    expect(s25.lotCount).toBe(2);
    expect(s25.section1256Net).toBe(5000);
    expect(s25.netLongTerm).toBe(600); // XYZ held 3/5/24 → 3/6/25
    const s26 = summarizeLots(r.lots, 2026);
    expect(s26.netLongTerm).toBe(-200); // 500 − 800 + 100 wash
    expect(s26.longTermWashAdjustments).toBe(100);
  });

  it("no recognizable header → single error", () => {
    const r = parse1099B("foo,bar\n1,2\n");
    expect(r.lots).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
  });

  it("derives basis from gain/loss when basis column missing (IBKR-like)", () => {
    const r = parse1099B("Symbol,Date/Time,Quantity,Proceeds,Realized P/L\nQQQ,2025-06-01 10:00:00,1,1000,-150\n");
    expect(r.lots[0]).toMatchObject({ description: "QQQ", dateSold: "2025-06-01", costBasis: 1150 });
  });
});
