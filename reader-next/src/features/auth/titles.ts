import type { AuthFlow } from "~/lib/auth/utils";

/** The pages' titles, Django's (sefaria/views.py; Hebrew from locale/he — "Reset Your Password" has no Hebrew there). */
const TITLES = {
  login: { en: "Log in to Sefaria", he: "כניסה לחשבון בספריא" },
  register: { en: "Create an Account", he: "יצירת חשבון" },
  reset: { en: "Reset Your Password", he: "Reset Your Password" },
} as const;

/** A route's `head` for one auth flow. */
export const authHead = (flow: AuthFlow) => ({ match }: { match: unknown }) => {
  const lang = (match as { context?: { interfaceLang?: string } }).context?.interfaceLang;
  return { meta: [{ title: lang === "hebrew" ? TITLES[flow].he : TITLES[flow].en }] };
};
