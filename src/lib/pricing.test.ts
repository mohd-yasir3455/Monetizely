import { describe, expect, it } from "vitest";

import { applyBps, roundHalfUp } from "./money";
import { computeAddonLine, computeBaseLine, computeQuote, type SelectedAddon } from "./pricing";
import { TERMS } from "./terms";

const GROWTH_SEAT_PRICE = 5_000; // $50.00 in cents

describe("money", () => {
  it("rounds half away from zero", () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(1.5)).toBe(2);
    expect(roundHalfUp(2.5)).toBe(3); // not banker's rounding
    expect(roundHalfUp(-0.5)).toBe(-1);
    expect(roundHalfUp(1.4)).toBe(1);
  });

  it("applies basis points and rounds to whole cents", () => {
    expect(applyBps(10_000, 1_500)).toBe(1_500); // 15% of $100.00 = $15.00
    expect(applyBps(333, 1_000)).toBe(33); // 10% of $3.33 = $0.333 -> $0.33
    expect(applyBps(335, 1_000)).toBe(34); // 10% of $3.35 = $0.335 -> $0.34 (half up)
    expect(applyBps(12_345, 0)).toBe(0);
  });
});

describe("computeBaseLine", () => {
  it("multiplies seats x rate x months with no discount on a monthly term", () => {
    const line = computeBaseLine("Analytics Suite", "Growth", GROWTH_SEAT_PRICE, 10, TERMS.MONTHLY);
    expect(line.amountCents).toBe(50_000); // 10 x $50 x 1 = $500
    expect(line.calculation).toBe("10 seats × $50/seat/month × 1 month");
  });

  it("applies the 15% annual discount", () => {
    const line = computeBaseLine("Analytics Suite", "Growth", GROWTH_SEAT_PRICE, 25, TERMS.ANNUAL);
    expect(line.amountCents).toBe(1_275_000); // 25 x $50 x 12 x 0.85 = $12,750
  });

  it("applies the 25% two-year discount", () => {
    const line = computeBaseLine("Analytics Suite", "Growth", GROWTH_SEAT_PRICE, 25, TERMS.TWO_YEAR);
    // 25 x $50 x 24 = $30,000; less 25% = $22,500
    expect(line.amountCents).toBe(2_250_000);
  });

  it("discounts the total rather than the per-seat rate, so no per-seat rounding accrues", () => {
    // $33.33/seat, 3 seats, annual. Per-seat-then-round would give
    // round(3333 * 0.85) = 2833 -> 2833 * 3 * 12 = 101,988 cents.
    // Discounting the total gives round(3333 * 3 * 12 * 0.85) = 101,990 cents.
    const line = computeBaseLine("X", "Y", 3_333, 3, TERMS.ANNUAL);
    expect(line.amountCents).toBe(101_990);
  });

  it("uses singular nouns for one seat and one month", () => {
    const line = computeBaseLine("X", "Y", 1_000, 1, TERMS.MONTHLY);
    expect(line.calculation).toBe("1 seat × $10/seat/month × 1 month");
  });
});

describe("computeAddonLine", () => {
  const base = 1_275_000; // $12,750

  it("prices a fixed monthly add-on as rate x months", () => {
    const addon: SelectedAddon = {
      featureName: "Single Sign-On (SSO)",
      pricingModel: "FIXED_MONTHLY",
      amountCents: 20_000, // $200
    };
    const line = computeAddonLine(addon, base, TERMS.ANNUAL);
    expect(line.amountCents).toBe(240_000); // $2,400
    expect(line.calculation).toBe("$200/month flat × 12 months");
  });

  it("ignores the product seat count when pricing a per-seat add-on", () => {
    const addon: SelectedAddon = {
      featureName: "API access",
      pricingModel: "PER_SEAT",
      amountCents: 5_000, // $50
      seats: 5, // the product has 25 seats; this add-on has 5
    };
    const line = computeAddonLine(addon, base, TERMS.ANNUAL);
    expect(line.amountCents).toBe(300_000); // $3,000
    expect(line.calculation).toBe("5 seats × $50/seat/month × 12 months");
  });

  it("prices a percent-of-product add-on against the post-term-discount base", () => {
    const addon: SelectedAddon = {
      featureName: "Advanced anomaly detection",
      pricingModel: "PERCENT_OF_PRODUCT",
      percentBps: 1_000, // 10%
    };
    const line = computeAddonLine(addon, base, TERMS.ANNUAL);
    // 10% of the *discounted* $12,750, not of the $15,000 list price.
    expect(line.amountCents).toBe(127_500);
    expect(line.calculation).toBe("10% × base product cost ($12,750.00)");
  });

  it("does not apply the term discount to add-ons", () => {
    const fixed: SelectedAddon = {
      featureName: "White-label option",
      pricingModel: "FIXED_MONTHLY",
      amountCents: 50_000,
    };
    // $500 x 12 = $6,000 flat. If the 15% term discount leaked in it would be $5,100.
    expect(computeAddonLine(fixed, base, TERMS.ANNUAL).amountCents).toBe(600_000);
  });

  it("rejects a per-seat add-on with no seat count", () => {
    const addon: SelectedAddon = {
      featureName: "API access",
      pricingModel: "PER_SEAT",
      amountCents: 5_000,
      seats: 0,
    };
    expect(() => computeAddonLine(addon, base, TERMS.ANNUAL)).toThrow(/seat count of at least 1/);
  });

  it("rejects a percent add-on with no percentage set", () => {
    const addon: SelectedAddon = {
      featureName: "Broken",
      pricingModel: "PERCENT_OF_PRODUCT",
      percentBps: null,
    };
    expect(() => computeAddonLine(addon, base, TERMS.ANNUAL)).toThrow(/no percentage set/);
  });
});

