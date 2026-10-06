import { useId, useState, type FormEvent } from "react";
import { FEEDBACK_TYPES, isValidEmail, type FeedbackType } from "~/lib/feedback/feedback";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Button } from "../Button/Button";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./FeedbackView.module.css";

export interface FeedbackSubmission {
  type: FeedbackType;
  msg: string;
  /** Null when the reader is signed in (the account's address is used). */
  email: string | null;
}

export interface FeedbackViewProps {
  /** Send it. Rejecting shows the error and keeps what was typed. */
  onSubmit: (s: FeedbackSubmission) => Promise<void> | void;
  /** Signed-in readers are not asked for an email. */
  signedIn?: boolean;
}

/**
 * Feedback: a type, a message and (signed out) an email. "Feedback sent!" shows as soon as Submit is pressed, as on the
 * old site; unlike the old site a failed send brings the form back with the error instead of leaving "sent" up.
 *
 * @feature CON-067 Feedback / report an issue
 */
export function FeedbackView({ onSubmit, signedIn }: FeedbackViewProps) {
  const lang = useInterfaceLang();
  const he = lang === "hebrew";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const ids = { type: useId(), msg: useId(), email: useId() };
  const [type, setType] = useState<FeedbackType | "">("");
  const [msg, setMsg] = useState("");
  const [email, setEmail] = useState("");
  const [alert, setAlert] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className={styles.view} lang={he ? "he" : "en"}>
        <p className={styles.sent} role="status"><InterfaceText en="Feedback sent!" he="משוב נשלח!" /></p>
      </div>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!type) return setAlert(t("Please select a feedback type", "אנא בחרו סוג משוב"));
    if (!signedIn && !isValidEmail(email)) return setAlert(t("Please enter a valid email address", "אנא הזינו כתובת דוא\"ל תקינה"));
    setAlert(null);
    setSent(true);
    try {
      await onSubmit({ type, msg, email: signedIn ? null : email });
    } catch {
      setSent(false);
      setAlert(t("Unfortunately, there was an error sending this feedback. Please try again or try reloading this page.", "לצערנו ארעה שגיאה בשליחת המשוב. אנא נסו שוב או רעננו את הדף הנוכחי"));
    }
  };
  return (
    <form className={styles.view} lang={he ? "he" : "en"} onSubmit={(e) => void submit(e)} noValidate>
      <p className={styles.intro}><InterfaceText en="Have some feedback? We would love to hear it." he="אנחנו מעוניינים במשוב ממך" /></p>
      {alert ? <p className={styles.alert} role="alert">{alert}</p> : null}
      <select id={ids.type} className={styles.field} aria-label={t("Select Type", "סוג משוב")} value={type} onChange={(e) => setType(e.target.value as FeedbackType | "")}>
        <option value="">{t("Select Type", "סוג משוב")}</option>
        {FEEDBACK_TYPES.map((f) => (
          <option key={f.value} value={f.value}>{he ? f.label.he : f.label.en}</option>
        ))}
      </select>
      <textarea id={ids.msg} className={styles.field} aria-label={t("Describe the issue...", "טקסט המשוב")} placeholder={t("Describe the issue...", "טקסט המשוב")} value={msg} onChange={(e) => setMsg(e.target.value)} />
      {signedIn ? null : (
        <input id={ids.email} className={styles.field} type="email" aria-label={t("Email Address", "כתובת דוא\"ל")} placeholder={t("Email Address", "כתובת דוא\"ל")} value={email} onChange={(e) => setEmail(e.target.value)} />
      )}
      <div><Button type="submit"><InterfaceText en="Submit" he="שליחה" /></Button></div>
    </form>
  );
}
