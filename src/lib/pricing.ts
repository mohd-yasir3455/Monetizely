/**
 * The pricing engine.
 *
 * This module is deliberately pure: no database, no React, no I/O. Given a
 * fully-resolved description of what a customer is buying, it returns the exact
 * line items that appear on the quote, including the human-readable calculation
 * string for each one. Everything the customer sees on the quote page is
 * produced here, which is what makes "the math has to be right and visible"
 * enforceable by a unit test rather than by eyeballing a screenshot.
 */

import { applyBps, formatBps, formatCents, formatCentsCompact } from "./money";
import { getTerm, type Term } from "./terms";

export type PricingModel = "FIXED_MONTHLY" | "PER_SEAT" | "PERCENT_OF_PRODUCT";

export type LineItemKind = "BASE" | "ADDON" | "DISCOUNT";

/** A single add-on the analyst selected, already resolved against the catalog. */
export interface SelectedAddon {
  featureName: string;
  pricingModel: PricingModel;
  /** Cents. Set for FIXED_MONTHLY and PER_SEAT. */
  amountCents?: number | null;
  /** Basis points. Set for PERCENT_OF_PRODUCT. 1000 = 10%. */
  percentBps?: number | null;
  /** Only meaningful for PER_SEAT. Independent of the product's seat count. */
  seats?: number | null;
}

export interface QuoteInput {
  productName: string;
  tierName: string;
  /** Cents, per seat per month. */
  basePriceCents: number;
  seats: number;
  termKey: string;
  addons: SelectedAddon[];
  /** Optional overall discount on the quote, in basis points. 500 = 5%. */
  overallDiscountBps: number;
}

export interface ComputedLineItem {
  kind: LineItemKind;
  label: string;
  /** The visible arithmetic, e.g. "25 seats x $50/seat/mo x 12 mo x (1 - 15%)". */
  calculation: string;
  amountCents: number;
}

export interface ComputedQuote {
  term: Term;
  lineItems: ComputedLineItem[];
  /** The base product line only, after the term discount. */
  baseCents: number;
  /** Base + all add-ons, before the overall discount. */
  subtotalCents: number;
  overallDiscountBps: number;
  /** Positive number; subtracted from the subtotal. */
  discountAmountCents: number;
  totalCents: number;
}

/* -------------------------------------------------------------------------- */
/* Individual line computations                                               */
/* -------------------------------------------------------------------------- */

/**
 * The base product line.
 *
 * The brief says the term discount applies "on the per-seat price". Discounting
 * the per-seat rate and then multiplying by seats and months is algebraically
 * identical to discounting the total, but the two differ in *rounding*: a 15%
 * discount on a $33.33 seat rate rounds once per seat in the first form and
 * once overall in the second. We discount the total, which matches the worked
 * example in sample-quote.xlsx (25 x $50 x 12 x 0.85 = $12,750) and never
 * accumulates per-seat rounding error.
 */
export function computeBaseLine(
  productName: string,
  tierName: string,
  basePriceCents: number,
  seats: number,
  term: Term,
): ComputedLineItem {
  const undiscountedCents = seats * basePriceCents * term.months;
  const discountCents = applyBps(undiscountedCents, term.discountBps);
  const amountCents = undiscountedCents - discountCents;

  const rate = formatCentsCompact(basePriceCents);
  const seatWord = seats === 1 ? "seat" : "seats";
  const monthWord = term.months === 1 ? "month" : "months";

  const calculation =
    term.discountBps === 0
      ? `${seats} ${seatWord} × ${rate}/seat/month × ${term.months} ${monthWord}`
      : `${seats} ${seatWord} × ${rate}/seat/month × ${term.months} ${monthWord} × (1 − ${formatBps(
          term.discountBps,
        )} ${term.label.toLowerCase()} discount)`;

  return {
    kind: "BASE",
    label: `${productName} — ${tierName} tier`,
    calculation,
    amountCents,
  };
}

