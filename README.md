# Quoting tool

A small quoting application: set up a client's product catalog, then build a quote for one of their
customers and share it as a read-only link.

- **Live app:** _(add your Vercel URL here)_
- **Example quote:** _(add a shared quote URL here)_

Built with Next.js 15 (App Router), TypeScript, Postgres, and Prisma.

---

## Running it locally

You need Node 20+ and a Postgres database. [Neon](https://neon.tech) has a free tier and is what the
deployed version uses.

```bash
git clone <this repo>
cd monetizely-quoting-tool
npm install

cp .env.example .env
# Fill in DATABASE_URL and DIRECT_URL from your Postgres provider.

npm run db:push    # create the tables
npm run db:seed    # load the Acme Analytics catalog from catalog-example.xlsx
npm run dev        # http://localhost:3000
```

### Tests

```bash
npm test           # unit tests: the pricing engine
npm run test:e2e   # end-to-end: catalog entry -> quote -> shared quote URL
```

The unit suite (23 tests) covers all three add-on pricing models, both discount types, rounding
behaviour, and the invalid-input paths. One test reproduces `sample-quote.xlsx` line for line and
asserts the total is exactly $18,150.

The e2e suite drives a real browser through the whole flow: it adds a new feature to the seeded
catalog, prices it as an add-on on Growth, sells it in a quote alongside a per-seat add-on with an
independent seat count, opens the resulting share URL in a fresh browser context with no session, and
confirms the numbers. A second e2e test edits a tier's price afterwards and asserts the already-saved
quote is unchanged.

`npm run test:e2e` builds and starts the app itself, and writes to whatever `DATABASE_URL` points at.
Point it at a scratch database, not production.

---

## Deploying to Vercel

1. **Create a Postgres database.** On Neon, create a project and copy both connection strings: the
   pooled one (host contains `-pooler`) and the direct one.
2. **Push this repo to GitHub**, then import it in Vercel.
3. **Set environment variables** in Vercel (Project → Settings → Environment Variables):
   - `DATABASE_URL` → the **pooled** connection string
   - `DIRECT_URL` → the **direct** connection string
4. **Deploy.** The build script runs `prisma generate` before `next build`, so the client is always
   generated against the current schema.
5. **Create the tables and seed once**, from your machine, with the same `.env` values:
   ```bash
   npm run db:push
   npm run db:seed
   ```

Two connection strings, not one: serverless functions open and drop connections constantly, so runtime
queries go through the pooler, while `prisma db push` needs a direct session to issue DDL. Getting
this wrong is the usual reason a Prisma app builds fine on Vercel and then times out on first query.

---

## How the pricing works

All money is stored and computed in **integer cents**, and all percentages in **basis points**
(1500 bps = 15%). Floating-point dollars drift, and a quoting tool that is a cent off is a quoting
tool nobody trusts. Rounding is half-away-from-zero, applied once, immediately after each percentage
operation.

The engine lives in [`src/lib/pricing.ts`](src/lib/pricing.ts) and is a pure function: no database, no
React, no I/O. Given what the customer is buying, it returns the line items — including the
human-readable calculation string shown on the quote. That means "the math has to be right and
visible" is enforced by unit tests rather than by looking at a screenshot, and the browser's live
preview runs the *same function* the server uses to save, so they cannot disagree.

```
base product   = seats × base price × months × (1 − term discount)

add-ons, each priced by its model, on the tier the customer is on:
  fixed monthly       = price × months
  per seat            = add-on seats × price × months     (add-on seats ≠ product seats)
  % of product price  = percent × base product cost

subtotal       = base + all add-ons
total          = subtotal − (overall discount % × subtotal)
```

---

## Assumptions

Things the brief did not state, which I decided and would happily revisit.

**The term discount applies only to the base product line, never to add-ons.** The brief says the
discount is "on the per-seat price", and the worked example in `sample-quote.xlsx` confirms it: that
quote is annual, yet the $200/month SSO add-on bills at the full $2,400 and the API access add-on at
the full $3,000. Neither is reduced by 15%.

**The term discount is applied to the base line total, not to the per-seat rate.** These are
algebraically identical but round differently. Discounting a $33.33 seat rate and then multiplying
compounds a rounding error once per seat; discounting the total rounds once. I discount the total,
which matches the sample quote exactly. There's a unit test pinning this.

**A quote is a snapshot, frozen at save time.** Saved quotes store names, rates, computed cents and
the calculation strings directly — no foreign keys back into the catalog. If an analyst edits a tier's
base price tomorrow, a quote a customer already has a link to must not silently change underneath
them. The brief says quotes can't be edited after saving, and a quote that rewrites itself is an edit.
There's an e2e test for this.

**Add-on seats are independent of product seats.** Called out explicitly in `sample-quote.xlsx` (25
product seats, 5 API access seats) and implemented that way. Per-seat add-ons default to 1 seat, not
to the product's seat count, so nobody accidentally sells 25 seats of something by not looking.

**Changing tier wipes the add-on selection.** Add-ons are priced per tier, and the same feature can be
included on one tier and unavailable on another. Carrying a Growth selection over to Enterprise would
be a bug waiting to happen, so the selection resets.

**New tiers and features default to "Not available" everywhere.** A feature should never appear on a
tier because somebody forgot to look at that cell.

**Quotes are valid for 30 days.** The sample quote shows a "valid until" date exactly one month after
the quote date. Nothing enforces the expiry; it's presentational.

**No authentication, of any kind.** The brief explicitly does not want a login system, and the quote
URL must be readable without one. Share links use a 12-character `nanoid` rather than a sequential id,
so a customer holding one link cannot walk to `/quotes/2` and read a competitor's pricing. That is
obscurity, not security, and I'd say so out loud before shipping this to real customers.

**USD only, no tax, whole cents.** Per the brief.

---

## Decisions where the options were genuinely close

**Percent-of-product add-ons are computed against the base cost _after_ the term discount.**
The brief says "10% of the product cost" without saying which product cost. On a 25-seat annual
Growth quote that's 10% of $12,750 (= $1,275), not 10% of the undiscounted $15,000 (= $1,500). I chose
the discounted figure because "the product cost" most naturally means what the customer is actually
being charged for the product on this quote, and because the alternative produces the odd result that
a customer who commits to two years pays *more* for a percentage add-on, relative to their product
spend, than a monthly customer does. This is the single decision I'd most want to confirm with you.

**The overall quote discount applies to the whole subtotal, base and add-ons alike.**
It could reasonably have applied only to the base product line. I read it as a negotiation lever on
the deal as a whole rather than a product-line adjustment — the brief calls it "a discount to the
quote". It's applied last, after add-ons are computed, and never compounds into the term discount.
It renders as its own negative line item so the line items always sum to the total, which is easier
for a customer to check than a total that mysteriously doesn't add up.

**Postgres over SQLite or Mongo.** The data is deeply relational — the interesting part *is* the
(feature × tier) join, where the same feature carries a different pricing model on different tiers.
Mongo would mean either nesting that matrix awkwardly or reimplementing joins by hand. SQLite is the
nicest local experience but doesn't survive Vercel's ephemeral filesystem, so the catalog would vanish
between cold starts.

**Server actions rather than a REST API.** There's no external consumer of an API here, and the
validation lives in one place ([`src/lib/validation.ts`](src/lib/validation.ts)) shared by both.

**The server re-resolves every add-on against the catalog before saving.** The browser sends feature
ids and seat counts; it never sends prices. The server looks each one up, refuses anything that isn't
an `ADDON` cell on the chosen tier — an `INCLUDED` feature is already paid for, an unavailable one
can't be sold at all — and prices it from the database. A stale browser tab cannot quote yesterday's
price.

---

## Questions I would have asked

1. **Percent-of-product add-ons: before or after the term discount?** (See above. I picked after.)
   The same question applies if you ever stack two percentage add-ons — right now each is computed
   against the base product cost independently, so they don't compound into each other.
2. **Does the overall discount have a cap, or an approval threshold?** Real quoting tools usually stop
   an AE from giving away 60% without a director signing off. I allow 0–100% freely.
3. **Should a per-seat add-on be capped at the product's seat count?** Selling 50 seats of API access
   on a 25-seat product is currently allowed. The sample quote's note that the quantities are
   "independent" suggests it should be, but I can imagine a client wanting the guardrail.
4. **Is a tier's base price ever not per-seat-per-month?** Flat-platform-fee tiers are common, and the
   schema would need a second price component.
5. **What should happen to a quote's "valid until" date, and does anything enforce it?**
6. **Do features ever exist independently of a product,** shared across a client's whole catalog? I've
   scoped them to a single product.

---

## What I'd build next

In roughly the order I'd do it:

- **Quote versioning.** "Editing" a saved quote by creating v2 that links back to v1 — this is what
  clients will actually ask for the moment they use it, and the snapshot model already supports it.
- **A migration history.** I used `prisma db push` for speed. A real deployment wants
  `prisma migrate` with checked-in migration files so schema changes are reviewable.
- **Approval thresholds on discounts**, with a reason field captured on anything above the line.
- **An audit trail on the catalog.** Who changed the Growth base price, when, and from what. Given
  quotes are snapshots, the catalog's own history is the missing half of the story.
- **A whole-catalog matrix view** — all tiers as columns rather than one tier at a time. The current
  editor is correct but makes you click through tiers to see the shape of the product.
- **Currency and tax**, once someone needs them, both of which want to live on the quote snapshot
  rather than the catalog.
- **Component and accessibility tests.** The unit suite covers the math and the e2e covers the happy
  path; the gap is the builder's validation states.

---

## Where things live

```
src/lib/pricing.ts        the pricing engine. pure. start here.
src/lib/pricing.test.ts   23 unit tests, incl. an exact replay of sample-quote.xlsx
src/lib/money.ts          integer-cent arithmetic and formatting
src/lib/terms.ts          monthly / annual / two-year, and their discounts
src/lib/validation.ts     zod schemas, shared by every server action

src/app/catalog/          catalog setup: products, tiers, the feature matrix
src/app/quotes/new/       the quote builder, with a live preview
src/app/quotes/[publicId] the read-only shared quote
prisma/schema.prisma      live catalog + frozen quote snapshots
prisma/seed.ts            the Acme Analytics catalog, transcribed from the xlsx
e2e/quote-flow.spec.ts    the end-to-end walkthrough
```
