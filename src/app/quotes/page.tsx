import Link from "next/link";

import PageErrorState from "@/app/components/PageErrorState";
import { getPageErrorMessage } from "@/lib/errors";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getTerm } from "@/lib/terms";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  try {
    const quotes = await prisma.quote.findMany({ orderBy: { createdAt: "desc" } });

    return (
      <>
        <div className="page-head">
          <h1>Saved quotes</h1>
          <p>
            Each quote has its own link. Anyone with the link can read it — no account needed — and
            the numbers on it never change, even if the catalog does.
          </p>
        </div>

        <div className="card">
          {quotes.length === 0 ? (
            <div className="empty">
              No quotes yet. <Link href="/quotes/new">Build the first one</Link>.
            </div>
          ) : (
            quotes.map((q) => (
              <div className="quote-row" key={q.id}>
                <div>
                  <div className="qname">{q.name}</div>
                  <div className="qmeta">
                    {q.customerName} · {q.productName} ({q.tierName}) · {q.seats}{" "}
                    {q.seats === 1 ? "seat" : "seats"} · {getTerm(q.termKey).label}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div className="qtotal num">{formatCents(q.totalCents)}</div>
                  <Link href={`/quotes/${q.publicId}`} className="btn ghost">
                    Open
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </>
    );
  } catch (error) {
    console.error(error);
    return (
      <>
        <div className="page-head">
          <h1>Saved quotes</h1>
        </div>
        <PageErrorState
          title="Saved quotes could not be loaded"
          message={getPageErrorMessage(error)}
          primaryHref="/quotes/new"
          primaryLabel="Build a quote"
          secondaryHref="/"
          secondaryLabel="Go home"
        />
      </>
    );
  }
}
