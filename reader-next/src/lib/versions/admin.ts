/**
 * Moderators editing a version from the book page's Versions tab, as the old VersionBlock editor (pencil → versionEditForm):
 * its metadata through `POST /api/version/flags/<title>/<lang>/<versionTitle>` (`json=`, flag_text_api, staff only, logged in
 * history) and "Delete Version" through `DELETE /api/texts/<title>?ven=|vhe=` (texts_api, staff only). The old block
 * deleted through `/api/texts/<title>/<lang>/<versionTitle>`, which works only by a forward; this calls the endpoint itself.
 *
 * @feature VER-030 Moderator edits or deletes a version
 */
import { deleteRequest, postForm } from "~/lib/auth/http";
import { encodeTitle } from "~/lib/ref/url";
import type { VersionMeta } from "~/lib/text/model";

/** The old updateableVersionAttributes, in the editor's order. */
export const EDITABLE_VERSION_FIELDS = [
  "versionTitle", "versionSource", "versionNotes", "license", "priority", "digitizedBySefaria", "status", "direction", "isSource",
  "isPrimary", "versionTitleInHebrew", "shortVersionTitle", "shortVersionTitleInHebrew", "versionNotesInHebrew",
  "purchaseInformationImage", "purchaseInformationURL",
] as const;
export type VersionField = (typeof EDITABLE_VERSION_FIELDS)[number];
export type VersionDraft = Partial<Record<VersionField, string | number | boolean | null | undefined>>;

export function versionDraft(v: VersionMeta): VersionDraft {
  const out: VersionDraft = {};
  for (const f of EDITABLE_VERSION_FIELDS) out[f] = (v as unknown as Record<string, VersionDraft[VersionField]>)[f];
  return out;
}

/**
 * The old saveVersionUpdate payload: every field that has a value or changed (so a cleared field is sent as cleared), never
 * versionTitle itself — a changed one goes as newVersionTitle.
 */
export function versionFlagsPayload(original: VersionMeta, draft: VersionDraft): Record<string, unknown> {
  const before = versionDraft(original);
  const payload: Record<string, unknown> = {};
  for (const f of EDITABLE_VERSION_FIELDS) {
    const value = draft[f];
    if (value || value !== before[f]) payload[f] = value;
  }
  delete payload.versionTitle;
  if (draft.versionTitle !== original.versionTitle) payload.newVersionTitle = draft.versionTitle;
  return payload;
}

const langOf = (v: VersionMeta): "en" | "he" => (v.language === "he" ? "he" : "en");

export async function saveVersionFlags(bookTitle: string, v: VersionMeta, payload: Record<string, unknown>): Promise<void> {
  const res = await postForm(
    `/api/version/flags/${encodeTitle(bookTitle)}/${langOf(v)}/${encodeTitle(v.versionTitle)}`,
    new URLSearchParams({ json: JSON.stringify(payload) }),
  );
  const data = res.data as { status?: string; error?: string };
  if (!res.ok || data.status !== "ok") throw new Error(data.error ?? (res.networkError ? "Something went wrong. Sorry!" : `HTTP ${res.status}`));
}

export async function deleteVersion(bookTitle: string, v: VersionMeta): Promise<void> {
  const res = await deleteRequest(`/api/texts/${encodeTitle(bookTitle)}?${new URLSearchParams({ [`v${langOf(v)}`]: v.versionTitle })}`);
  const data = res.data as { status?: string; error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? "Something went wrong. Sorry!");
}
