/**
 * Adding the selected passage to one of the reader's source sheets (the sidebar's "Add to Sheet" tool), as the old
 * AddToSourceSheetBox (static/js/AddToSourceSheet.jsx; server sourcesheets/views.py):
 *  - the reader's sheets: `GET /api/sheets/user/<uid>/date/0/0` → {sheets: [{id, title, …}]}, newest first;
 *  - add: `POST /api/sheets/<id>/add` with form field `source` = JSON {refs, "version-he"?, "version-en"?} — each version keyed by
 *    its text direction; two versions in the same direction are added as two sources, one per version (handleSameDirectionVersions);
 *  - a new sheet: `POST /api/sheets/` with `json` = {title, options: {numbered: 0}, sources: []} → the sheet.
 * Not ported yet: trimming a partial word selection (CON-056), the Google Docs promo (CON-057).
 *
 * @feature CON-034 Add connection to sheet button
 */
import { queryOptions } from "@tanstack/react-query";
import { postForm, sameOrigin } from "~/lib/auth/http";
import { POLICIES } from "~/lib/cache/policies";

export interface UserSheet {
  id: number;
  title: string;
}

/** A version on the panel: its title and the direction of its text. */
export interface SheetVersion {
  versionTitle: string;
  direction: "rtl" | "ltr";
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").trim();
/** The old Sefaria.sheets.getSheetTitle: the title without markup, or "Untitled". */
export const sheetTitle = (t: string | undefined) => (t ? stripHtml(t) : "") || "Untitled";

export const userSheetsQuery = (uid: number | null) =>
  queryOptions({
    queryKey: ["user", "sheets", uid] as const,
    queryFn: async ({ signal }): Promise<UserSheet[]> => {
      const r = await fetch(sameOrigin(`/api/sheets/user/${uid}/date/0/0`), { credentials: "same-origin", signal });
      if (!r.ok) throw new Error(`Your sheets: HTTP ${r.status}`);
      const data = (await r.json()) as { sheets?: UserSheet[] };
      return data.sheets ?? [];
    },
    enabled: uid !== null,
    staleTime: 30_000,
    gcTime: POLICIES.user.gcTime,
  });

/** The sources to post for these verses in these versions (one, or one per version when both read the same direction). */
export function sourcesFor(refs: readonly string[], primary?: SheetVersion, translation?: SheetVersion): Record<string, unknown>[] {
  if (primary && translation && primary.direction === translation.direction) {
    return [primary, translation].map((v) => ({ refs: [...refs], [`version-${v.direction === "rtl" ? "he" : "en"}`]: v.versionTitle }));
  }
  const source: Record<string, unknown> = { refs: [...refs] };
  for (const v of [primary, translation]) if (v) source[`version-${v.direction === "rtl" ? "he" : "en"}`] = v.versionTitle;
  return [source];
}

export async function addToSheet(sheetId: number, sources: Record<string, unknown>[]): Promise<void> {
  for (const source of sources) {
    const res = await postForm(`/api/sheets/${sheetId}/add`, new URLSearchParams({ source: JSON.stringify(source) }));
    const data = res.data as { error?: string };
    if (!res.ok || data.error) throw new Error(data.error ?? `Could not add to the sheet (HTTP ${res.status})`);
  }
}

export async function createSheet(title: string): Promise<UserSheet> {
  const res = await postForm("/api/sheets/", new URLSearchParams({ json: JSON.stringify({ title, options: { numbered: 0 }, sources: [] }) }));
  const data = res.data as unknown as UserSheet & { error?: string };
  if (!res.ok || data.error || !data.id) throw new Error(data.error ?? "Could not create the sheet");
  return data;
}

/** A connection between two texts (the old AddConnectionBox): `POST /api/links/` with `json` = {refs, type}. CON-065 */
export async function addConnection(refs: [string, string], type: string): Promise<void> {
  const res = await postForm("/api/links/", new URLSearchParams({ json: JSON.stringify({ refs, type }) }));
  const data = res.data as { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? "Unfortunately, there was an error saving this connection. Please try again or try reloading this page.");
}
