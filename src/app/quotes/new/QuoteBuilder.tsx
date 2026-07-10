"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { formatCents, formatCentsCompact } from "@/lib/money";
import { computeQuote, type PricingModel, type SelectedAddon } from "@/lib/pricing";
import { TERM_LIST } from "@/lib/terms";

import { createQuote } from "./actions";

interface Addon {
  id: string;
  name: string;
  pricingModel: PricingModel;
  amountCents: number | null;
  percentBps: number | null;
}

export interface BuilderProduct {
  id: string;
  name: string;
  tiers: {
    id: string;
    name: string;
    basePriceCents: number;
    included: { id: string; name: string }[];
    addons: Addon[];
  }[];
}

function describeRate(a: Addon): string {
  switch (a.pricingModel) {
    case "FIXED_MONTHLY":
      return `${formatCentsCompact(a.amountCents ?? 0)} / month, flat`;
    case "PER_SEAT":
      return `${formatCentsCompact(a.amountCents ?? 0)} / seat / month`;
    case "PERCENT_OF_PRODUCT":
      return `${(a.percentBps ?? 0) / 100}% of product cost`;
  }
}

export default function QuoteBuilder({ products }: { products: BuilderProduct[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [productId, setProductId] = useState(products[0].id);
  const product = products.find((p) => p.id === productId)!;

  const [tierId, setTierId] = useState(product.tiers[0].id);
  const tier = product.tiers.find((t) => t.id === tierId) ?? product.tiers[0];

  const [seats, setSeats] = useState("25");
  const [termKey, setTermKey] = useState("ANNUAL");
  const [discount, setDiscount] = useState("0");

  /** featureId -> seat count string (only meaningful for per-seat add-ons) */
  const [selected, setSelected] = useState<Record<string, string>>({});
  const trimmedName = name.trim();
  const trimmedCustomerName = customerName.trim();

  function chooseProduct(id: string) {
    const p = products.find((x) => x.id === id)!;
    setProductId(id);
    setTierId(p.tiers[0].id);
    setSelected({});
  }

  function chooseTier(id: string) {
    setTierId(id);
    // Add-ons are per-tier. Carrying a Growth selection over to Enterprise, where
    // that feature may be included or absent, would be a bug waiting to happen.
    setSelected({});
  }

  function toggleAddon(addon: Addon, on: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      if (on) next[addon.id] = addon.pricingModel === "PER_SEAT" ? "1" : "";
      else delete next[addon.id];
      return next;
    });
  }

  /** A live preview computed with the exact function the server will run. */
  const preview = useMemo(() => {
    const seatNum = Number(seats);
    const discountNum = Number(discount);
    if (!Number.isInteger(seatNum) || seatNum < 1) return null;
    if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > 100) return null;

    const addons: SelectedAddon[] = [];
    for (const addon of tier.addons) {
      if (!(addon.id in selected)) continue;
      const addonSeats = addon.pricingModel === "PER_SEAT" ? Number(selected[addon.id]) : null;
      if (addon.pricingModel === "PER_SEAT" && (!Number.isInteger(addonSeats) || addonSeats! < 1)) {
        return null;
      }
      addons.push({
        featureName: addon.name,
        pricingModel: addon.pricingModel,
        amountCents: addon.amountCents,
        percentBps: addon.percentBps,
        seats: addonSeats,
      });
    }

    try {
      return computeQuote({
        productName: product.name,
        tierName: tier.name,
        basePriceCents: tier.basePriceCents,
        seats: seatNum,
        termKey,
        addons,
        overallDiscountBps: Math.round(discountNum * 100),
      });
    } catch {
      return null;
    }
  }, [product, tier, seats, termKey, discount, selected]);

  function save() {
    setErrors([]);
    startTransition(async () => {
      const result = await createQuote({
        name,
        customerName,
        productId,
        tierId,
        seats,
        termKey,
        overallDiscountPercent: discount,
        addons: Object.entries(selected).map(([featureId, seatValue]) => ({
          featureId,
          seats: seatValue === "" ? null : Number(seatValue),
        })),
      });

      if (result.ok) router.push(`/quotes/${result.publicId}`);
      else setErrors(result.errors);
    });
  }

  const canSave = !pending && preview !== null && trimmedName.length > 0 && trimmedCustomerName.length > 0;
  const selectedAddonCount = preview?.lineItems.filter((li) => li.kind === "ADDON").length ?? 0;
  const discountSummary =
    preview == null
      ? null
      : preview.discountAmountCents > 0
        ? `${discount}% quote discount`
        : "No quote discount";

  return (
    <>
      {errors.length > 0 && (
        <div className="errors" role="alert">
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="builder-banner">
        <div>
          <div className="builder-kicker">Deal workspace</div>
          <h2>Shape the quote, then verify the math live.</h2>
          <p>
            Choose the package on the left. The quote updates in real time on the right with every
            line item and calculation.
          </p>
        </div>
        <div className="builder-banner-stats">
          <div className="builder-stat">
            <span>Product</span>
            <strong>{product.name}</strong>
          </div>
          <div className="builder-stat">
            <span>Tier</span>
            <strong>{tier.name}</strong>
          </div>
          <div className="builder-stat">
            <span>Base rate</span>
            <strong className="num">{formatCentsCompact(tier.basePriceCents)}</strong>
          </div>
        </div>
      </div>

      <div className="quote-builder-layout">
        <div className="quote-builder-main">
          <section className="card builder-card">
            <div className="card-head">
              <h2>Quote &amp; customer</h2>
            </div>
            <div className="grid-2">
              <label className="field">
                <span>Quote name</span>
                <input
                  type="text"
                  value={name}
                  placeholder="Acme Corp - Q3 2026 proposal"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Customer name</span>
                <input
                  type="text"
                  value={customerName}
                  placeholder="Acme Corporation"
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="card builder-card">
            <div className="card-head">
              <h2>Product &amp; tier</h2>
            </div>
            {products.length > 1 && (
              <div className="pills product-pills" style={{ marginBottom: 12 }}>
                {products.map((p) => (
                  <button
                    key={p.id}
                    className="pill"
                    aria-pressed={p.id === productId}
                    onClick={() => chooseProduct(p.id)}
                  >
                    <span className="pill-name">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="pills tier-pills">
              {product.tiers.map((t) => (
                <button
                  key={t.id}
                  className="pill"
                  aria-pressed={t.id === tier.id}
                  onClick={() => chooseTier(t.id)}
                >
                  <span className="pill-name">{t.name}</span>
                  <span className="pill-sub num">
                    {formatCentsCompact(t.basePriceCents)} / seat / month
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="card builder-card">
            <div className="card-head">
              <h2>Seats, term &amp; discount</h2>
            </div>
            <div className="builder-setup-grid">
              <label className="field">
                <span>Product seats</span>
                <input
                  aria-describedby="product-seats-help"
                  type="number"
                  min={1}
                  step={1}
                  value={seats}
                  onChange={(e) => setSeats(e.target.value)}
                />
                <div className="field-help" id="product-seats-help">
                  Base pricing always uses the product seat count.
                </div>
              </label>

              <label className="field">
                <span>Discount</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
                <div className="field-help">Optional percent off the full quote.</div>
              </label>
            </div>

            <div className="field">
              <span className="section-label">Term length</span>
              <div className="pills term-pills">
                {TERM_LIST.map((t) => (
                  <button
                    key={t.key}
                    className="pill"
                    aria-pressed={t.key === termKey}
                    onClick={() => setTermKey(t.key)}
                  >
                    <span className="pill-name">{t.label}</span>
                    <span className="pill-sub num">
                      {t.discountBps === 0 ? "no discount" : `${t.discountBps / 100}% off seats`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="card builder-card">
            <div className="card-head">
              <h2>Features on {tier.name}</h2>
            </div>

            {tier.included.length > 0 && (
              <div className="included-group" style={{ marginBottom: tier.addons.length ? 18 : 0 }}>
                {tier.included.map((f) => (
                  <div className="included-row" key={f.id}>
                    <span aria-hidden>✓</span>
                    <span>
                      <strong>{f.name}</strong> — included at no extra cost
                    </span>
                  </div>
                ))}
              </div>
            )}

            {tier.addons.length === 0 ? (
              <p className="muted">No paid add-ons are offered on {tier.name}.</p>
            ) : (
              <div className="addon-grid">
                {tier.addons.map((addon) => {
                  const on = addon.id in selected;
                  return (
                    <div className={`addon-row addon-card${on ? " is-selected" : ""}`} key={addon.id}>
                      <input
                        type="checkbox"
                        id={`addon-${addon.id}`}
                        checked={on}
                        onChange={(e) => toggleAddon(addon, e.target.checked)}
                      />
                      <label className="addon-main" htmlFor={`addon-${addon.id}`}>
                        <div className="addon-name">{addon.name}</div>
                        <div className="addon-rate num">{describeRate(addon)}</div>
                      </label>
                      {addon.pricingModel === "PER_SEAT" && (
                        <label className="addon-seats">
                          <span>Add-on quantity</span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            disabled={!on}
                            value={selected[addon.id] ?? ""}
                            onChange={(e) =>
                              setSelected((prev) => ({ ...prev, [addon.id]: e.target.value }))
                            }
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <button className="block builder-save" onClick={save} disabled={!canSave} aria-busy={pending}>
            {pending ? "Saving…" : "Save quote"}
          </button>
        </div>

        <aside className="quote-builder-sidebar">
          <section className="card preview-card">
            <div className="card-head">
              <h2>Preview</h2>
            </div>
            {!preview ? (
              <p className="muted">
                Enter valid product seats, add-on quantities, and discount values to see the
                breakdown.
              </p>
            ) : (
              <div className="preview-shell" aria-label="Quote preview">
                <div className="preview-hero">
                  <div>
                    <div className="preview-kicker">Live quote preview</div>
                    <h3>
                      {product.name} · {tier.name}
                    </h3>
                    <p>
                      {seats} product seats · {preview.term.label} term
                    </p>
                  </div>
                  <div className="preview-total">
                    <span>Total</span>
                    <strong className="num">{formatCents(preview.totalCents)}</strong>
                  </div>
                </div>

                <div className="preview-facts">
                  <div className="preview-fact">
                    <span>Seats</span>
                    <strong className="num">{seats}</strong>
                  </div>
                  <div className="preview-fact">
                    <span>Base rate</span>
                    <strong className="num">{formatCentsCompact(tier.basePriceCents)} / seat / month</strong>
                  </div>
                  <div className="preview-fact">
                    <span>Add-ons</span>
                    <strong>{selectedAddonCount === 0 ? "None selected" : `${selectedAddonCount} selected`}</strong>
                  </div>
                  <div className="preview-fact">
                    <span>Discount</span>
                    <strong>{discountSummary}</strong>
                  </div>
                </div>

                <div className="preview-list">
                  {preview.lineItems.map((li) => (
                    <div
                      key={li.label}
                      className={`preview-item${li.kind === "DISCOUNT" ? " is-discount" : ""}`}
                    >
                      <div className="preview-item-head">
                        <div className="preview-main">
                          <div className="preview-label-row">
                            <div className="preview-label">{li.label}</div>
                            <span className={`preview-badge preview-badge-${li.kind.toLowerCase()}`}>
                              {li.kind === "BASE"
                                ? "Base"
                                : li.kind === "ADDON"
                                  ? "Add-on"
                                  : "Discount"}
                            </span>
                          </div>
                          <div className="preview-kind">
                            {li.kind === "BASE"
                              ? "Core subscription charge"
                              : li.kind === "ADDON"
                                ? "Optional feature pricing"
                                : "Applied to the full quote subtotal"}
                          </div>
                        </div>
                        <strong className="preview-amount num">{formatCents(li.amountCents)}</strong>
                      </div>
                      <div className="calc preview-calc">{li.calculation}</div>
                    </div>
                  ))}
                </div>

                <div className="preview-footer">
                  <div className="preview-footer-row">
                    <span>Subtotal before overall discount</span>
                    <strong className="num">{formatCents(preview.subtotalCents)}</strong>
                  </div>
                  {preview.discountAmountCents > 0 && (
                    <div className="preview-footer-row">
                      <span>Overall discount applied</span>
                      <strong className="num">-{formatCents(preview.discountAmountCents)}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
