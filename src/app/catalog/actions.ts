"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dollarsToCents, percentToBps } from "@/lib/money";
import { getActionErrorMessages } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  createFeatureSchema,
  createProductSchema,
  createTierSchema,
  setAvailabilitySchema,
  updateTierPriceSchema,
  zodMessages,
} from "@/lib/validation";

export type ActionResult = { ok: true } | { ok: false; errors: string[] };

function fail(error: unknown): ActionResult {
  if (error instanceof z.ZodError) return { ok: false, errors: zodMessages(error) };
  console.error(error);
  return { ok: false, errors: getActionErrorMessages(error, "Something went wrong saving that. Try again.") };
}

function done(): ActionResult {
  revalidatePath("/catalog");
  revalidatePath("/quotes/new");
  revalidatePath("/");
  return { ok: true };
}

export async function createProduct(input: unknown): Promise<ActionResult> {
  try {
    const { name } = createProductSchema.parse(input);
    await prisma.product.create({ data: { name } });
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function createTier(input: unknown): Promise<ActionResult> {
  try {
    const { productId, name, basePriceDollars } = createTierSchema.parse(input);
    const count = await prisma.tier.count({ where: { productId } });

    // A new tier starts as "not available" for every existing feature. The
    // analyst then opens it up cell by cell, which is the safe default: a
    // feature should never appear on a tier because somebody forgot to look.
    const features = await prisma.feature.findMany({ where: { productId }, select: { id: true } });

    await prisma.tier.create({
      data: {
        productId,
        name,
        basePriceCents: dollarsToCents(basePriceDollars),
        sortOrder: count,
        availabilities: {
          create: features.map((f) => ({ featureId: f.id, availability: "NOT_AVAILABLE" as const })),
        },
      },
    });
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function updateTierPrice(input: unknown): Promise<ActionResult> {
  try {
    const { tierId, basePriceDollars } = updateTierPriceSchema.parse(input);
    await prisma.tier.update({
      where: { id: tierId },
      data: { basePriceCents: dollarsToCents(basePriceDollars) },
    });
    // Existing quotes are snapshots and are intentionally left untouched.
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function createFeature(input: unknown): Promise<ActionResult> {
  try {
    const { productId, name } = createFeatureSchema.parse(input);
    const count = await prisma.feature.count({ where: { productId } });
    const tiers = await prisma.tier.findMany({ where: { productId }, select: { id: true } });

    await prisma.feature.create({
      data: {
        productId,
        name,
        sortOrder: count,
        availabilities: {
          create: tiers.map((t) => ({ tierId: t.id, availability: "NOT_AVAILABLE" as const })),
        },
      },
    });
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function setAvailability(input: unknown): Promise<ActionResult> {
  try {
    const parsed = setAvailabilitySchema.parse(input);
    const { featureId, tierId, availability } = parsed;

    const isAddon = availability === "ADDON";
    const isPercent = isAddon && parsed.pricingModel === "PERCENT_OF_PRODUCT";

    // Clear pricing whenever the cell is not an add-on, so a feature that was
    // once a $500 add-on and is now "Included" cannot leave a stale price
    // behind to be picked up later.
    const data = {
      availability,
      pricingModel: isAddon ? parsed.pricingModel! : null,
      amountCents:
        isAddon && !isPercent && parsed.amountDollars != null
          ? dollarsToCents(parsed.amountDollars)
          : null,
      percentBps: isPercent && parsed.percent != null ? percentToBps(parsed.percent) : null,
    };

    await prisma.featureAvailability.upsert({
      where: { featureId_tierId: { featureId, tierId } },
      update: data,
      create: { featureId, tierId, ...data },
    });

    return done();
  } catch (e) {
    return fail(e);
  }
}
