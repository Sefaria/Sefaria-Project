import { useEffect, useRef, type ReactNode } from "react";
import styles from "./AuthCard.module.css";

export type AuthCardSize = "choose" | "login-email" | "register-email" | "message" | "default";

export interface AuthCardProps {
  /** The title ("Log in", "Create Account" …). */
  heading?: ReactNode;
  /** The line under the title (a cross-link, or the loading line while a request is out). */
  sub?: ReactNode;
  /** Shows the back arrow (the email step returns to the choice). */
  onBack?: () => void;
  /** The back arrow's accessible name. */
  backLabel?: string;
  /** Minimum heights from the design, per view, so swapping views does not jump. */
  size?: AuthCardSize;
  children?: ReactNode;
}

/**
 * The white auth card on the navy background (Figma "Form Card"): heading, optional sub-line, optional back arrow, content capped
 * at 348px. The auth page swaps cards instead of navigating, so each card focuses its heading when it mounts (tabIndex -1): the
 * "you are now here" cue a page load would give. Full width at 842px and below. Ported from static/js/auth/AuthCard.jsx and the
 * .sefaria-auth-card rules of static/css/auth.scss.
 *
 * @feature ACC-008 Auth page with choose / email views
 */
export function AuthCard({ heading, sub, onBack, backLabel = "Back", size = "default", children }: AuthCardProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <div className={styles.card} data-size={size} data-auth-card="">
      {onBack ? (
        <button type="button" className={styles.back} onClick={onBack} aria-label={backLabel} data-auth-back="">
          <img src="/auth/icons/arrow-left.svg" alt="" aria-hidden="true" />
        </button>
      ) : null}
      {heading || sub ? (
        <div className={styles.header}>
          {heading ? (
            <h1 ref={headingRef} tabIndex={-1} className={styles.heading}>
              {heading}
            </h1>
          ) : null}
          {sub ? <div className={styles.sub} data-auth-sub="">{sub}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** The sub-line while a request is out: a small spinner and "Loading". */
export function AuthLoadingLine({ label }: { label: ReactNode }) {
  return (
    <span className={styles.loading} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      {label}
    </span>
  );
}

/** A vertical stack inside a card (12px apart), for a lone button under a message. */
export function AuthStack({ children }: { children: ReactNode }) {
  return <div className={styles.stack}>{children}</div>;
}
