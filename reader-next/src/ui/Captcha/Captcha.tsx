import type { ReactNode } from "react";
import styles from "./Captcha.module.css";

/**
 * The reCAPTCHA box (the widget itself is the child) with the design's error state: a red outline and an inline message. Ported
 * from static/js/common/Captcha.jsx (Figma "Legal Text & Recaptcha Error State").
 *
 * @feature ACC-010 Email registration with reCAPTCHA
 */
export function Captcha({ error, children }: { error?: ReactNode; children?: ReactNode }) {
  return (
    <div className={styles.captcha} data-error={error ? "true" : undefined}>
      <div className={styles.box}>{children}</div>
      {error ? (
        <div className={styles.error} role="alert">
          <img src="/auth/icons/info-error.svg" alt="" aria-hidden="true" />
          {error}
        </div>
      ) : null}
    </div>
  );
}
