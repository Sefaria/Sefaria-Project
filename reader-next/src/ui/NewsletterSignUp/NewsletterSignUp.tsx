import { useState, type KeyboardEvent } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { LangText } from "../LangText/LangText";
import styles from "./NewsletterSignUp.module.css";

export interface NewsletterSubscription {
  firstName: string;
  lastName: string;
  email: string;
  educator: boolean;
}

export interface NewsletterSignUpProps {
  /** Sends the sign-up; rejects with the message to show (Django's `error`, or a generic one). */
  subscribe: (s: NewsletterSubscription) => Promise<void>;
  /** After a successful sign-up (the page sends its analytics event). */
  onSubscribed?: () => void;
  /** The old form's email check (static/js/sefaria/util.js isValidEmailAddress). */
  isValidEmail: (email: string) => boolean;
  /** The "I am an educator" checkbox under the names (on by default, as the old form). */
  includeEducatorOption?: boolean;
  placeholder?: { en: string; he: string };
}

type Message = "subscribing" | "subscribed" | "invalidEmail" | "invalidName" | "error" | { raw: string };
const MESSAGES: Record<Exclude<Message, { raw: string }>, { en: string; he: string }> = {
  subscribing: { en: "Subscribing...", he: "Subscribing..." },
  subscribed: { en: "Subscribed! Welcome to our list.", he: "הרשמה בוצעה בהצלחה!" },
  invalidEmail: { en: "Please enter a valid email address.", he: 'כתובת הדוא"ל שהוזנה אינה תקינה.' },
  // the old Hebrew string is English too (static/js/sefaria/i18n/interface/he.json)
  invalidName: { en: "Please enter a valid first and last name", he: "Please enter a valid first and last name" },
  error: { en: "Sorry, there was an error.", he: "סליחה, ארעה שגיאה" },
};
const T = {
  email: { en: "Email address", he: "כתובת אימייל" },
  first: { en: "First Name", he: "שם פרטי" },
  last: { en: "Last Name", he: "שם משפחה" },
  submit: { en: "Submit", he: "שלח" },
  educator: { en: " I am an educator", he: " מורים/ אנשי הוראה" },
};

/**
 * The newsletter sign-up box (the old NewsletterSignUpForm): an email field with an arrow; a valid address opens first and last name
 * fields (and the educator checkbox), whose arrow subscribes. Enter does what the arrow does. Messages under the fields: subscribing,
 * welcome, or what went wrong; after a sign-up the fields stay, disabled.
 *
 * @feature PRM-016 Newsletter signup form
 * @feature LIB-050 Sidebar module: Stay Connected
 */
export function NewsletterSignUp({ subscribe, onSubscribed, isValidEmail, includeEducatorOption = true, placeholder = { en: "Sign up for Newsletter", he: "הרשמו לניוזלטר" } }: NewsletterSignUpProps) {
  const he = useInterfaceLang() === "hebrew";
  const t = (s: { en: string; he: string }) => (he ? s.he : s.en);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [educator, setEducator] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [showNames, setShowNames] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const disabled = subscribed || submitting;

  const submit = () => {
    if (disabled) return;
    if (showNames) {
      if (firstName.length > 0 && lastName.length > 0) {
        setMessage("subscribing");
        setSubmitting(true);
        subscribe({ firstName, lastName, email, educator }).then(
          () => {
            setSubscribed(true);
            setSubmitting(false);
            setMessage("subscribed");
            onSubscribed?.();
          },
          (e: unknown) => {
            setSubmitting(false);
            setMessage(e instanceof Error && e.message ? { raw: e.message } : "error");
            setShowNames(false);
          },
        );
      } else setMessage("invalidName");
    } else if (isValidEmail(email)) setShowNames(true);
    else {
      setShowNames(false);
      setMessage("invalidEmail");
    }
  };
  const onKeyUp = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit();
  };
  const arrow = (
    <button type="button" className={styles.arrow} onClick={submit}>
      {/* the old form's arrow is an <img alt="Submit">: its alt names the button */}
      <img src="/icons/circled-arrow-right.svg" alt={t(T.submit)} />
    </button>
  );
  return (
    <div className={styles.box} dir={he ? "rtl" : "ltr"}>
      <input className={styles.input} type="email" placeholder={t(placeholder)} aria-label={t(T.email)} value={email} disabled={disabled} onChange={(e) => setEmail(e.target.value)} onKeyUp={onKeyUp} />
      {!showNames && !disabled ? arrow : null}
      {showNames ? (
        <>
          {/* the old form focused the first name as it appeared */}
          <input className={styles.input} type="text" placeholder={t(T.first)} aria-label={t(T.first)} value={firstName} autoFocus disabled={disabled} onChange={(e) => setFirstName(e.target.value)} onKeyUp={onKeyUp} />
          <input className={styles.input} type="text" placeholder={t(T.last)} aria-label={t(T.last)} value={lastName} disabled={disabled} onChange={(e) => setLastName(e.target.value)} onKeyUp={onKeyUp} />
          {includeEducatorOption ? (
            <div className={styles.educator}>
              <label>
                <input type="checkbox" checked={educator} disabled={disabled} onChange={(e) => setEducator(e.target.checked)} />
                <LangText lang={he ? "he" : "en"}>{t(T.educator)}</LangText>
              </label>
            </div>
          ) : null}
          {!disabled ? arrow : null}
        </>
      ) : null}
      {message ? (
        <div className={styles.message} role="status">
          {typeof message === "object" ? message.raw : t(MESSAGES[message])}
        </div>
      ) : null}
    </div>
  );
}
