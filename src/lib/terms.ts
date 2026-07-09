/**
 * Term lengths are a global constant across all clients, per the brief:
 * "These are standard terms across all our clients - they don't change per product."
 *
 * Discounts are stored as basis points (1 bps = 0.01%) so that all
 * percentage math stays in integers and never touches a float.
 */

export type TermKey = "MONTHLY" | "ANNUAL" | "TWO_YEAR";

export interface Term {
  key: TermKey;
  label: string;
  months: number;
  /** Discount applied to the base per-seat product price. 1500 = 15%. */
  discountBps: number;
}

export const TERMS: Record<TermKey, Term> = {
  MONTHLY: { key: "MONTHLY", label: "Monthly", months: 1, discountBps: 0 },
  ANNUAL: { key: "ANNUAL", label: "Annual", months: 12, discountBps: 1500 },
  TWO_YEAR: { key: "TWO_YEAR", label: "Two-year", months: 24, discountBps: 2500 },
};

export const TERM_LIST: Term[] = [TERMS.MONTHLY, TERMS.ANNUAL, TERMS.TWO_YEAR];

export function getTerm(key: string): Term {
  const term = TERMS[key as TermKey];
  if (!term) throw new Error(`Unknown term length: ${key}`);
  return term;
}
