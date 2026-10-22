import { useId, useState, type FocusEvent, type ChangeEvent, type InputHTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import styles from "./TextField.module.css";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "onBlur" | "dir"> {
  type?: "text" | "email" | "password";
  value: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  label?: ReactNode;
  name?: string;
  id?: string;
  /** The inline error under the field (or nothing). */
  error?: ReactNode;
  /** Direction of the value only (e.g. "ltr" for email and password in a Hebrew interface). */
  inputDir?: "ltr" | "rtl";
  /** The design's "with link" variant: a link at the end of the label row ("Forgot Password?"). */
  trailingLink?: { text: ReactNode; href?: string; onClick?: (e: MouseEvent<HTMLAnchorElement> | KeyboardEvent<HTMLAnchorElement>) => void };
  /** Accessible names of the show / hide password control. */
  revealLabel?: string;
  hideLabel?: string;
}

/**
 * A labelled text, email or password field with its inline error (Figma "Input Field"): label row (with an optional trailing
 * link), the control, a show/hide toggle for passwords once something is typed, and the error with its icon. Controlled; the
 * parent owns value and validation. Ported from static/js/common/Input.jsx and common-component.scss.
 *
 * @feature ACC-009 Email and password login
 * @feature ACC-010 Email registration with reCAPTCHA
 */
export function TextField({
  type = "text", value, onChange, onBlur, label, name, id, error, disabled, required, inputDir, autoComplete, placeholder, trailingLink,
  revealLabel = "Show password", hideLabel = "Hide password", ...rest
}: TextFieldProps) {
  const auto = useId();
  const inputId = id || name || auto;
  const errorId = error ? `${inputId}-error` : undefined;
  const isPassword = type === "password";
  const [revealed, setRevealed] = useState(false);
  return (
    <div className={styles.field} data-error={error ? "true" : undefined} data-disabled={disabled ? "true" : undefined}>
      {label || trailingLink ? (
        <div className={styles.labelRow}>
          {label ? <label className={styles.label} htmlFor={inputId} data-input-label="">{label}</label> : <span />}
          {trailingLink ? (
            <a
              className={styles.trailingLink}
              data-trailing-link=""
              href={trailingLink.href}
              onClick={trailingLink.onClick}
              {...(!trailingLink.href
                ? { tabIndex: 0, role: "link", onKeyDown: (e: KeyboardEvent<HTMLAnchorElement>) => e.key === "Enter" && trailingLink.onClick?.(e) }
                : {})}
            >
              {trailingLink.text}
            </a>
          ) : null}
        </div>
      ) : null}
      <div className={styles.control} data-trailing-icon={isPassword ? "true" : undefined}>
        <input
          {...rest}
          id={inputId}
          name={name}
          type={isPassword && revealed ? "text" : type}
          className={styles.input}
          data-input-control=""
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          dir={inputDir}
          autoComplete={autoComplete}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={errorId}
        />
        {isPassword && !disabled && value ? (
          <button type="button" className={styles.reveal} onClick={() => setRevealed((r) => !r)} aria-label={revealed ? hideLabel : revealLabel} aria-pressed={revealed}>
            <img src={`/auth/icons/${revealed ? "eye-off" : "eye"}.svg`} alt="" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {error ? (
        <div className={styles.error} id={errorId} role="alert">
          <img className={styles.errorIcon} src="/auth/icons/info-error.svg" alt="" aria-hidden="true" />
          {error}
        </div>
      ) : null}
    </div>
  );
}
