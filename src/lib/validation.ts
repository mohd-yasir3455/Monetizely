import { z } from "zod";

/**
 * Validation lives server-side, in the server actions, because the client can
 * be bypassed. The browser gets the same messages back and renders them, so the
 * two never drift out of sync.
 */

const nonEmpty = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(120, `${label} must be 120 characters or fewer.`);

export const createProductSchema = z.object({
  name: nonEmpty("Product name"),
});

export const createTierSchema = z.object({
  productId: z.string().min(1),
  name: nonEmpty("Tier name"),
  basePriceDollars: z.coerce
    .number({ invalid_type_error: "Base price must be a number." })
    .min(0, "Base price cannot be negative.")
    .max(1_000_000, "Base price is implausibly large."),
});

export const updateTierPriceSchema = z.object({
  tierId: z.string().min(1),
  basePriceDollars: z.coerce
    .number({ invalid_type_error: "Base price must be a number." })
    .min(0, "Base price cannot be negative.")
    .max(1_000_000, "Base price is implausibly large."),
});

export const createFeatureSchema = z.object({
  productId: z.string().min(1),
  name: nonEmpty("Feature name"),
});

export const pricingModelSchema = z.enum(["FIXED_MONTHLY", "PER_SEAT", "PERCENT_OF_PRODUCT"]);

export const setAvailabilitySchema = z
  .object({
    featureId: z.string().min(1),
    tierId: z.string().min(1),
    availability: z.enum(["INCLUDED", "ADDON", "NOT_AVAILABLE"]),
    pricingModel: pricingModelSchema.optional().nullable(),
    /** Dollars for FIXED_MONTHLY / PER_SEAT. */
    amountDollars: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
    /** Whole percent for PERCENT_OF_PRODUCT, e.g. 10 for 10%. */
    percent: z.coerce.number().min(0).max(100).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.availability !== "ADDON") return;

    if (!val.pricingModel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pricingModel"],
        message: "Pick a pricing model for this add-on.",
      });
      return;
    }
    if (val.pricingModel === "PERCENT_OF_PRODUCT") {
      if (val.percent == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["percent"],
          message: "Enter a percentage for this add-on.",
        });
      }
    } else if (val.amountDollars == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountDollars"],
        message: "Enter a price for this add-on.",
      });
    }
  });

export const selectedAddonSchema = z.object({
  featureId: z.string().min(1),
  /** Only supplied for per-seat add-ons. */
  seats: z.coerce
    .number()
    .int("Add-on seats must be a whole number.")
    .min(1, "Add-on seats must be at least 1.")
    .max(1_000_000)
    .optional()
    .nullable(),
});

export const createQuoteSchema = z.object({
  name: nonEmpty("Quote name"),
  customerName: nonEmpty("Customer name"),
  productId: z.string().min(1, "Choose a product."),
  tierId: z.string().min(1, "Choose a tier."),
  seats: z.coerce
    .number({ invalid_type_error: "Seats must be a number." })
    .int("Seats must be a whole number.")
    .min(1, "Seats must be at least 1.")
    .max(1_000_000, "Seats is implausibly large."),
  termKey: z.enum(["MONTHLY", "ANNUAL", "TWO_YEAR"], {
    errorMap: () => ({ message: "Choose a term length." }),
  }),
  overallDiscountPercent: z.coerce
    .number({ invalid_type_error: "Discount must be a number." })
    .min(0, "Discount cannot be negative.")
    .max(100, "Discount cannot exceed 100%."),
  addons: z
    .array(selectedAddonSchema)
    .default([])
    .superRefine((addons, ctx) => {
      const seen = new Set<string>();

      for (const [index, addon] of addons.entries()) {
        if (seen.has(addon.featureId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "featureId"],
            message: "Each add-on can only be selected once.",
          });
          continue;
        }

        seen.add(addon.featureId);
      }
    }),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

/** Flatten a ZodError into a single readable list for the UI. */
export function zodMessages(error: z.ZodError): string[] {
  return error.issues.map((i) => i.message);
}
