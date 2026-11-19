/**
 * TaxForge engine public API. The UI imports ONLY from this file.
 * Bodies are implemented in sibling modules; this file re-exports them.
 */
export * from "./types";
export { computeTax } from "./compute";
export { getParams, SUPPORTED_YEARS } from "./params";
export { parse1099B, summarizeLots } from "./form8949";
export { sweepOrdinaryIncome, sweepLongTermGains } from "./analysis";
export { defaultInput } from "./defaults";
