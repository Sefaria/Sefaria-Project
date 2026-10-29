/**
 * Whether the signed-in reader gets the Library Assistant, and the token that names them to it: `GET /api/library-assistant`
 * (reader/views.py `library_assistant_api`). The server decides, as for sefaria.org's pages (library_assistant.is_enabled, the
 * token minted with CHATBOT_USER_ID_SECRET); this client never sees the secret. User data: memory only, never on disk.
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
