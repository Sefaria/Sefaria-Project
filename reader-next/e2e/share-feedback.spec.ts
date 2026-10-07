import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const side = (page: Page) => page.getByRole("complementary");

// @feature CON-061 @feature CON-067
test.describe("Share and Feedback (verified against sefaria.org; feedback is intercepted, nothing is sent)", () => {
  test("Share: the link of the current view and the three targets", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=all");
    await side(page).getByRole("link", { name: "Share", exact: true }).click();
    const box = side(page).getByRole("textbox", { name: "Shareable link" });
    await expect(box).toHaveValue(/\/Genesis\.1\.1\?.*with=Share/, { timeout: 20_000 });
    await expect(side(page).getByRole("link", { name: "Share by Email" })).toHaveAttribute("href", /^mailto:\?&subject=Text on Sefaria&body=http/);
    await expect(side(page).getByRole("link", { name: "Share on X" })).toHaveAttribute("href", /^https:\/\/twitter\.com\/share\?url=/);
  });

  test("Feedback: validation, then the request the old client sends, then 'Feedback sent!'", async ({ page }) => {
    const sent: string[] = [];
    await page.route("**/api/send_feedback", async (route) => {
      sent.push(route.request().postData() ?? "");
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" });
    });
    await open(page, "/Genesis.1.1?lang=en&with=all");
    await side(page).getByRole("link", { name: "Feedback" }).click();
    await side(page).getByRole("button", { name: "Submit" }).click();
    await expect(side(page).getByRole("alert")).toHaveText("Please select a feedback type");
    expect(sent).toHaveLength(0);
    await side(page).getByRole("combobox").selectOption({ label: "Report a bug" });
    await side(page).getByPlaceholder("Describe the issue...").fill("test message");
    await side(page).getByPlaceholder("Email Address").fill("test@example.org");
    await side(page).getByRole("button", { name: "Submit" }).click();
    await expect(side(page).getByText("Feedback sent!")).toBeVisible();
    expect(sent).toHaveLength(1);
    const payload = JSON.parse(new URLSearchParams(sent[0]).get("json")!);
    expect(payload).toMatchObject({ refs: ["Genesis 1:1"], type: "bug_report", email: "test@example.org", msg: "test message", uid: null });
    expect(payload.url).toContain("/Genesis.1.1");
  });
});
