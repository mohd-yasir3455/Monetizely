import type { Metadata } from "next";
import Link from "next/link";
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

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

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
      <div className="doc-shell">
        <Link href="/quotes" className="doc-back">
          ← All quotes
        </Link>

        <article className="doc">
          <header className="doc-head">
            <div>
              <div className="eyebrow">Quote</div>
              <h1>{quote.name}</h1>
            </div>
            <div className="doc-validity">
              Valid until {asDate(quote.validUntil).toLocaleDateString("en-US", dateFormat)}
            </div>
          </header>

          <div className="doc-body">
            <div className="doc-meta-grid">
              <section className="doc-meta-card">
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
                    <div className="v">
                      {asDate(quote.createdAt).toLocaleDateString("en-US", dateFormat)}
                    </div>
                  </div>
                  <div>
                    <div className="k">Valid until</div>
                    <div className="v">
                      {asDate(quote.validUntil).toLocaleDateString("en-US", dateFormat)}
                    </div>
                  </div>
                </div>
              </section>

              <section className="doc-meta-card">
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
              </section>
            </div>

            <section className="doc-ledger">
              <div className="doc-ledger-head">
                <h2 className="doc-section">Cost breakdown</h2>
                <div className="doc-ledger-caption">
                  Every line shows the pricing math used to reach the amount.
                </div>
              </div>

              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Line item</th>
                    <th>How it was calculated</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lineItems.map((li) => (
                    <tr key={li.id} className={li.kind === "DISCOUNT" ? "discount" : undefined}>
                      <td className="item">
                        <div className="doc-line-label">{li.label}</div>
                      </td>
                      <td>
                        <div className="calc">{li.calculation}</div>
                      </td>
                      <td className="amount">{formatCents(li.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="total">
                    <td colSpan={2}>Total</td>
                    <td className="amount">{formatCents(quote.totalCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <p className="doc-footnote">
              This link is shareable and read-only. Prices are in USD, exclude tax, and show
              add-ons separately from any term discount applied to the base product.
            </p>
          </div>
        </article>
      </div>
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
