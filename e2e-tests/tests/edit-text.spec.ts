import { test, expect } from "@playwright/test";

const EDIT_URL = "/edit/Genesis.1";

const isTransparent = (color: string): boolean => {
  if (color === "transparent") return true;
  return color.replace(/\s/g, "") === "rgba(0,0,0,0)";
};

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

    await page.evaluate(() => {
      const editButtons = document.getElementById("editButtons");
      if (editButtons) editButtons.style.display = "block";
    });

    const saveButton = page.locator("#addVersionSave");
    await expect(saveButton).toBeAttached();

    const bgColor = await saveButton.evaluate(el =>
      getComputedStyle(el).backgroundColor
    );
    expect(isTransparent(bgColor)).toBe(false);
  });

  test("Save button has correct text", async ({ page }) => {
    await page.goto(EDIT_URL);
    await page.waitForLoadState("load");

    await page.evaluate(() => {
      const el = document.getElementById("editButtons");
      if (el) el.style.display = "block";
    });

    const saveButton = page.locator("#addVersionSave");
    await expect(saveButton).toBeAttached();
    await expect(saveButton).toContainText("Save");
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
    expect(isTransparent(bgColor)).toBe(false);
  });

  test("Add a New Text modal: Add button has a non-transparent background when active", async ({ page }) => {
    await page.goto(EDIT_URL);
    await page.waitForLoadState("load");

    await page.evaluate(() => {
      const el = document.getElementById("newTextModal");
      if (el) el.style.display = "block";
      const ok = document.getElementById("newTextOK");
      if (ok) ok.classList.remove("inactive");
    });

    const bgColor = await page.locator("#newTextOK").evaluate(el =>
      getComputedStyle(el).backgroundColor
    );
    expect(isTransparent(bgColor)).toBe(false);
  });

});
