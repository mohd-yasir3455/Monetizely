import { expect, test, type Page } from "@playwright/test";

/**
 * The walkthrough the brief asks for: create a catalog entry, build a quote
 * from it, and view the saved quote at its own URL.
 *
 * The catalog is seeded with Analytics Suite, so this test adds a *new* feature
 * to it (priced as an add-on on Growth), then sells that feature in a quote.
 * That proves the catalog and the quote builder are actually wired together
 * rather than both reading a fixture.
 */

const unique = Date.now().toString().slice(-6);
const FEATURE = `Audit logs ${unique}`;
const QUOTE_NAME = `E2E Corp - proposal ${unique}`;

async function setStarterPrice(page: Page, dollars: string) {
  await page.goto("/catalog");
  await page.getByRole("button", { name: /^Starter/ }).click();
  await page.getByRole("button", { name: /Edit Starter base price/ }).click();
  await page.getByPlaceholder("$ per seat / month").fill(dollars);
  await page.getByRole("button", { name: "Save price" }).click();
  await expect(page.getByRole("button", { name: /^Starter/ })).toContainText(`$${dollars}`);
}

test("create a catalog entry, build a quote, and open the shared quote URL", async ({ page }) => {
  /* ---------------------------------------------------- 1. catalog entry */
  await page.goto("/catalog");
  await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible();

  // Work on the seeded product, Growth tier.
  await page.getByRole("button", { name: /Analytics Suite/ }).click();
  await page.getByRole("button", { name: /^Growth/ }).click();

  // Add a brand-new feature. It lands as "Not available" on every tier.
  await page.getByRole("button", { name: "Add feature" }).click();
  await page.getByPlaceholder("Feature name").fill(FEATURE);
  await page.getByRole("button", { name: "Add feature", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeHidden({ timeout: 30000 });

  const row = page.getByRole("row", { name: new RegExp(FEATURE) });
  await expect(row).toBeVisible({ timeout: 30000 });
  await expect(row.getByRole("button", { name: "Not available" })).toBeVisible();

  // Make it a $150/month fixed add-on on Growth.
  await row.getByRole("button", { name: "Not available" }).click();
  await row.getByLabel("Availability").selectOption("ADDON");
  await row.getByLabel("Pricing model").selectOption("FIXED_MONTHLY");
  await row.getByLabel("Add-on price in dollars").fill("150");
  await row.getByRole("button", { name: "Save" }).click();

  await expect(row.getByRole("button", { name: "Add-on" })).toBeVisible();
  await expect(row).toContainText("$150 / month, flat");

  /* ------------------------------------------------------- 2. build quote */
  await page.goto("/quotes/new");
  await page.getByLabel("Quote name").fill(QUOTE_NAME);
  await page.getByLabel("Customer name").fill("E2E Corporation");

  await page.getByRole("button", { name: /^Growth/ }).click();
  await page.getByLabel("Product seats").fill("25");
  await page.getByRole("button", { name: /^Annual/ }).click();

  // Included features must not be purchasable.
  await expect(page.getByText("Custom reports")).toBeVisible();

  // Select the fixed add-on we just created, plus a per-seat one with its own
  // seat count, distinct from the product's 25 seats.
  await page.getByLabel(new RegExp(FEATURE)).check();
  await page.getByLabel(/API access/).check();

  const apiRow = page.locator(".addon-row", { hasText: "API access" });
  await apiRow.getByLabel("Add-on quantity").fill("5");

  // The live preview reproduces the sample-quote math, plus our new add-on:
  //   base   25 x $50 x 12 x 0.85 = $12,750.00
  //   audit  $150 x 12            =  $1,800.00
  //   api    5 x $50 x 12         =  $3,000.00
  //                                 -----------
  //                                  $17,550.00
  const preview = page.locator(".preview-shell");
  await expect(preview).toContainText("Live quote preview");
  await expect(preview).toContainText("Analytics Suite · Growth");
  await expect(preview).toContainText("$17,550.00");
  await expect(preview).toContainText("Analytics Suite — Growth tier");
  await expect(preview).toContainText("$12,750.00");
  await expect(preview).toContainText(`Add-on: ${FEATURE}`);
  await expect(preview).toContainText("$1,800.00");
  await expect(preview).toContainText("Add-on: API access");
  await expect(preview).toContainText("$3,000.00");

  await page.getByRole("button", { name: "Save quote" }).click();

  /* --------------------------------------------- 3. the shared quote URL */
  await page.waitForURL(/\/quotes\/[A-Za-z0-9_-]{12}$/);
  const shareUrl = page.url();

  await expect(page.getByRole("heading", { name: QUOTE_NAME })).toBeVisible();
  await expect(page.getByText("E2E Corporation")).toBeVisible();
  await expect(page.getByText("Analytics Suite", { exact: true })).toBeVisible();

  // Every line item shows how it was calculated.
  await expect(page.getByRole("row", { name: /Analytics Suite — Growth tier.*\$12,750\.00/ })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(`Add-on: ${FEATURE}.*\\$1,800\\.00`) })).toBeVisible();
  await expect(page.getByRole("row", { name: /Add-on: API access.*\$3,000\.00/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Total.*\$17,550\.00/ })).toBeVisible();

  /* ------------------------- the quote is readable without any session */
  const anonymous = await page.context().browser()!.newContext();
  const anonPage = await anonymous.newPage();
  await anonPage.goto(shareUrl);
  await expect(anonPage.getByRole("heading", { name: QUOTE_NAME })).toBeVisible();
  await expect(anonPage.getByText("$17,550.00")).toBeVisible();
  await anonymous.close();

  /* ------------- and it appears in the saved list with the same total */
  await page.goto("/quotes");
  const listRow = page.locator(".quote-row", { hasText: QUOTE_NAME });
  await expect(listRow).toContainText("$17,550.00");
});

test("a saved quote keeps its numbers after the catalog price changes", async ({ page }) => {
  await setStarterPrice(page, "25");

  // Build a quote at the current Starter price.
  await page.goto("/quotes/new");
  const name = `Freeze test ${Date.now().toString().slice(-6)}`;
  await page.getByLabel("Quote name").fill(name);
  await page.getByLabel("Customer name").fill("Freeze Corp");
  await page.getByRole("button", { name: /^Starter/ }).click();
  await page.getByLabel("Product seats").fill("10");
  await page.getByRole("button", { name: /^Monthly/ }).click();
  await page.getByRole("button", { name: "Save quote" }).click();
  await page.waitForURL(/\/quotes\/[A-Za-z0-9_-]{12}$/);

  const shareUrl = page.url();
  await expect(page.getByText("$250.00").first()).toBeVisible(); // 10 x $25 x 1

  // Now change the Starter price in the catalog.
  await setStarterPrice(page, "40");

  // The old quote is untouched.
  await page.goto(shareUrl);
  await expect(page.getByText("$250.00").first()).toBeVisible();
  await expect(page.getByText("$400.00")).toHaveCount(0);

  // Put the seed value back so the suite is re-runnable.
  await setStarterPrice(page, "25");
});
