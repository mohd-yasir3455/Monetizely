import Link from "next/link";

import { prisma } from "@/lib/prisma";

import QuoteBuilder, { type BuilderProduct } from "./QuoteBuilder";

export const dynamic = "force-dynamic";

export default async function NewQuotePage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      tiers: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          availabilities: { include: { feature: true } },
        },
      },
    },
  });

  const usable: BuilderProduct[] = products
    .filter((p) => p.tiers.length > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      tiers: p.tiers.map((t) => ({
        id: t.id,
        name: t.name,
        basePriceCents: t.basePriceCents,
        included: t.availabilities
          .filter((a) => a.availability === "INCLUDED")
          .map((a) => ({ id: a.featureId, name: a.feature.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        addons: t.availabilities
          .filter((a) => a.availability === "ADDON" && a.pricingModel !== null)
          .map((a) => ({
            id: a.featureId,
            name: a.feature.name,
            pricingModel: a.pricingModel!,
            amountCents: a.amountCents,
            percentBps: a.percentBps,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      })),
    }));

  if (usable.length === 0) {
    return (
      <>
        <div className="page-head">
          <h1>Build a quote</h1>
        </div>
        <div className="card">
          <div className="empty">
            No product has a tier yet. <Link href="/catalog">Set up the catalog</Link> first.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Build a quote</h1>
        <p>
          Only what the catalog allows on the chosen tier can be selected. Included features come at
          no cost; unavailable ones never appear.
        </p>
      </div>
      <QuoteBuilder products={usable} />
    </>
  );
}
