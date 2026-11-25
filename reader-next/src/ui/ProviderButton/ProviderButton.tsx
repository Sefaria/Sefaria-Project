import type { ReactNode, Ref } from "react";
import styles from "./ProviderButton.module.css";

export type Provider = "google" | "apple";

export interface ProviderButtonProps {
  provider: Provider;
  /** "Continue with Google" … */
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  id?: string;
  /**
   * Google only: the element the real (invisible) Google button is placed over. Google's button lives in a cross-origin iframe,
   * so the click must land on its own pixels; this renders a positioned shell instead of a <button>, and the iframe inside it
   * is the focusable control.
   */
  trackingRef?: Ref<HTMLDivElement>;
}

/**
 * "Continue with Google / Apple" (Figma "Buttons [for now]"): white, navy outline, provider mark. Ported from
 * static/js/auth/ProviderButton.jsx and the .sefaria-provider-button rules of auth.scss.
 *
 * @feature ACC-012 Sign in with Google and Apple
 */
export function ProviderButton({ provider, label, onClick, disabled = false, id, trackingRef }: ProviderButtonProps) {
  const content = (
    <>
      <img src={`/auth/icons/${provider}.svg`} className={styles.icon} alt="" aria-hidden="true" />
      <span>{label}</span>
    </>
  );
  if (trackingRef) {
    return (
      <div id={id} ref={trackingRef} className={styles.shell} data-disabled={disabled ? "true" : undefined} aria-disabled={disabled || undefined} tabIndex={-1}>
        <div className={styles.button} data-provider-button="" aria-hidden="true">
          {content}
        </div>
      </div>
    );
  }
  return (
    <button id={id} type="button" className={styles.button} data-provider-button="" onClick={onClick} disabled={disabled}>
      {content}
    </button>
  );
}

/**
 * The real Google button's holder, portaled into the registered target and stretched over it, nearly transparent: the reader sees
 * our button and clicks Google's. Only takes clicks once Google's button is ready.
 */
export function ProviderSdkOverlay({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div className={styles.overlay} data-provider-sdk-overlay="" style={{ pointerEvents: active ? "auto" : "none" }}>
      {children}
    </div>
  );
}
