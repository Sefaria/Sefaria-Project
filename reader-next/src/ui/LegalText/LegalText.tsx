import { SITE_ORIGIN } from "~/lib/config";
import { AuthText } from "../AuthText/AuthText";
import styles from "./LegalText.module.css";

/**
 * "By continuing, you are agreeing to Sefaria's Terms of Use and Privacy Policy." — both open in a new tab. Ported from
 * static/js/auth/LegalText.jsx.
 *
 * @feature ACC-008 Auth page with choose / email views
 */
export function LegalText({ origin = SITE_ORIGIN }: { origin?: string }) {
  return (
    <p className={styles.legal} data-legal-text="">
      <AuthText k="auth.terms_prefix" />
      <a href={`${origin}/terms`} target="_blank" rel="noopener noreferrer"><AuthText k="auth.terms_of_use" /></a>
      <AuthText k="auth.terms_conjunction" />
      <a href={`${origin}/privacy-policy`} target="_blank" rel="noopener noreferrer"><AuthText k="auth.privacy_policy" /></a>
      <AuthText k="auth.terms_suffix" />
    </p>
  );
}
