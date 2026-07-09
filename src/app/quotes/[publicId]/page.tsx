import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PageErrorState from "@/app/components/PageErrorState";
import { getQuoteByPublicId } from "@/lib/data";
import { getPageErrorMessage } from "@/lib/errors";
import { formatBps, formatCents } from "@/lib/money";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  let quote = null;

  try {
    quote = await getQuoteByPublicId(publicId);
  } catch {
    return { title: "Quote unavailable" };
  }

  return { title: quote ? quote.name : "Quote not found" };
}

const dateFormat: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

export default async function QuotePage({ params }: { params: Promise<{ publicId: string }> }) {
  try {
    const { publicId } = await params;
    const quote = await getQuoteByPublicId(publicId);
    if (!quote) notFound();

    const termLabel =
      quote.termDiscountBps === 0
        ? `${quote.termKey === "MONTHLY" ? "Monthly" : quote.termKey} (${quote.termMonths} months)`
        : `${quote.termKey === "ANNUAL" ? "Annual" : "Two-year"} (${quote.termMonths} months, ${formatBps(
            quote.termDiscountBps,
          )} discount on the per-seat price)`;

    return (
      <article className="doc">
        <header className="doc-head">
          <div>
            <div className="eyebrow">Quote</div>
            <h1>{quote.name}</h1>
          </div>
          <div className="doc-total-card">
            <span>Total</span>
            <strong className="num">{formatCents(quote.totalCents)}</strong>
          </div>
        </header>

        <div className="doc-body">
          <div className="doc-summary-strip">
            <div className="doc-summary-chip">
              <span>Customer</span>
              <strong>{quote.customerName}</strong>
            </div>
            <div className="doc-summary-chip">
              <span>Product</span>
              <strong>
                {quote.productName} · {quote.tierName}
              </strong>
            </div>
            <div className="doc-summary-chip">
              <span>Term</span>
              <strong>{termLabel}</strong>
            </div>
          </div>

          <h2 className="doc-section">Quote details</h2>
          <div className="doc-fields">
            <div>
              <div className="k">Customer</div>
              <div className="v">{quote.customerName}</div>
            </div>
            <div>
              <div className="k">Quote name</div>
              <div className="v">{quote.name}</div>
            </div>
            <div>
              <div className="k">Quote date</div>
              <div className="v">{quote.createdAt.toLocaleDateString("en-US", dateFormat)}</div>
            </div>
            <div>
              <div className="k">Valid until</div>
              <div className="v">{quote.validUntil.toLocaleDateString("en-US", dateFormat)}</div>
            </div>
          </div>

          <h2 className="doc-section">What is being purchased</h2>
          <div className="doc-fields">
            <div>
              <div className="k">Product</div>
              <div className="v">{quote.productName}</div>
            </div>
            <div>
              <div className="k">Tier</div>
              <div className="v">{quote.tierName}</div>
            </div>
            <div>
              <div className="k">Seats</div>
              <div className="v num">{quote.seats}</div>
            </div>
            <div>
              <div className="k">Term length</div>
              <div className="v">{termLabel}</div>
            </div>
          </div>

          <h2 className="doc-section">Cost breakdown</h2>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Line item &amp; how it was calculated</th>
                <th className="right">Amount (USD)</th>
              </tr>
            </thead>
            <tbody>
              {quote.lineItems.map((li) => (
                <tr key={li.id} className={li.kind === "DISCOUNT" ? "discount" : undefined}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{li.label}</div>
                    <div className="calc">{li.calculation}</div>
                  </td>
                  <td className="amount">{formatCents(li.amountCents)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Total</td>
                <td className="amount">{formatCents(quote.totalCents)}</td>
              </tr>
            </tbody>
          </table>

          <p className="muted" style={{ marginTop: 18 }}>
            All amounts in USD. Prices exclude tax. Add-on charges are not affected by the
            term-length discount.
          </p>
        </div>
      </article>
    );
  } catch (error) {
    console.error(error);
    return (
      <PageErrorState
        title="This quote is unavailable"
        message={getPageErrorMessage(error)}
        primaryHref="/quotes"
        primaryLabel="Back to saved quotes"
        secondaryHref="/"
        secondaryLabel="Go home"
      />
    );
  }
}
