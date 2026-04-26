import { test, expect } from "@playwright/test";

const TRANSPARENT = "rgba(0, 0, 0, 0)";
const EDIT_URL = "/edit/Genesis.1";

test.describe("edit_text page CSS rendering", () => {

  test("color-palette CSS variables are defined", async ({ page }) => {
    await page.goto(EDIT_URL);
    await page.waitForLoadState("load");

    const sefariaBlue = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--sefaria-blue").trim()
    );
    expect(sefariaBlue).not.toBe("");
  });

  test("Save button has a non-transparent background", async ({ page }) => {
    await page.goto(EDIT_URL);
    await page.waitForLoadState("load");

    const bgColor = await page.evaluate(() => {
      const editButtons = document.getElementById("editButtons");
      if (editButtons) editButtons.style.display = "block";
      const save = document.getElementById("addVersionSave");
      return save ? getComputedStyle(save).backgroundColor : null;
    });
    expect(bgColor).not.toBe(TRANSPARENT);
  });

  test("Save button text is visible", async ({ page }) => {
    await page.goto(EDIT_URL);
    await page.waitForLoadState("load");

    await page.evaluate(() => {
      const el = document.getElementById("editButtons");
      if (el) el.style.display = "block";
    });

    await expect(page.locator("#addVersionSave")).toContainText("Save");
  });

  test("Add a New Text modal: Cancel button has a non-transparent background", async ({ page }) => {
    await page.goto(EDIT_URL);
    await page.waitForLoadState("load");

    await page.evaluate(() => {
      const el = document.getElementById("newTextModal");
      if (el) el.style.display = "block";
    });

    const bgColor = await page.locator("#newTextCancel").evaluate(el =>
      getComputedStyle(el).backgroundColor
    );
    expect(bgColor).not.toBe(TRANSPARENT);
  });

  test("Add a New Text modal: Add button has a non-transparent background when active", async ({ page }) => {
    await page.goto(EDIT_URL);
    await page.waitForLoadState("load");

    await page.evaluate(() => {
      const el = document.getElementById("newTextModal");
      if (el) el.style.display = "block";
      // Simulate the JS activating the Add button after a valid ref is entered
      const ok = document.getElementById("newTextOK");
      if (ok) ok.classList.remove("inactive");
    });

    const bgColor = await page.locator("#newTextOK").evaluate(el =>
      getComputedStyle(el).backgroundColor
    );
    expect(bgColor).not.toBe(TRANSPARENT);
  });

});
