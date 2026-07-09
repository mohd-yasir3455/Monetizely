import Link from "next/link";

import PageErrorState from "@/app/components/PageErrorState";
import { getDashboardCounts } from "@/lib/data";
import { getPageErrorMessage } from "@/lib/errors";

export default async function HomePage() {
  try {
    const { productCount, quoteCount } = await getDashboardCounts();

    return (
      <>
        <div className="hero-panel">
          <div className="hero-copy">
            <div className="hero-kicker">Monetizely workspace</div>
            <h1>Turn pricing logic into a quote a client can trust.</h1>
            <p>
              Build pricing models, pick a package, and generate a shareable quote with visible math
              instead of spreadsheet guesswork.
            </p>
            <div className="hero-actions">
              <Link href="/quotes/new" className="btn">
                Build a quote
              </Link>
              <Link href="/catalog" className="btn ghost">
                Open catalog
              </Link>
            </div>
          </div>

          <div className="hero-metrics">
            <div className="hero-metric">
              <span>Products configured</span>
              <strong className="num">{productCount}</strong>
            </div>
            <div className="hero-metric">
              <span>Quotes saved</span>
              <strong className="num">{quoteCount}</strong>
            </div>
            <div className="hero-metric">
              <span>Best for</span>
              <strong>Transparent pricing breakdowns</strong>
            </div>
          </div>
        </div>

        <div className="home-grid">
          <div className="card">
            <div className="card-head">
              <h2>What you do here</h2>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              Configure products, tiers, and feature pricing. Then turn that catalog into a clean
              proposal with seat counts, terms, add-ons, discounts, and a breakdown someone can
              audit.
            </p>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Right now</h2>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              The catalog currently holds <strong className="num">{productCount}</strong>{" "}
              {productCount === 1 ? "product" : "products"}, and{" "}
              <strong className="num">{quoteCount}</strong>{" "}
              {quoteCount === 1 ? "quote has" : "quotes have"} been saved.
            </p>
          </div>
        </div>
      </>
    );
  } catch (error) {
    console.error(error);
    return (
      <>
        <div className="page-head">
          <h1>Quoting tool</h1>
        </div>
        <PageErrorState
          title="The app could not load its dashboard"
          message={getPageErrorMessage(error)}
          primaryHref="/catalog"
          primaryLabel="Open catalog"
        />
      </>
    );
  }
}
