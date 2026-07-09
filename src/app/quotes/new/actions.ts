"use server";

import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { percentToBps } from "@/lib/money";
import { computeQuote, type SelectedAddon } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { createQuoteSchema, zodMessages } from "@/lib/validation";

export type CreateQuoteResult =
  | { ok: true; publicId: string }
  | { ok: false; errors: string[] };

/** How long a quote is presented as valid. Not in the brief; see the README. */
const VALID_FOR_DAYS = 30;

export async function createQuote(input: unknown): Promise<CreateQuoteResult> {
  try {
    const data = createQuoteSchema.parse(input);

    // Never trust the prices the browser sent. Re-read the catalog and resolve
    // every selection against it. This is also what stops a stale tab from
    // quoting a price that was edited five minutes ago.
    const tier = await prisma.tier.findUnique({
      where: { id: data.tierId },
      include: { product: true },
    });

    if (!tier || tier.productId !== data.productId) {
      return { ok: false, errors: ["That tier no longer exists on this product. Reload and retry."] };
    }

    const errors: string[] = [];
    const addons: SelectedAddon[] = [];
    const requestedFeatureIds = data.addons.map((selected) => selected.featureId);
    const availabilities = requestedFeatureIds.length
      ? await prisma.featureAvailability.findMany({
          where: {
            tierId: tier.id,
            featureId: { in: requestedFeatureIds },
          },
          include: { feature: true },
        })
      : [];
    const availabilityByFeatureId = new Map(availabilities.map((item) => [item.featureId, item]));

    for (const selected of data.addons) {
      const availability = availabilityByFeatureId.get(selected.featureId);

      if (!availability) {
        errors.push("One of the selected add-ons is not part of this product.");
        continue;
      }

      const name = availability.feature.name;

      // The core catalog rule: only ADDON cells are purchasable. An INCLUDED
      // feature is already paid for; a NOT_AVAILABLE one cannot be sold at all.
      if (availability.availability !== "ADDON") {
        errors.push(
          availability.availability === "INCLUDED"
            ? `"${name}" is included on ${tier.name} and cannot be added as a paid add-on.`
            : `"${name}" is not available on ${tier.name}.`,
        );
        continue;
      }

      if (availability.pricingModel === "PER_SEAT" && selected.seats == null) {
        errors.push(`"${name}" is priced per seat. Enter how many seats.`);
        continue;
      }

      addons.push({
        featureName: name,
        pricingModel: availability.pricingModel!,
        amountCents: availability.amountCents,
        percentBps: availability.percentBps,
        seats: selected.seats ?? null,
      });
    }

    if (errors.length > 0) return { ok: false, errors };

    const computed = computeQuote({
      productName: tier.product.name,
      tierName: tier.name,
      basePriceCents: tier.basePriceCents,
      seats: data.seats,
      termKey: data.termKey,
      addons,
      overallDiscountBps: percentToBps(data.overallDiscountPercent),
    });

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + VALID_FOR_DAYS);

    // Everything below is frozen. No foreign keys back into the catalog.
    const quote = await prisma.quote.create({
      data: {
        publicId: nanoid(12),
        name: data.name,
        customerName: data.customerName,
        productName: tier.product.name,
        tierName: tier.name,
        basePriceCents: tier.basePriceCents,
        seats: data.seats,
        termKey: computed.term.key,
        termMonths: computed.term.months,
        termDiscountBps: computed.term.discountBps,
        baseCents: computed.baseCents,
        subtotalCents: computed.subtotalCents,
        overallDiscountBps: computed.overallDiscountBps,
        discountAmountCents: computed.discountAmountCents,
        totalCents: computed.totalCents,
        validUntil,
        lineItems: {
          create: computed.lineItems.map((li, i) => ({
            sortOrder: i,
            kind: li.kind,
            label: li.label,
            calculation: li.calculation,
            amountCents: li.amountCents,
          })),
        },
      },
    });

    revalidatePath("/quotes");
    revalidatePath("/");
    return { ok: true, publicId: quote.publicId };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, errors: zodMessages(e) };
    if (e instanceof Error && /seat count|whole number|at least 1|between 0%/.test(e.message)) {
      return { ok: false, errors: [e.message] };
    }
    console.error(e);
    return { ok: false, errors: ["Something went wrong saving the quote. Try again."] };
  }
}
