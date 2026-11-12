/**
 * The newsletter sign-up of the sidebar's Stay Connected module (static/js/NewsletterSignUpForm.jsx → Sefaria.subscribeSefariaNewsletter):
 * `POST /api/subscribe/<email>` with a JSON body `{language, educator, firstName, lastName}` and the CSRF token. Django answers
 * `{status: "ok"}`, or `{error}` (shown to the reader as it is).
 *
 * @feature LIB-050 Sidebar module: Stay Connected
 * @feature PRM-016 Newsletter signup form
 */
import { postJson } from "~/lib/auth/http";

export interface NewsletterSignUp {
  firstName: string;
  lastName: string;
  email: string;
  educator: boolean;
  interfaceLang: "english" | "hebrew";
}

/** What the old form shows after an answer that is not ok (it threw "Error posting to API" for a failed status). */
export const SUBSCRIBE_FAILED = "Error posting to API";

/** The address, with the email in the path as the old client wrote it (not encoded). */
export const subscribeUrl = (email: string) => `/api/subscribe/${email}`;

/** The old client's validator (static/js/sefaria/util.js isValidEmailAddress), same pattern. */
const EMAIL_RE =
  // eslint-disable-next-line no-control-regex, no-useless-escape -- the old client's pattern verbatim, so both accept the same addresses
  /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[ -퟿豈-﷏ﷰ-￯])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[ -퟿豈-﷏ﷰ-￯])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[ -퟿豈-﷏ﷰ-￯])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[ -퟿豈-﷏ﷰ-￯]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[ -퟿豈-﷏ﷰ-￯])|(([a-z]|\d|[ -퟿豈-﷏ﷰ-￯])([a-z]|\d|-|\.|_|~|[ -퟿豈-﷏ﷰ-￯])*([a-z]|\d|[ -퟿豈-﷏ﷰ-￯])))\.)+(([a-z]|[ -퟿豈-﷏ﷰ-￯])|(([a-z]|[ -퟿豈-﷏ﷰ-￯])([a-z]|\d|-|\.|_|~|[ -퟿豈-﷏ﷰ-￯])*([a-z]|[ -퟿豈-﷏ﷰ-￯])))\.?$/i;
export const isValidEmailAddress = (email: string) => EMAIL_RE.test(email);

/** Subscribe; resolves when Django said ok, rejects with the message the form shows otherwise. */
export async function subscribeNewsletter(s: NewsletterSignUp): Promise<void> {
  const res = await postJson(subscribeUrl(s.email), { language: s.interfaceLang === "hebrew" ? "he" : "en", educator: s.educator, firstName: s.firstName, lastName: s.lastName });
  if (res.networkError || !res.ok) throw new Error(SUBSCRIBE_FAILED);
  const error = res.data.error;
  if (error) throw new Error(typeof error === "string" ? error : SUBSCRIBE_FAILED);
}
