import PageErrorState from "@/app/components/PageErrorState";
import { getCatalogProducts } from "@/lib/data";
import { getPageErrorMessage } from "@/lib/errors";

import CatalogClient, { type CatalogProduct } from "./CatalogClient";

export const dynamic = "force-dynamic";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  try {
    console.log("[CatalogPage] rendering catalog page");
    const { product: selectedId } = await searchParams;
    console.log("[CatalogPage] resolved search params", { selectedId });

    const products = await getCatalogProducts();
    console.log("[CatalogPage] loaded catalog products", {
      productCount: products.length,
      productIds: products.map((product) => product.id),
    });

    const serialized: CatalogProduct[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      tiers: p.tiers.map((t) => ({ id: t.id, name: t.name, basePriceCents: t.basePriceCents })),
      features: p.features.map((f) => ({
        id: f.id,
        name: f.name,
        cells: Object.fromEntries(
          f.availabilities.map((a) => [
            a.tierId,
            {
              availability: a.availability,
              pricingModel: a.pricingModel,
              amountCents: a.amountCents,
              percentBps: a.percentBps,
            },
          ]),
        ),
      })),
    }));
    console.log("[CatalogPage] serialized catalog payload", {
      selectedId,
      serializedProductCount: serialized.length,
      tierCounts: serialized.map((product) => ({
        id: product.id,
        tiers: product.tiers.length,
        features: product.features.length,
      })),
    });

    return (
      <>
        <div className="catalog-head">
          <div className="catalog-head-copy">
            <div className="catalog-kicker">Products &amp; tiers</div>
            <h1>Catalog Management</h1>
          </div>
          <div className="catalog-head-note">
            Define what the client sells. Every feature sits in one of three states on every tier,
            and add-ons are priced per tier, so the same feature can cost more on Growth than on
            Enterprise.
          </div>
        </div>
        <CatalogClient products={serialized} initialProductId={selectedId} />
      </>
    );
  } catch (error) {
    console.log("[CatalogPage] failed to load catalog page");
    console.error(error);
    return (
      <>
        <div className="page-head">
          <h1>Catalog</h1>
        </div>
        <PageErrorState
          title="The catalog is unavailable"
          message={getPageErrorMessage(error)}
          primaryHref="/"
          primaryLabel="Go home"
        />
      </>
    );
  }
}
