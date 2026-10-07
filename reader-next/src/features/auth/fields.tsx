import type { ChangeEvent, FocusEvent, KeyboardEvent, MouseEvent } from "react";
import { TextField } from "~/ui/TextField/TextField";
import { AuthText, useAuthString } from "~/ui/AuthText/AuthText";
import { fieldError } from "./FormView";

/** Email Address field (type email, LTR value, you@example.com). Ported from static/js/auth/EmailInput.jsx. */
export function EmailInput({ value, onChange, onBlur, error }: { value: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; onBlur?: (e: FocusEvent<HTMLInputElement>) => void; error?: string | null }) {
  return (
    <TextField
      label={<AuthText k="auth.email_address" />}
      type="email"
      name="email"
      inputDir="ltr"
      autoComplete="email"
      placeholder="you@example.com"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      error={fieldError(error)}
    />
  );
}

/** Password field (masked, LTR value, show/hide). Ported from static/js/auth/PasswordInput.jsx. */
export function PasswordInput({
  label = "auth.password", name = "password", autoComplete = "current-password", value, onChange, onBlur, trailingLink, error,
}: {
  label?: string;
  name?: string;
  autoComplete?: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  trailingLink?: { text: string; onClick: (e: MouseEvent<HTMLAnchorElement> | KeyboardEvent<HTMLAnchorElement>) => void };
  error?: string | null;
}) {
  const t = useAuthString();
  return (
    <TextField
      label={<AuthText k={label} />}
      type="password"
      name={name}
      inputDir="ltr"
      autoComplete={autoComplete}
      placeholder="••••••••"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      trailingLink={trailingLink ? { text: <AuthText k={trailingLink.text} />, onClick: trailingLink.onClick } : undefined}
      revealLabel={t("auth.show_password")}
      hideLabel={t("auth.hide_password")}
      error={fieldError(error)}
    />
  );
}
