"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { formatCentsCompact } from "@/lib/money";

import {
  createFeature,
  createProduct,
  createTier,
  setAvailability,
  updateTierPrice,
  type ActionResult,
} from "./actions";

type Availability = "INCLUDED" | "ADDON" | "NOT_AVAILABLE";
type PricingModel = "FIXED_MONTHLY" | "PER_SEAT" | "PERCENT_OF_PRODUCT";

interface Cell {
  availability: Availability;
  pricingModel: PricingModel | null;
  amountCents: number | null;
  percentBps: number | null;
}

export interface CatalogProduct {
  id: string;
  name: string;
  tiers: { id: string; name: string; basePriceCents: number }[];
  features: { id: string; name: string; cells: Record<string, Cell | undefined> }[];
}

const AVAILABILITY_LABEL: Record<Availability, string> = {
  INCLUDED: "Included",
  ADDON: "Add-on",
  NOT_AVAILABLE: "Not available",
};

const MODEL_LABEL: Record<PricingModel, string> = {
  FIXED_MONTHLY: "Fixed monthly price",
  PER_SEAT: "Per-seat price",
  PERCENT_OF_PRODUCT: "Percentage of product price",
};

function describeCell(cell: Cell | undefined): string {
  if (!cell || cell.availability !== "ADDON" || !cell.pricingModel) return "—";
  switch (cell.pricingModel) {
    case "FIXED_MONTHLY":
      return `${formatCentsCompact(cell.amountCents ?? 0)} / month, flat`;
    case "PER_SEAT":
      return `${formatCentsCompact(cell.amountCents ?? 0)} / seat / month`;
    case "PERCENT_OF_PRODUCT":
      return `${(cell.percentBps ?? 0) / 100}% of product cost`;
  }
}

