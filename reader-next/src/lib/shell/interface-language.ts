/**
 * Switching the interface language is a request to `/interface/<english|hebrew>?next=<path>`: it sets the `interfaceLang`
 * cookie (the same cookie the old site uses) and sends the reader back where they were. `next` may only be a path on this
 * site — never another origin (an open redirect would turn the language link into a phishing link).
 *
 * @feature RTE-034 Language switch URL (/interface)
 * @feature I18-007 Site language toggle in dropdowns
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\r\n]/.test(next)) return "/";
  return next;
}

export const isInterfaceLang = (x: string): x is "english" | "hebrew" => x === "english" || x === "hebrew";

export function interfaceLanguageResponse(lang: string, nextParam: string | null): Response {
  if (!isInterfaceLang(lang)) return new Response("Unknown interface language", { status: 404 });
  return new Response(null, {
    status: 302,
    headers: {
      Location: safeNext(nextParam),
      "Set-Cookie": `interfaceLang=${lang}; Path=/; Max-Age=${365 * 24 * 3600}; SameSite=Lax`,
      "Cache-Control": "no-store",
    },
  });
}
