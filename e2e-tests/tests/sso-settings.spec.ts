import { expect, test } from "@playwright/test";
import { BROWSER_SETTINGS } from "../globals";
import { goToPageWithUser, hideAllModalsAndPopups } from "../utils";

test.describe("SSO settings are provider-managed", () => {
  test("shows exactly one account-email mode and no provider controls", async ({ context }) => {
    const page = await goToPageWithUser(context, "/settings/account", BROWSER_SETTINGS.enUser);
    await hideAllModalsAndPopups(page);

    const emailSettings = page.locator("#username-change");
    const socialSettings = page.locator("#login-methods");
    const emailVisible = await emailSettings.isVisible();
    const socialVisible = await socialSettings.isVisible();

    expect(Number(emailVisible) + Number(socialVisible)).toBe(1);
    await expect(page.locator("[id^='disconnect-google'], [id^='disconnect-apple'], [id^='connect-google'], [id^='connect-apple']")).toHaveCount(0);

    if (socialVisible) {
      await expect(socialSettings).toContainText("Registered with");
      await expect(socialSettings).toContainText("@");
      await expect(emailSettings).toHaveCount(0);
    } else {
      await expect(emailSettings.getByRole("button", { name: "Change Email" })).toBeVisible();
      await expect(socialSettings).toHaveCount(0);
    }
  });
});
