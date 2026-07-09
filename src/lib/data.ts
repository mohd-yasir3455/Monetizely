import { unstable_cache } from "next/cache";

import { prisma } from "./prisma";

export const CACHE_TAGS = {
  catalog: "catalog",
  quotes: "quotes",
  home: "home",
} as const;

export const getDashboardCounts = unstable_cache(
  async () => {
    const [productCount, quoteCount] = await Promise.all([
      prisma.product.count(),
      prisma.quote.count(),
    ]);

    return { productCount, quoteCount };
  },
  ["dashboard-counts"],
  {
    revalidate: 300,
    tags: [CACHE_TAGS.home, CACHE_TAGS.catalog, CACHE_TAGS.quotes],
  },
);

export const getCatalogProducts = unstable_cache(
  async () =>
    prisma.product.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        tiers: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        features: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { availabilities: true },
        },
      },
    }),
  ["catalog-products"],
  {
    revalidate: 300,
    tags: [CACHE_TAGS.catalog],
  },
);

export const getQuoteBuilderProducts = unstable_cache(
  async () =>
    prisma.product.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        tiers: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: {
            availabilities: { include: { feature: true } },
          },
        },
      },
    }),
  ["quote-builder-products"],
  {
    revalidate: 300,
    tags: [CACHE_TAGS.catalog],
  },
);

export const getSavedQuotes = unstable_cache(
  async () =>
    prisma.quote.findMany({
      orderBy: { createdAt: "desc" },
    }),
  ["saved-quotes"],
  {
    revalidate: 300,
    tags: [CACHE_TAGS.quotes],
  },
);

export function getQuoteByPublicId(publicId: string) {
  return unstable_cache(
    async () =>
      prisma.quote.findUnique({
        where: { publicId },
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
      }),
    ["quote-by-public-id", publicId],
    {
      revalidate: 3600,
      tags: [CACHE_TAGS.quotes, `quote:${publicId}`],
    },
  )();
}
