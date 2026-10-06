import type { SignUpKind } from "~/lib/auth/signup-content";
import { signUpContent } from "~/lib/auth/signup-content";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Button } from "../Button/Button";
import { Icon } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { Modal } from "../Modal/Modal";
import styles from "./SignUpModal.module.css";
import { SITE_ORIGIN } from "~/lib/config";

export interface SignUpModalProps {
  /** Which action asked: it picks the words. Closed when undefined. */
  kind?: SignUpKind;
  onClose: () => void;
  /** Where signing up or in comes back to (the current address). */
  next: string;
  /** Where the account pages live. */
  accountOrigin?: string;
}

/**
 * Shown when someone not signed in tries an action that needs an account: what an account is for, and Sign Up / Sign in.
 * Both go to the account pages with the current address as `next`; this client has no sign-in of its own yet.
 *
 * @feature GUI-004 Sign-up modal for anonymous users
 */
export function SignUpModal({ kind, onClose, next, accountOrigin = SITE_ORIGIN }: SignUpModalProps) {
  const lang = useInterfaceLang();
  const code = lang === "hebrew" ? "he" : "en";
  const c = signUpContent(kind);
  const q = `?next=${encodeURIComponent(next)}`;
  return (
    <Modal open={kind !== undefined} onClose={onClose} label={lang === "hebrew" ? "הרשמה לספריא" : "Sign up for Sefaria"}>
      <div className={styles.content} lang={code}>
        <h2 className={styles.h2} lang={code}><InterfaceText en={c.h2.en} he={c.h2.he} /></h2>
        {c.h3 ? <h3 className={styles.h3}><InterfaceText en={c.h3.en} he={c.h3.he} /></h3> : null}
        <ul className={styles.bullets}>
          {c.bullets.map((b) => (
            <li key={b.text.en}>
              <Icon name={b.icon} />
              <InterfaceText en={b.text.en} he={b.text.he} />
            </li>
          ))}
        </ul>
        <div className={styles.cta}>
          <Button href={`${accountOrigin}/register${q}`} data-signup-source={`signup_modal_${(kind ?? "default").replace(/-/g, "_")}`}>
            <InterfaceText en="Sign Up" he="להרשמה" />
          </Button>
        </div>
        <p className={styles.signin}>
          <InterfaceText en="Already have an account?" he="כבר יש לכם חשבון?" />{" "}
          <Link href={`${accountOrigin}/login${q}`}><InterfaceText en="Sign in" he="התחברו" /></Link>
        </p>
      </div>
    </Modal>
  );
}
