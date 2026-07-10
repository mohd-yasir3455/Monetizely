# Quoting tool

Set up a client's product catalog, build a quote for one of their customers, share it as a read-only link.

- **Live app:** https://monetizely-zeta.vercel.app
- **Example quote:** https://monetizely-zeta.vercel.app/quotes/Ep6y6A7dBdP_
- **Repo:** https://github.com/mohd-yasir3455/Monetizely

Next.js 15 (App Router), TypeScript, Postgres, Prisma.

---

## Running it locally

Node 20+ and a Postgres database. I used [Neon](https://neon.tech) — free tier, deploys cleanly on Vercel.

```bash
git clone https://github.com/mohd-yasir3455/Monetizely
cd Monetizely
npm install

cp .env.example .env
# Fill in DATABASE_URL and DIRECT_URL

npm run db:push    # create the tables
npm run db:seed    # load the example catalog
npm run dev        # http://localhost:3000
```

### Tests

```bash
npm test           # unit tests on the pricing math
npm run test:e2e   # full flow: catalog -> quote -> shared URL
```

23 unit tests cover the three add-on pricing models, both kinds of discount, the rounding, and the
invalid inputs. One of them replays `sample-quote.xlsx` line by line and checks the total comes out at
exactly $18,150.

The e2e suite runs a real browser through the whole thing: add a feature to the catalog, price it as
an add-on on Growth, sell it in a quote next to a per-seat add-on with its own seat count, then open
the share URL in a fresh browser with no session and check the numbers. A second test edits a tier
price afterwards and confirms the already-saved quote didn't move.

Heads up: `test:e2e` writes to whatever `DATABASE_URL` points at. Use a scratch database.

---

## Deploying

1. Create a Neon project. Copy both connection strings — the pooled one has `-pooler` in the hostname,
   the direct one doesn't.
2. Push to GitHub, import the repo in Vercel.
3. Set two environment variables in Vercel:
   - `DATABASE_URL` → the pooled string
   - `DIRECT_URL` → the direct string
4. Deploy. The build script runs `prisma generate` before `next build`.
5. Create the tables and seed once, from your machine:
   ```bash
   npm run db:push
   npm run db:seed
   ```

Why two connection strings: serverless functions open and drop connections constantly, so runtime
queries go through the pooler. But `prisma db push` issues DDL, which needs a persistent session, and
the pooler runs in transaction mode. Point `DIRECT_URL` at the pooler and the build passes but the
first schema command hangs. This cost me an afternoon.

---

## How the pricing works

Everything is stored in integer cents, and percentages in basis points (100 bps = 1%). No floats
anywhere near money — `0.1 + 0.2 !== 0.3`, and a quote that's a cent off is a quote the customer
stops trusting. Rounding is half-away-from-zero, applied once, right after each percentage.

The engine is in [`src/lib/pricing.ts`](src/lib/pricing.ts). It's a pure function — no database, no
React, no I/O. You give it what the customer is buying, it hands back the line items, including the
calculation string that shows up on the quote. Two things fall out of that:

- The math can be tested directly, so "the numbers have to be right" is a test rather than a
  screenshot someone eyeballed.
- The browser's live preview calls the same function the server calls on save. They can't drift apart,
  because they're the same code.

```
base product   = seats × base price × months × (1 − term discount)

each add-on, priced by its model, on the tier the customer picked:
  fixed monthly       = price × months
  per seat            = add-on seats × price × months     (add-on seats ≠ product seats)
  % of product price  = percent × base product cost

subtotal       = base + all add-ons
total          = subtotal − (overall discount % × subtotal)
```

---

## Assumptions

Things the brief didn't say, that I had to decide.

**The term discount only touches the base product line. Add-ons never get discounted.** The brief says
the discount is "on the per-seat price", and `sample-quote.xlsx` backs it up — that quote is annual,
but the $200/month SSO add-on still bills at the full $2,400, and API access at the full $3,000.
Neither one is 15% off.

**The term discount is applied to the base line total, not to the per-seat rate.** Algebraically these
are the same thing. They round differently, though. Take 15% off a $33.33 seat rate and you've baked a
rounding error into every seat; take it off the total and you round once. I take it off the total,
which is what the sample quote does. There's a test that pins this so nobody "simplifies" it later.

**A saved quote is frozen.** It stores names, rates, computed cents and the calculation strings
outright — no foreign keys pointing back at the catalog. If someone edits the Growth base price next
week, a quote the customer already has open must not quietly change under them. The brief says quotes
can't be edited after saving, and a quote that rewrites itself is an edit. There's an e2e test for it.

**Add-on seats are separate from product seats.** The sample quote spells this out — 25 seats of the
product, 5 seats of API access. Per-seat add-ons start at 1 seat, not at the product's seat count, so
nobody sells 25 seats of something by not looking.

**Switching tier clears the add-on selection.** Add-ons are priced per tier, and the same feature can
be included on one tier and unavailable on the next. Carrying a Growth selection across to Enterprise
would eventually produce a wrong quote.

**New tiers and features start as "Not available" everywhere.** A feature should never end up on a
tier because someone forgot to look at that cell.

**Quotes are valid for 30 days.** The sample quote has a valid-until date a month out. Nothing enforces
it — it's just printed.

**No auth at all.** The brief doesn't want a login, and the quote link has to open without one. Share
URLs use a 12-character `nanoid` instead of a sequential id, so someone holding one link can't walk to
`/quotes/2` and read another customer's pricing. That's obscurity, not security, and I'd say so out
loud before this went in front of real customers.

**USD, no tax, whole cents.** Per the brief.

---

## Decisions where both options were reasonable

**Percent-of-product add-ons are computed against the base cost *after* the term discount.**

The brief says "10% of the product cost" and doesn't say which product cost. On a 25-seat annual
Growth quote that's either 10% of $12,750 or 10% of the undiscounted $15,000 — $1,275 or $1,500.

I went with the discounted figure. "The product cost" reads to me as what the customer is actually
being charged for the product on this quote, not a list price that appears nowhere on the document.
And the alternative has a strange consequence: a customer who commits to two years ends up paying more
for a percentage add-on relative to their actual product spend than a monthly customer does.

I'm least confident about this one. The counter-argument is decent — if the percentage is meant to
track the *value* of the product rather than the *price paid*, list price is the right base, and my
version means the add-on silently gets cheaper the longer someone commits. It's the first thing I'd ask
you about.

**The overall discount comes off the whole subtotal, base and add-ons together.**

It could just as easily have applied to the base line only. I read it as a lever on the deal as a
whole — the brief calls it "a discount to the quote", not a discount to the product. It's applied last,
after add-ons are worked out, and it never compounds into the term discount.

It shows up as its own negative line item so the line items always add up to the total. A customer
checking the arithmetic on a total that doesn't visibly add up is a customer who calls their AE.

**Postgres, not SQLite or Mongo.**

The interesting part of this data model is the (feature × tier) join — the same feature carrying a
different pricing model on different tiers. That's a relation, so I wanted a relational database.
Mongo would have meant nesting that matrix awkwardly or hand-rolling the joins. SQLite is nicer
locally but doesn't survive Vercel's ephemeral filesystem, so the catalog would disappear between
cold starts.

**Server actions instead of a REST API.**

Nothing outside this app consumes the data. Server actions keep the validation in one place
([`src/lib/validation.ts`](src/lib/validation.ts)) and skip a layer that would exist only to be
called by the page next to it.

**The server re-resolves every add-on against the catalog before it saves.**

The browser sends feature ids and seat counts. It never sends prices. The server looks each one up,
refuses anything that isn't an `ADDON` cell on the chosen tier — an `INCLUDED` feature is already paid
for, an unavailable one can't be sold — and takes the price from the database. A stale browser tab
can't quote yesterday's price, and nobody can edit a price in devtools.

---

## Questions I'd have asked

1. **Percent-of-product add-ons: against the discounted price or list price?** The one above. Related:
   if two percentage add-ons are ever on the same quote, they're each computed off the base
   independently right now, so they don't compound into each other. Is that what you'd want?
2. **Is there a cap on the overall discount, or an approval threshold?** Most quoting tools stop an AE
   from handing out 60% without a director signing off. I allow 0–100% with nothing in the way, which
   I doubt is what a real client wants.
3. **Should a per-seat add-on be capped at the product's seat count?** Right now you can sell 50 seats
   of API access on a 25-seat product. The sample quote implies the quantities are independent, but I
   can see a client wanting the guardrail.
4. **Is a tier's price ever not per-seat-per-month?** Flat platform fees are common. That's a second
   price component on the tier, and it changes the base-line formula.


## Where things are

```
src/lib/pricing.ts          the pricing engine. pure. start here.
src/lib/pricing.test.ts     23 tests, including an exact replay of sample-quote.xlsx
src/lib/money.ts            integer-cent arithmetic and formatting
src/lib/terms.ts            monthly / annual / two-year and their discounts
src/lib/validation.ts       zod schemas, shared by every server action

src/app/catalog/            catalog setup: products, tiers, the feature matrix
src/app/quotes/new/         the quote builder, with a live preview
src/app/quotes/[publicId]   the read-only shared quote
prisma/schema.prisma        live catalog + frozen quote snapshots
prisma/seed.ts              the example catalog, transcribed from the xlsx
e2e/quote-flow.spec.ts      the end-to-end walkthrough
```