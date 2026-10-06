/**
 * Feedback from the sidebar: the types, validation and the request the old FeedbackBox sends
 * (`POST /api/send_feedback`, form field `json` = {refs, type, url, currVersions, email, msg, uid}).
 *
 * Nothing here runs unless a reader presses Submit; automated tests intercept the request and never send one.
 *
 * @feature CON-067 Feedback / report an issue
 */
import { SEFARIA_API_ORIGIN, SefariaApiError } from "~/lib/api/client";

export const FEEDBACK_TYPES = [
  { value: "content_issue", label: { en: "Report an issue with the text", he: "דיווח על בעיה בטקסט" } },
  { value: "translation_request", label: { en: "Request translation", he: "בקשה לתרגום" } },
  { value: "bug_report", label: { en: "Report a bug", he: "דיווח על תקלה באתר" } },
  { value: "help_request", label: { en: "Get help", he: "עזרה" } },
  { value: "feature_request", label: { en: "Request a feature", he: "בקשה להוספת אפשרות באתר" } },
  { value: "good_vibes", label: { en: "Give thanks", he: "תודה" } },
  { value: "other", label: { en: "Other", he: "אחר" } },
] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number]["value"];

const EMAIL = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
export const isValidEmail = (email: string): boolean => EMAIL.test(email);

export interface FeedbackPayload {
  refs: string[] | null;
  type: FeedbackType;
  url: string | null;
  /** The versions on screen as the old client names them: { en: {languageFamilyName, versionTitle}, he: … }. */
  currVersions?: Record<string, { languageFamilyName: string; versionTitle: string } | undefined>;
  email: string | null;
  msg: string;
  uid: number | null;
}

/** "english|The Title" → { languageFamilyName, versionTitle }. */
export function currVersionsOf(primary?: string, translation?: string): FeedbackPayload["currVersions"] {
  const one = (v?: string) => {
    const i = v?.indexOf("|") ?? -1;
    return v && i > 0 ? { languageFamilyName: v.slice(0, i), versionTitle: v.slice(i + 1) } : undefined;
  };
  return { en: one(translation), he: one(primary) };
}

export async function sendFeedback(payload: FeedbackPayload): Promise<void> {
  const r = await fetch(`${SEFARIA_API_ORIGIN}/api/send_feedback`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ json: JSON.stringify(payload) }),
  });
  if (!r.ok) throw new SefariaApiError(`Sending feedback: HTTP ${r.status}`, r.status);
  const body = (await r.json().catch(() => ({}))) as { error?: string };
  if (body.error) throw new SefariaApiError(body.error, r.status, body);
}
