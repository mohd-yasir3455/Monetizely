/**
 * Seeds the Acme Analytics catalog exactly as it appears in
 * catalog-example.xlsx, so the deployed app is usable the moment it loads.
 *
 * Idempotent: safe to run repeatedly. It upserts rather than duplicating.
 */

import { PrismaClient, type Availability, type PricingModel } from "@prisma/client";

const prisma = new PrismaClient();

type Cell =
  | { availability: "INCLUDED" | "NOT_AVAILABLE" }
  | { availability: "ADDON"; pricingModel: "FIXED_MONTHLY" | "PER_SEAT"; amountCents: number }
  | { availability: "ADDON"; pricingModel: "PERCENT_OF_PRODUCT"; percentBps: number };

const INCLUDED: Cell = { availability: "INCLUDED" };
const NONE: Cell = { availability: "NOT_AVAILABLE" };
const fixed = (dollars: number): Cell => ({
  availability: "ADDON",
  pricingModel: "FIXED_MONTHLY",
  amountCents: dollars * 100,
});
const perSeat = (dollars: number): Cell => ({
  availability: "ADDON",
  pricingModel: "PER_SEAT",
  amountCents: dollars * 100,
});
const percent = (pct: number): Cell => ({
  availability: "ADDON",
  pricingModel: "PERCENT_OF_PRODUCT",
  percentBps: pct * 100,
});

const TIERS = [
  { name: "Starter", basePriceCents: 2_500 },
  { name: "Growth", basePriceCents: 5_000 },
  { name: "Enterprise", basePriceCents: 10_000 },
];

const MATRIX: Array<{ feature: string; cells: Record<string, Cell> }> = [
  {
    feature: "Real-time dashboards",
    cells: { Starter: INCLUDED, Growth: INCLUDED, Enterprise: INCLUDED },
  },
  {
    feature: "Custom reports",
    cells: { Starter: NONE, Growth: INCLUDED, Enterprise: INCLUDED },
  },
  {
    feature: "API access",
    cells: { Starter: NONE, Growth: perSeat(50), Enterprise: INCLUDED },
  },
  {
    feature: "Single Sign-On (SSO)",
    cells: { Starter: NONE, Growth: fixed(200), Enterprise: INCLUDED },
  },
  {
    feature: "Advanced anomaly detection",
    cells: { Starter: NONE, Growth: percent(10), Enterprise: INCLUDED },
  },
  {
    feature: "Dedicated support",
    cells: { Starter: NONE, Growth: NONE, Enterprise: INCLUDED },
  },
  {
    feature: "White-label option",
    // Cheaper on Enterprise than on Growth. This is the point of the example.
    cells: { Starter: NONE, Growth: fixed(500), Enterprise: fixed(300) },
  },
  {
    feature: "Custom integrations",
    // Different *pricing model* per tier, not just a different number.
    cells: { Starter: NONE, Growth: fixed(1000), Enterprise: percent(5) },
  },
];

async function main() {
  console.log("Seeding Acme Analytics catalog...");

  const product = await prisma.product.upsert({
    where: { name: "Analytics Suite" },
    update: {},
    create: { name: "Analytics Suite" },
  });

  const tiers: Record<string, string> = {};
  for (const [i, t] of TIERS.entries()) {
    const tier = await prisma.tier.upsert({
      where: { productId_name: { productId: product.id, name: t.name } },
      update: { basePriceCents: t.basePriceCents, sortOrder: i },
      create: {
        productId: product.id,
        name: t.name,
        basePriceCents: t.basePriceCents,
        sortOrder: i,
      },
    });
    tiers[t.name] = tier.id;
  }

  for (const [i, row] of MATRIX.entries()) {
    const feature = await prisma.feature.upsert({
      where: { productId_name: { productId: product.id, name: row.feature } },
      update: { sortOrder: i },
      create: { productId: product.id, name: row.feature, sortOrder: i },
    });

    for (const [tierName, cell] of Object.entries(row.cells)) {
      const tierId = tiers[tierName];
      const data = {
        availability: cell.availability as Availability,
        pricingModel:
          "pricingModel" in cell ? (cell.pricingModel as PricingModel) : null,
        amountCents: "amountCents" in cell ? cell.amountCents : null,
        percentBps: "percentBps" in cell ? cell.percentBps : null,
      };

      await prisma.featureAvailability.upsert({
        where: { featureId_tierId: { featureId: feature.id, tierId } },
        update: data,
        create: { featureId: feature.id, tierId, ...data },
      });
    }
  }

  console.log(`Seeded "${product.name}" with ${TIERS.length} tiers and ${MATRIX.length} features.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
