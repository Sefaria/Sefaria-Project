import { expect, test } from "@playwright/test";
import { open } from "./helpers";

/**
 * A complex text's node address opens its first section (v-exits F-4: it answered 503 after asking for the whole node, 5.9 MB).
 * www.sefaria.org answers 200 and shows "Arukh HaShulchan, Orach Chaim 1"; here the address is the section's (the 301 every ref above
 * section level gets in this client: TXT-016).
 */
// @feature TXT-023
test("/Arukh_HaShulchan,_Orach_Chaim opens Orach Chaim 1", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (r) => asked.push(decodeURIComponent(r.url())));
  const res = await open(page, "/Arukh_HaShulchan,_Orach_Chaim");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/Arukh_HaShulchan,_Orach_Chaim\.1(\?|$)/);
  await expect(page).toHaveTitle("Arukh HaShulchan, Orach Chaim 1 | The Sefaria Library");
  expect(asked.some((u) => /\/api\/v3\/texts\/Arukh HaShulchan, Orach Chaim\?/.test(u))).toBe(false);
});
