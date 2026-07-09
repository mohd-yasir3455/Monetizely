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
    const { product: selectedId } = await searchParams;

    const products = await getCatalogProducts();

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

    return (
      <>
        <div className="page-head">
          <h1>Catalog</h1>
          <p>
            Define what the client sells. Every feature sits in one of three states on every tier,
            and add-ons are priced per tier — the same feature can cost more on Growth than on
            Enterprise.
          </p>
        </div>
        <CatalogClient products={serialized} initialProductId={selectedId} />
      </>
    );
  } catch (error) {
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