describe("computeQuote", () => {
  it("reproduces sample-quote.xlsx exactly", () => {
    const quote = computeQuote({
      productName: "Analytics Suite",
      tierName: "Growth",
      basePriceCents: GROWTH_SEAT_PRICE,
      seats: 25,
      termKey: "ANNUAL",
      overallDiscountBps: 0,
      addons: [
        { featureName: "Single Sign-On (SSO)", pricingModel: "FIXED_MONTHLY", amountCents: 20_000 },
        { featureName: "API access", pricingModel: "PER_SEAT", amountCents: 5_000, seats: 5 },
      ],
    });

    expect(quote.baseCents).toBe(1_275_000); // $12,750
    expect(quote.lineItems[1].amountCents).toBe(240_000); // $2,400 SSO
    expect(quote.lineItems[2].amountCents).toBe(300_000); // $3,000 API access
    expect(quote.totalCents).toBe(1_815_000); // $18,150
    expect(quote.discountAmountCents).toBe(0);
    // No discount line item when the discount is zero.
    expect(quote.lineItems).toHaveLength(3);
  });

  it("applies the overall discount to the full subtotal, base and add-ons alike", () => {
    const quote = computeQuote({
      productName: "Analytics Suite",
      tierName: "Growth",
      basePriceCents: GROWTH_SEAT_PRICE,
      seats: 25,
      termKey: "ANNUAL",
      overallDiscountBps: 1_000, // 10%
      addons: [
        { featureName: "Single Sign-On (SSO)", pricingModel: "FIXED_MONTHLY", amountCents: 20_000 },
      ],
    });

    expect(quote.subtotalCents).toBe(1_515_000); // $12,750 + $2,400
    expect(quote.discountAmountCents).toBe(151_500); // 10%
    expect(quote.totalCents).toBe(1_363_500); // $13,635
  });

  it("emits the overall discount as a negative line item so line items sum to the total", () => {
    const quote = computeQuote({
      productName: "P",
      tierName: "T",
      basePriceCents: 10_000,
      seats: 1,
      termKey: "MONTHLY",
      overallDiscountBps: 2_000,
      addons: [],
    });

    const discountLine = quote.lineItems.at(-1)!;
    expect(discountLine.kind).toBe("DISCOUNT");
    expect(discountLine.amountCents).toBe(-2_000);

    const summed = quote.lineItems.reduce((s, li) => s + li.amountCents, 0);
    expect(summed).toBe(quote.totalCents);
  });

  it("stacks a term discount and an overall discount without compounding them into each other", () => {
    const quote = computeQuote({
      productName: "P",
      tierName: "T",
      basePriceCents: 10_000, // $100/seat/mo
      seats: 10,
      termKey: "TWO_YEAR", // 25% off base
      overallDiscountBps: 1_000, // then 10% off everything
      addons: [],
    });

    // 10 x $100 x 24 = $24,000; less 25% = $18,000; less 10% = $16,200
    expect(quote.baseCents).toBe(1_800_000);
    expect(quote.totalCents).toBe(1_620_000);
  });

  it("computes percent add-ons off the base, then discounts the sum", () => {
    const quote = computeQuote({
      productName: "P",
      tierName: "T",
      basePriceCents: 10_000,
      seats: 10,
      termKey: "ANNUAL",
      overallDiscountBps: 500, // 5%
      addons: [{ featureName: "Pct", pricingModel: "PERCENT_OF_PRODUCT", percentBps: 1_000 }],
    });

    // base: 10 x $100 x 12 x 0.85 = $10,200
    // addon: 10% of $10,200 = $1,020
    // subtotal $11,220; less 5% = $10,659
    expect(quote.baseCents).toBe(1_020_000);
    expect(quote.lineItems[1].amountCents).toBe(102_000);
    expect(quote.subtotalCents).toBe(1_122_000);
    expect(quote.totalCents).toBe(1_065_900);
  });

  it("handles a 100% overall discount", () => {
    const quote = computeQuote({
      productName: "P",
      tierName: "T",
      basePriceCents: 10_000,
      seats: 5,
      termKey: "MONTHLY",
      overallDiscountBps: 10_000,
      addons: [],
    });
    expect(quote.totalCents).toBe(0);
  });

  it("rejects a fractional seat count", () => {
    expect(() =>
      computeQuote({
        productName: "P",
        tierName: "T",
        basePriceCents: 10_000,
        seats: 2.5,
        termKey: "MONTHLY",
        overallDiscountBps: 0,
        addons: [],
      }),
    ).toThrow(/whole number/);
  });

  it("rejects zero seats", () => {
    expect(() =>
      computeQuote({
        productName: "P",
        tierName: "T",
        basePriceCents: 10_000,
        seats: 0,
        termKey: "MONTHLY",
        overallDiscountBps: 0,
        addons: [],
      }),
    ).toThrow(/at least 1/);
  });

  it("rejects a discount above 100%", () => {
    expect(() =>
      computeQuote({
        productName: "P",
        tierName: "T",
        basePriceCents: 10_000,
        seats: 1,
        termKey: "MONTHLY",
        overallDiscountBps: 10_001,
        addons: [],
      }),
    ).toThrow(/between 0% and 100%/);
  });

  it("rejects an unknown term", () => {
    expect(() =>
      computeQuote({
        productName: "P",
        tierName: "T",
        basePriceCents: 10_000,
        seats: 1,
        termKey: "THREE_YEAR",
        overallDiscountBps: 0,
        addons: [],
      }),
    ).toThrow(/Unknown term length/);
  });
});
