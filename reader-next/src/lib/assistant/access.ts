/**
 * Whether this visitor gets the Library Assistant. Signed in: the token that names them to it, from `GET /api/library-assistant`
 * (reader/views.py `library_assistant_api`). The server decides, as for sefaria.org's pages (library_assistant.is_enabled, the
 * token minted with CHATBOT_USER_ID_SECRET); this client never sees the secret. User data: memory only, never on disk. Signed out:
 * remote config's switch decides, as base_props does (`chatbot_access_props`, `is_enabled_for_anonymous`).
 *
 * @feature AI-003 Chatbot user token and props
 */
import { queryOptions } from "@tanstack/react-query";
import { sameOrigin } from "~/lib/auth/http";
import { POLICIES } from "~/lib/cache/policies";
import type { AssistantAccess } from "./config";

export const ASSISTANT_ACCESS_URL = "/api/library-assistant";

export const assistantAccessQuery = (uid: number | null) =>
  queryOptions({
    queryKey: ["user", "library-assistant", uid] as const,
    queryFn: async ({ signal }): Promise<AssistantAccess> => {
      const r = await fetch(sameOrigin(ASSISTANT_ACCESS_URL), { credentials: "same-origin", signal });
      if (!r.ok) throw new Error(`Library Assistant: HTTP ${r.status}`);
      const d = (await r.json()) as { enabled?: unknown; userToken?: unknown; isModerator?: unknown };
      const userToken = typeof d.userToken === "string" && d.userToken ? d.userToken : null;
      return { enabled: d.enabled === true && userToken !== null, userToken, isModerator: d.isModerator === true };
    },
    enabled: uid !== null,
    // the token lasts 72 hours; a page that stays open a day still has a good one
    staleTime: 12 * 60 * 60_000,
    gcTime: POLICIES.user.gcTime,
    retry: false,
  });

/** Remote config's switch for signed-out visitors (remote_config/keys.py CHATBOT_ANONYMOUS_ENABLED). */
export const ANONYMOUS_ENABLED_KEY = "feature.chatbot.anonymous_enabled";
/** How many free answers a signed-out visitor gets (CHATBOT_ANONYMOUS_FREE_ANSWERS); the chat server enforces it. */
export const ANONYMOUS_FREE_ANSWERS_KEY = "feature.chatbot.anonymous_free_answers";

/**
 * Whether signed-out visitors get the Library Assistant: on unless remote config turns it off, read as Django reads it
 * (sefaria/helper/library_assistant.py `is_enabled_for_anonymous` and `normalize`: a string is off only when it is "false", "0",
 * "off", "no" or empty; anything else by its truth). /api/remote-config lists every active entry, so this needs no Django change.
 */
export function assistantOnForAnonymous(remoteConfig: Record<string, unknown>): boolean {
  if (!(ANONYMOUS_ENABLED_KEY in remoteConfig)) return true;
  const v = remoteConfig[ANONYMOUS_ENABLED_KEY];
  if (typeof v === "string") return !["false", "0", "off", "no", ""].includes(v.trim().toLowerCase());
  return Boolean(v);
}

/** What a signed-out visitor gets: the assistant without a token (the widget names them itself), per the remote-config switch. */
export const anonymousAccess = (remoteConfig: Record<string, unknown>): AssistantAccess => ({
  enabled: assistantOnForAnonymous(remoteConfig),
  userToken: null,
  isModerator: false,
});
