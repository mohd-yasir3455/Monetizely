import { describe, expect, it } from "vitest";

import { createQuoteSchema } from "./validation";

describe("createQuoteSchema", () => {
  it("rejects duplicate add-on selections", () => {
    const result = createQuoteSchema.safeParse({
      name: "Quote",
      customerName: "Customer",
      productId: "product_1",
      tierId: "tier_1",
      seats: 10,
      termKey: "MONTHLY",
      overallDiscountPercent: 0,
      addons: [
        { featureId: "feature_1", seats: 2 },
        { featureId: "feature_1", seats: 3 },
      ],
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Each add-on can only be selected once.",
          path: ["addons", 1, "featureId"],
        }),
      ]),
    );
  });
});
