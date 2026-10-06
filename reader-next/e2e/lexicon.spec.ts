import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const side = (page: Page) => page.getByRole("complementary");

/** Select the first `n` words of a segment's source text and release the mouse (what a reader does with a drag). */
async function selectWords(page: Page, ref: string, n: number, lang = "he") {
  await page.evaluate(
    ({ ref, n, lang }) => {
      const sp = [...document.querySelectorAll(`[role="group"][data-ref="${ref}"] span[lang=${lang}]`)].find((e) => (e.textContent ?? "").length > 20)!;
      const w = document.createTreeWalker(sp, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      for (let x = w.nextNode(); x; x = w.nextNode()) nodes.push(x as Text);
      let words = 0, last = nodes[0]!, end = 0;
      outer: for (const node of nodes) {
        last = node;
        for (let i = 0; i < node.data.length; i++) if (node.data[i] === " " && ++words === n) { end = i; break outer; }
        end = node.data.length;
      }
      const r = document.createRange();
      r.setStart(nodes[0]!, 0);
      r.setEnd(last, end);
      const sel = getSelection()!;
      sel.removeAllRanges();
      sel.addRange(r);
      sp.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    },
    { ref, n, lang },
  );
}

// @feature CON-042 @feature CON-043 @feature CON-044 @feature TXD-059 @feature TXD-057 @feature SHL-053
test.describe("dictionaries for selected words (verified on sefaria.org)", () => {
  test("selecting a Hebrew word with the sidebar open shows its definitions from each dictionary, and the address follows", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=he&with=all");
    await expect(side(page).getByRole("link", { name: "About this Text" })).toBeVisible({ timeout: 20_000 });
    await selectWords(page, "Genesis 1:1", 1);
    await expect(page).toHaveURL(/lookup=/);
    await expect(page).toHaveURL(/with=Lexicon/);
    const entries = side(page).getByRole("article");
    await expect(entries).toHaveCount(3, { timeout: 20_000 });
    await expect(entries.nth(0)).toContainText("רֵאשִׁית (n-f) heb");
    await expect(entries.nth(0)).toContainText("Source: Open Scriptures on GitHub");
    await expect(entries.nth(1)).toContainText("Creator: Rabbi Marcus Jastrow");
    await expect(entries.nth(2)).toContainText("† רֵאשִׁית");
  });

  test("later selections update the sidebar AND the address (sefaria.org's address stays on the first word)", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=he&with=all");
    await expect(side(page).getByRole("link", { name: "About this Text" })).toBeVisible({ timeout: 20_000 });
    await selectWords(page, "Genesis 1:1", 1);
    await expect(page).toHaveURL(/lookup=/);
    const first = new URL(page.url()).searchParams.get("lookup");
    const history = await page.evaluate(() => history.length);
    await selectWords(page, "Genesis 1:1", 2);
    await expect.poll(() => new URL(page.url()).searchParams.get("lookup")).not.toBe(first);
    expect(await page.evaluate(() => history.length)).toBe(history); // replaced, not pushed
    await expect(side(page).getByText(/No definitions found for/)).toBeVisible({ timeout: 20_000 });
  });

  test("more than three words, English text, or a closed sidebar: nothing happens", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=bi&with=all");
    await expect(side(page).getByRole("link", { name: "About this Text" })).toBeVisible({ timeout: 20_000 });
    await selectWords(page, "Genesis 1:1", 4);
    await selectWords(page, "Genesis 1:1", 3, "en");
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain("lookup");
    await expect(side(page).getByRole("link", { name: "About this Text" })).toBeVisible();

    await open(page, "/Genesis.1.1?lang=he");
    await selectWords(page, "Genesis 1:1", 1);
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain("lookup");
    await expect(side(page)).toHaveCount(0); // a selection never opens a closed sidebar
  });

  test("a real mouse drag over a word looks it up and does not also choose the verse", async ({ page }) => {
    await open(page, "/Genesis.1.2?lang=he&with=all");
    await expect(side(page).getByRole("link", { name: "About this Text" })).toBeVisible({ timeout: 20_000 });
    const rect = await page.evaluate(() => {
      const sp = [...document.querySelectorAll('[role="group"][data-ref="Genesis 1:2"] span[lang=he]')].find((e) => (e.textContent ?? "").length > 20)!;
      const w = document.createTreeWalker(sp, NodeFilter.SHOW_TEXT);
      const first = w.nextNode() as Text;
      const i = first.data.indexOf(" ");
      const r = document.createRange();
      r.setStart(first, 0);
      r.setEnd(first, i > 0 ? i : first.data.length);
      const b = r.getBoundingClientRect();
      return { left: b.left, right: b.right, y: b.top + b.height / 2 };
    });
    await page.mouse.move(rect.right - 1, rect.y);
    await page.mouse.down();
    await page.mouse.move(rect.left + 2, rect.y, { steps: 6 });
    await page.mouse.up();
    await expect(page).toHaveURL(/lookup=/);
    expect(new URL(page.url()).pathname).toBe("/Genesis.1.2"); // the verse did not change
    await expect(side(page).getByRole("article").first()).toBeVisible({ timeout: 20_000 });
  });

  test("a link with lookup= opens straight to the definitions", async ({ page }) => {
    await open(page, `/Genesis.1.1?lang=he&lookup=${encodeURIComponent("בְּרֵאשִׁ֖ית")}&with=Lexicon`);
    await expect(side(page).getByRole("article")).toHaveCount(3, { timeout: 20_000 });
  });

  test("the Dictionaries tool opens the box; a typed word is looked up in every dictionary", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=all");
    await side(page).getByRole("link", { name: "Dictionaries" }).click();
    await expect(page).toHaveURL(/with=Lexicon/);
    await side(page).getByRole("combobox", { name: "Search Dictionary" }).fill("אבא");
    await page.keyboard.press("Enter");
    await expect(side(page).getByRole("article").first()).toBeVisible({ timeout: 20_000 });
    await expect(side(page).getByText("Jastrow Dictionary").or(side(page).getByText("Creator: Rabbi Marcus Jastrow")).first()).toBeVisible();
  });

  test("a citation in a definition opens the cited text beside the reader's", async ({ page }) => {
    await open(page, `/Genesis.1.1?lang=he&lookup=${encodeURIComponent("בְּרֵאשִׁ֖ית")}&with=Lexicon`);
    const jastrow = side(page).getByRole("article").nth(1);
    await expect(jastrow).toBeVisible({ timeout: 20_000 });
    await jastrow.getByRole("link", { name: "Gen. R. s. 3" }).first().click();
    await expect(page.locator("section[data-panel-id]")).toHaveCount(2, { timeout: 20_000 });
    await expect(page).toHaveURL(/p2=Bere(i)?shit_Rabbah\.3/);
  });
});

// @feature SRC-020 @feature SRC-021 @feature SRC-022 @feature RTE-026 @feature BOK-019
test.describe("dictionary books have a word box (also RTE-026: a comma in a title stays a comma in the address)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the book page: type Hebrew, pick a headword, the entry opens", async ({ page }) => {
    await open(page, "/Jastrow");
    const box = page.getByRole("combobox", { name: "Search Dictionary" });
    await expect(page.getByRole("heading", { name: /Browse By Letter/ })).toBeVisible();
    await box.fill("light");
    await expect(page.getByText("Invalid entry.  Please type a Hebrew word.")).toBeVisible();
    await box.fill("אור");
    const first = page.getByRole("option").first();
    await expect(first).toBeVisible({ timeout: 15_000 });
    await first.click();
    await expect(page).toHaveURL(/\/Jastrow,_/);
  });

  test("the reader's sidebar search on a dictionary entry is the same box", async ({ page }) => {
    await open(page, "/Jastrow,_%D7%90%D7%95%D6%B9%D7%A8.1?lang=he&with=SidebarSearch");
    await expect(side(page).getByRole("combobox", { name: "Search Dictionary" })).toBeVisible({ timeout: 20_000 });
  });
});