/**
 * A single add-on line.
 *
 * `baseCents` is the base product line *after* the term discount. See the
 * README for why percent-of-product add-ons are computed against the discounted
 * figure rather than list price.
 */
export function computeAddonLine(
  addon: SelectedAddon,
  baseCents: number,
  term: Term,
): ComputedLineItem {
  const monthWord = term.months === 1 ? "month" : "months";
  let amountCents: number;
  let calculation: string;

  switch (addon.pricingModel) {
    case "FIXED_MONTHLY": {
      const rate = requireCents(addon, "amountCents");
      amountCents = rate * term.months;
      calculation = `${formatCentsCompact(rate)}/month flat × ${term.months} ${monthWord}`;
      break;
    }

    case "PER_SEAT": {
      const rate = requireCents(addon, "amountCents");
      const addonSeats = addon.seats ?? 0;
      if (!Number.isInteger(addonSeats) || addonSeats < 1) {
        throw new Error(
          `Add-on "${addon.featureName}" is priced per seat and needs a seat count of at least 1.`,
        );
      }
      amountCents = addonSeats * rate * term.months;
      const seatWord = addonSeats === 1 ? "seat" : "seats";
      calculation = `${addonSeats} ${seatWord} × ${formatCentsCompact(
        rate,
      )}/seat/month × ${term.months} ${monthWord}`;
      break;
    }

    case "PERCENT_OF_PRODUCT": {
      const bps = addon.percentBps;
      if (bps == null) {
        throw new Error(
          `Add-on "${addon.featureName}" is priced as a percentage but has no percentage set.`,
        );
      }
      amountCents = applyBps(baseCents, bps);
      calculation = `${formatBps(bps)} × base product cost (${formatCents(baseCents)})`;
      break;
    }

    default: {
      const exhaustive: never = addon.pricingModel;
      throw new Error(`Unknown pricing model: ${exhaustive}`);
    }
  }

  return {
    kind: "ADDON",
    label: `Add-on: ${addon.featureName}`,
    calculation,
    amountCents,
  };
}

function requireCents(addon: SelectedAddon, field: "amountCents"): number {
  const value = addon[field];
  if (value == null) {
    throw new Error(`Add-on "${addon.featureName}" is missing its price.`);
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* The whole quote                                                            */
/* -------------------------------------------------------------------------- */

export function computeQuote(input: QuoteInput): ComputedQuote {
  if (!Number.isInteger(input.seats) || input.seats < 1) {
    throw new Error("Seats must be a whole number of at least 1.");
  }
  if (input.overallDiscountBps < 0 || input.overallDiscountBps > 10_000) {
    throw new Error("Overall discount must be between 0% and 100%.");
  }

  const term = getTerm(input.termKey);

  const baseLine = computeBaseLine(
    input.productName,
    input.tierName,
    input.basePriceCents,
    input.seats,
    term,
  );
  const baseCents = baseLine.amountCents;

  const addonLines = input.addons.map((addon) => computeAddonLine(addon, baseCents, term));

  const lineItems: ComputedLineItem[] = [baseLine, ...addonLines];
  const subtotalCents = lineItems.reduce((sum, li) => sum + li.amountCents, 0);

  const discountAmountCents = applyBps(subtotalCents, input.overallDiscountBps);

  if (discountAmountCents > 0) {
    lineItems.push({
      kind: "DISCOUNT",
      label: "Overall quote discount",
      calculation: `${formatBps(input.overallDiscountBps)} × subtotal (${formatCents(
        subtotalCents,
      )})`,
      // Stored negative so that the line items always sum to the total.
      amountCents: -discountAmountCents,
    });
  }

  const totalCents = subtotalCents - discountAmountCents;

  return {
    term,
    lineItems,
    baseCents,
    subtotalCents,
    overallDiscountBps: input.overallDiscountBps,
    discountAmountCents,
    totalCents,
  };
}
