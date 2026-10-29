// Dumps the boxes and computed type of the visible elements under a selector, live vs rebuild, at desktop or phone size.
// Usage: node scripts/parity-dump.mjs <path> <liveSelector> <oursSelector> [phone] [depthFilter]
import { chromium } from "playwright";
const [path, liveSel, oursSel, phone] = process.argv.slice(2);
const mobile = phone === "phone";
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, ...(mobile ? { isMobile: true, hasTouch: true, userAgent: PHONE_UA } : {}) });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" }]);
const dump = (sel) => {
  const root = document.querySelector(sel);
  if (!root) return ["(no " + sel + ")"];
  document.querySelectorAll("#interruptingMessageBox,#interruptingMessageOverlay,.cookiesNotification,.GuideOverlay").forEach((n) => n.remove());
  const out = [];
  const walk = (el, d) => {
    const r = el.getBoundingClientRect(), c = getComputedStyle(el);
    if (c.display === "none" || c.visibility === "hidden") return;
    if (r.width === 0 || r.height === 0) { for (const ch of el.children) walk(ch, d); return; }
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").slice(0, 40);
    const tag = el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").filter(Boolean).slice(0, 2).join(".") : "");
    const leaf = own || ["img", "svg", "input", "button", "a", "hr"].includes(el.tagName.toLowerCase()) || c.borderTopWidth !== "0px" || c.borderBottomWidth !== "0px" || c.backgroundColor !== "rgba(0, 0, 0, 0)";
    if (leaf) out.push(`${"  ".repeat(Math.min(d, 6))}${tag.slice(0, 40)} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}] ${c.fontSize}/${c.lineHeight} ${c.fontWeight} ${c.fontFamily.split(",")[0].replace(/"/g, "")} ${c.color}${c.backgroundColor !== "rgba(0, 0, 0, 0)" ? " bg=" + c.backgroundColor : ""}${c.borderBottomWidth !== "0px" ? " bb=" + c.borderBottomWidth + " " + c.borderBottomColor : ""}${c.borderTopWidth !== "0px" ? " bt=" + c.borderTopWidth + " " + c.borderTopColor : ""}${c.borderRadius !== "0px" ? " r=" + c.borderRadius : ""} pad=${c.padding} "${own}"`);
    if (el.tagName.toLowerCase() === "svg") return;
    for (const ch of el.children) walk(ch, d + 1);
  };
  walk(root, 0);
  return out;
};
for (const [side, origin, sel] of [["LIVE", "https://www.sefaria.org", liveSel], ["OURS", process.env.OURS ?? "http://localhost:3100", oursSel]]) {
  const p = await ctx.newPage();
  await p.goto(origin + path, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  console.log(`===== ${side} ${sel}`);
  console.log((await p.evaluate(dump, sel)).join("\n"));
}
await b.close();
