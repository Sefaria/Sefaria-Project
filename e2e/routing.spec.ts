import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// @feature RTE-027 Ref URL normalization to canonical form
test.describe("canonical URLs", () => {
  test("a non-canonical spelling redirects (301) to the canonical ref", async ({ request }) => {
    const res = await request.get("/Gen.1.1", { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers().location).toMatch(/\/Genesis\.1\.1$/);
  });

  test("a bare book is the book's page (VERIFIED on sefaria.org: is_book_level), whose Start Reading goes to the first section", async ({ request }) => {
    const res = await request.get("/Genesis", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("Start Reading");
    expect(html).toContain('href="/Genesis.1"');
  });

  test("a commentary chapter opens at its first available section", async ({ request }) => {
    const res = await request.get("/Rashi_on_Genesis.1", { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers().location).toMatch(/Rashi_on_Genesis\.1\.1$/);
  });

  test("an unknown book is a real 404", async ({ request }) => {
    const res = await request.get("/Definitely_Not_A_Book.1");
    expect(res.status()).toBe(404);
  });

  test("query parameters survive the redirect", async ({ request }) => {
    const res = await request.get("/Gen.1.1?lang=he", { maxRedirects: 0 });
    expect(res.headers().location).toContain("lang=he");
  });
});

// @feature SHL-020 @feature TXD-050
test("a verse URL opens at exactly that verse, which is the current verse", async ({ page }) => {
  await open(page, "/Genesis.1.3");
  await expect(page.locator('[data-scroll-target="true"]')).toHaveAttribute("data-ref", "Genesis 1:3");
  await expect(page.locator('[data-focused="true"]')).toHaveCount(1);
  await expect(page.locator('[data-focused="true"]')).toHaveAttribute("data-ref", "Genesis 1:3");
});

test("a verse range opens at its first verse, then the address collapses to it (old reader, verified live)", async ({ page }) => {
  await open(page, "/Genesis.1.3-5?lang=en");
  await expect(page.locator('[data-scroll-target="true"]')).toHaveAttribute("data-ref", "Genesis 1:3");
  await expect(page.locator('[data-ref="Genesis 1:3"][role="group"]')).toBeInViewport();
  await expect(page).toHaveURL(/\/Genesis\.1\.3\?lang=en&aliyot=0$/);
});

test("with the sidebar, a range highlights only its first verse, and the sidebar shows that verse", async ({ page }) => {
  await open(page, "/Genesis.1.3-5?lang=en&with=all");
  await expect(page).toHaveURL(/\/Genesis\.1\.3\?/);
  await expect(page.locator('[data-focused="true"]')).toHaveCount(1);
  await expect(page.locator('[data-focused="true"]')).toHaveAttribute("data-ref", "Genesis 1:3");
});

test("a section URL stays section-level until the reader scrolls", async ({ page }) => {
  await open(page, "/Genesis.1?lang=en");
  await page.waitForTimeout(800);
  expect(new URL(page.url()).pathname).toBe("/Genesis.1");
});

// @feature RTE-043
test("?lang= controls the content language", async ({ page }) => {
  await open(page, "/Genesis.1?lang=he");
  await expect(page.getByText("When God began to create")).toHaveCount(0);
  await open(page, "/Genesis.1?lang=en");
  await expect(page.getByText("When God began to create").first()).toBeVisible();
});
