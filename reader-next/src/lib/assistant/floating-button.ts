/**
 * The Library Assistant's "Hide Ask button" choice, saved to a signed-in reader's account (sefaria.org master #4004, ReaderApp's
 * handleChatbotLauncherVisibility). The widget fires `chatbot:launcher_visibility` (`detail.hidden`) on the document when a visitor
 * hides or shows its floating Ask button from its menu. Signed in, the choice is kept in the access query (so a remounted
 * `<lc-chatbot>` gets the current value as `hide-launcher`, not the one first read) and posted to `POST /api/profile` as
 * `settings.library_assistant_floating_button_hidden` (Django normalises it: sefaria/helper/library_assistant.py
 * FLOATING_BUTTON_HIDDEN_KEY), so the legacy client and other devices start with it. Signed out, nothing is saved: the widget keeps
 * the choice in that browser itself.
 *
 * @feature AI-011 Library Assistant chatbot widget
 */
import type { QueryClient } from "@tanstack/react-query";
import { postForm } from "~/lib/auth/http";
import { assistantAccessQuery } from "./access";

export const FLOATING_BUTTON_HIDDEN_KEY = "library_assistant_floating_button_hidden";

/** What a `chatbot:launcher_visibility` event says: hidden (true), shown (false), or nothing usable (null). */
export function launcherHiddenFromDetail(detail: unknown): boolean | null {
  const hidden = detail && typeof detail === "object" ? (detail as { hidden?: unknown }).hidden : undefined;
  return typeof hidden === "boolean" ? hidden : null;
}

/** Keep a signed-in reader's choice (uid; null when signed out, which saves nothing). */
export async function saveFloatingButtonHidden(queryClient: QueryClient, uid: number | null, hidden: boolean): Promise<void> {
  if (uid === null) return;
  queryClient.setQueryData(assistantAccessQuery(uid).queryKey, (prev) => (prev ? { ...prev, floatingButtonHidden: hidden } : prev));
  // profile_api reads a form field `json` (the old Sefaria.editProfileAPI); it merges `settings` into the saved ones
  await postForm("/api/profile", new URLSearchParams({ json: JSON.stringify({ settings: { [FLOATING_BUTTON_HIDDEN_KEY]: hidden } }) }));
}
