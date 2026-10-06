/**
 * Whether the "Want to change the translation?" strip was already dismissed in this browser session, read where the
 * cookies are (request header on the server, document.cookie in the browser), so the strip is in the server-rendered
 * page from the first byte or not at all — it never pops in after load and shifts the text.
 *
 * @feature TXD-064 Open translations banner
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { bannerDismissed } from "./translations-banner";

const readOnServer = createServerFn({ method: "GET" }).handler(async (): Promise<boolean> => bannerDismissed(getRequestHeader("cookie") ?? ""));

export async function readBannerDismissed(): Promise<boolean> {
  if (typeof document !== "undefined") return bannerDismissed(document.cookie);
  return readOnServer();
}