export default function CatalogClient({
  products,
  initialProductId,
}: {
  products: CatalogProduct[];
  initialProductId?: string;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(initialProductId ?? products[0]?.id ?? "");
  const product = useMemo(
    () => products.find((p) => p.id === productId) ?? products[0],
    [products, productId],
  );

  const [tierId, setTierId] = useState<string>(product?.tiers[0]?.id ?? "");
  const tier = product?.tiers.find((t) => t.id === tierId) ?? product?.tiers[0];
  const activeTierId = tier?.id ?? "";

  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const [showProductForm, setShowProductForm] = useState(products.length === 0);
  const [showTierForm, setShowTierForm] = useState(false);
  const [showFeatureForm, setShowFeatureForm] = useState(false);
  const [editingTierPrice, setEditingTierPrice] = useState(false);
  const [editingCell, setEditingCell] = useState<string | null>(null);

  function run(fn: () => Promise<ActionResult>, onSuccess?: () => void) {
    setErrors([]);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        onSuccess?.();
        router.refresh();
      }
      else setErrors(result.errors);
    });
  }

  if (products.length === 0 && !showProductForm) {
    return (
      <div className="card">
        <div className="empty">
          No products yet.{" "}
          <button className="link" onClick={() => setShowProductForm(true)}>
            Add the first one
          </button>
          .
        </div>
      </div>
    );
  }

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

      {/* ---------------------------------------------------------- products */}
      <section className="card">
        <div className="card-head">
          <h2>Products</h2>
          <button className="ghost sm" onClick={() => setShowProductForm((v) => !v)}>
            {showProductForm ? "Cancel" : "Add product"}
          </button>
        </div>

        {showProductForm && (
          <InlineForm
            fields={[{ name: "name", placeholder: "Product name", type: "text", autoFocus: true }]}
            submitLabel="Add product"
            pending={pending}
            onSubmit={(values) =>
              run(
                () => createProduct({ name: values.name }),
                () => setShowProductForm(false),
              )
            }
          />
        )}

        {products.length > 0 && (
          <div className="pills" style={{ marginTop: showProductForm ? 14 : 0 }}>
            {products.map((p) => (
              <button
                key={p.id}
                className="pill"
                aria-pressed={p.id === product?.id}
                onClick={() => {
                  setProductId(p.id);
                  setTierId(p.tiers[0]?.id ?? "");
                  setEditingCell(null);
                }}
              >
                <span className="pill-name">{p.name}</span>
                <span className="pill-sub">
                  {p.tiers.length} {p.tiers.length === 1 ? "tier" : "tiers"} · {p.features.length}{" "}
                  {p.features.length === 1 ? "feature" : "features"}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {product && (
        <>
          {/* ------------------------------------------------------- tiers */}
          <section className="card">
            <div className="card-head">
              <h2>Tiers &amp; base price</h2>
              <button className="ghost sm" onClick={() => setShowTierForm((v) => !v)}>
                {showTierForm ? "Cancel" : "Add tier"}
              </button>
            </div>

            {showTierForm && (
              <InlineForm
                fields={[
                  { name: "name", placeholder: "Tier name", type: "text", autoFocus: true },
                  { name: "price", placeholder: "$ per seat / month", type: "number" },
                ]}
                submitLabel="Add tier"
                pending={pending}
                onSubmit={(values) =>
                  run(
                    () =>
                      createTier({
                        productId: product.id,
                        name: values.name,
                        basePriceDollars: values.price,
                      }),
                    () => setShowTierForm(false),
                  )
                }
              />
            )}

            {product.tiers.length === 0 ? (
              <p className="muted">Add a tier to start building the feature matrix.</p>
            ) : (
              <div className="pills" style={{ marginTop: showTierForm ? 14 : 0 }}>
                {product.tiers.map((t) => (
                  <button
                    key={t.id}
                    className="pill"
                    aria-pressed={t.id === activeTierId}
                    onClick={() => {
                      setTierId(t.id);
                      setEditingCell(null);
                      setEditingTierPrice(false);
                    }}
                  >
                    <span className="pill-name">{t.name}</span>
                    <span className="pill-sub num">
                      {formatCentsCompact(t.basePriceCents)} / seat / month
                    </span>
                  </button>
                ))}
              </div>
            )}

            {tier && (
              <div style={{ marginTop: 14 }}>
                {editingTierPrice ? (
                  <InlineForm
                    fields={[
                      {
                        name: "price",
                        placeholder: "$ per seat / month",
                        type: "number",
                        defaultValue: String(tier.basePriceCents / 100),
                        autoFocus: true,
                      },
                    ]}
                    submitLabel="Save price"
                    pending={pending}
                    onCancel={() => setEditingTierPrice(false)}
                    onSubmit={(values) =>
                      run(
                        () => updateTierPrice({ tierId: tier.id, basePriceDollars: values.price }),
                        () => setEditingTierPrice(false),
                      )
                    }
                  />
                ) : (
                  <button className="link" onClick={() => setEditingTierPrice(true)}>
                    Edit {tier.name} base price
                  </button>
                )}
              </div>
            )}
          </section>

          {/* ---------------------------------------------------- features */}
          <section className="card">
            <div className="card-head">
              <h2>{tier ? `Features on ${tier.name}` : "Features"}</h2>
              <button
                className="ghost sm"
                disabled={product.tiers.length === 0}
                onClick={() => setShowFeatureForm((v) => !v)}
              >
                {showFeatureForm ? "Cancel" : "Add feature"}
              </button>
            </div>

            {showFeatureForm && (
              <InlineForm
                fields={[
                  { name: "name", placeholder: "Feature name", type: "text", autoFocus: true },
                ]}
                submitLabel="Add feature"
                pending={pending}
                onSubmit={(values) =>
                  run(
                    () => createFeature({ productId: product.id, name: values.name }),
                    () => setShowFeatureForm(false),
                  )
                }
              />
            )}

            {!tier ? (
              <p className="muted">Add a tier first.</p>
            ) : product.features.length === 0 ? (
              <p className="muted">No features yet. Add one to build the matrix.</p>
            ) : (
              <table style={{ marginTop: showFeatureForm ? 14 : 0 }}>
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th style={{ width: 150 }}>On {tier.name}</th>
                    <th>Add-on price</th>
                  </tr>
                </thead>
                <tbody>
                  {product.features.map((f) => {
                    const cell = f.cells[activeTierId];
                    const availability = cell?.availability ?? "NOT_AVAILABLE";
                    const isEditing = editingCell === f.id;

                    return (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 500 }}>{f.name}</td>
                        <td>
                          <button
                            className={`badge ${availability}`}
                            aria-expanded={isEditing}
                            onClick={() => setEditingCell(isEditing ? null : f.id)}
                          >
                            {AVAILABILITY_LABEL[availability]}
                          </button>
                        </td>
                        <td>
                          {isEditing ? (
                            <CellEditor
                              cell={cell}
                              pending={pending}
                              onCancel={() => setEditingCell(null)}
                              onSave={(payload) =>
                                run(
                                  () =>
                                    setAvailability({
                                      featureId: f.id,
                                      tierId: activeTierId,
                                      ...payload,
                                    }),
                                  () => setEditingCell(null),
                                )
                              }
                            />
                          ) : (
                            <span className="muted num">{describeCell(cell)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <p className="muted" style={{ marginTop: 14 }}>
              Click a status to change it. Setting a feature to <strong>Add-on</strong> asks for its
              pricing model and price <em>on this tier only</em>.
            </p>
          </section>
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

interface FieldSpec {
  name: string;
  placeholder: string;
  type: "text" | "number";
  defaultValue?: string;
  autoFocus?: boolean;
}

function InlineForm({
  fields,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  fields: FieldSpec[];
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: Record<string, string>) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ""])),
  );

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
        background: "var(--paper)",
        border: "1px dashed var(--rule)",
        borderRadius: "var(--radius-sm)",
        padding: 12,
      }}
    >
      {fields.map((f) => (
        <input
          key={f.name}
          type={f.type}
          step={f.type === "number" ? "0.01" : undefined}
          min={f.type === "number" ? 0 : undefined}
          autoFocus={f.autoFocus}
          placeholder={f.placeholder}
          aria-label={f.placeholder}
          value={values[f.name]}
          onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit(values);
          }}
          style={{ width: f.type === "number" ? 170 : 220 }}
        />
      ))}
      <button className="sm" disabled={pending} onClick={() => onSubmit(values)}>
        {pending ? "Saving…" : submitLabel}
      </button>
      {onCancel && (
        <button className="ghost sm" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface CellPayload {
  availability: Availability;
  pricingModel?: PricingModel | null;
  amountDollars?: number | null;
  percent?: number | null;
}

function CellEditor({
  cell,
  pending,
  onSave,
  onCancel,
}: {
  cell: Cell | undefined;
  pending: boolean;
  onSave: (payload: CellPayload) => void;
  onCancel: () => void;
}) {
  const [availability, setAvailabilityState] = useState<Availability>(
    cell?.availability ?? "NOT_AVAILABLE",
  );
  const [model, setModel] = useState<PricingModel>(cell?.pricingModel ?? "FIXED_MONTHLY");
  const [amount, setAmount] = useState(
    cell?.amountCents != null ? String(cell.amountCents / 100) : "",
  );
  const [percent, setPercent] = useState(
    cell?.percentBps != null ? String(cell.percentBps / 100) : "",
  );

  const isPercent = model === "PERCENT_OF_PRODUCT";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: "var(--paper)",
        border: "1px dashed var(--rule)",
        borderRadius: "var(--radius-sm)",
        padding: 12,
      }}
    >
      <select
        aria-label="Availability"
        value={availability}
        onChange={(e) => setAvailabilityState(e.target.value as Availability)}
      >
        {(Object.keys(AVAILABILITY_LABEL) as Availability[]).map((a) => (
          <option key={a} value={a}>
            {AVAILABILITY_LABEL[a]}
          </option>
        ))}
      </select>

      {availability === "ADDON" && (
        <>
          <select
            aria-label="Pricing model"
            value={model}
            onChange={(e) => setModel(e.target.value as PricingModel)}
          >
            {(Object.keys(MODEL_LABEL) as PricingModel[]).map((m) => (
              <option key={m} value={m}>
                {MODEL_LABEL[m]}
              </option>
            ))}
          </select>

          {isPercent ? (
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              placeholder="Percent, e.g. 10"
              aria-label="Percent of product cost"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          ) : (
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder={model === "PER_SEAT" ? "$ per seat / month" : "$ per month"}
              aria-label="Add-on price in dollars"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="sm"
          disabled={pending}
          onClick={() =>
            onSave({
              availability,
              pricingModel: availability === "ADDON" ? model : null,
              amountDollars:
                availability === "ADDON" && !isPercent && amount !== "" ? Number(amount) : null,
              percent: availability === "ADDON" && isPercent && percent !== "" ? Number(percent) : null,
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button className="ghost sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
