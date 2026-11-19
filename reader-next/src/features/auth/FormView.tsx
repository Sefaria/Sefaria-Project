import { useEffect, useState, type FormEvent, type ReactNode, type Ref } from "react";
import { AuthCard, AuthLoadingLine, type AuthCardSize } from "~/ui/AuthCard/AuthCard";
import { AuthErrorBanner } from "~/ui/AuthErrorBanner/AuthErrorBanner";
import { AuthText, useAuthString } from "~/ui/AuthText/AuthText";
import type { AuthError, FieldErrors } from "~/lib/auth/utils";
import type { ErrorHandler } from "./use-provider-triggers";
import styles from "./AuthPage.module.css";

export type SubmitResult = { error?: AuthError; fieldErrors?: FieldErrors } | undefined | void;

export interface ProviderWiring {
  registerGoogleTarget?: Ref<HTMLElement>;
  triggerApple?: () => void;
  setActiveErrorHandler?: (h: ErrorHandler) => void;
}

export interface FormViewProps extends ProviderWiring {
  size?: AuthCardSize;
  onBack?: () => void;
  heading: ReactNode;
  sub?: ReactNode;
  formId: string;
  onLinkClick?: () => void;
  /** Returns errors to show, or nothing when it has handled success itself (navigation, view switch). */
  onSubmit: () => Promise<SubmitResult>;
  children: (s: { fieldErrors: FieldErrors; submitting: boolean; setFieldError: (name: string, message: string | null) => void }) => ReactNode;
}

/**
 * The shell and bookkeeping of every auth form: card + <form noValidate> + error banner, owning error / field errors / submitting.
 * While mounted it is where an asynchronous Google/Apple failure shows. Ported from static/js/auth/FormView.jsx.
 *
 * @feature ACC-008 Auth page with choose / email views
 */
export function FormView({ size, onBack, heading, sub, formId, registerGoogleTarget, triggerApple, setActiveErrorHandler, onLinkClick, onSubmit, children }: FormViewProps) {
  const [error, setError] = useState<AuthError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const t = useAuthString();

  useEffect(() => {
    setActiveErrorHandler?.(setError);
    return () => setActiveErrorHandler?.(null);
  }, [setActiveErrorHandler]);

  const setFieldError = (name: string, message: string | null) => setFieldErrors((f) => ({ ...f, [name]: message }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    const result = await onSubmit();
    if (!result) return; // handled (navigation / view switch): leave the loading state in place
    if (result.error) setError(result.error);
    if (result.fieldErrors) setFieldErrors(result.fieldErrors);
    setSubmitting(false);
  };

  return (
    <AuthCard size={size} onBack={onBack} backLabel={t("auth.back")} heading={heading} sub={submitting ? <AuthLoadingLine label={<AuthText k="auth.loading" />} /> : sub}>
      <form id={formId} className={styles.form} onSubmit={handleSubmit} noValidate>
        <AuthErrorBanner error={error} registerGoogleTarget={registerGoogleTarget as Ref<HTMLSpanElement>} triggerApple={triggerApple} onLinkClick={onLinkClick} />
        {children({ fieldErrors, submitting, setFieldError })}
      </form>
    </AuthCard>
  );
}

/** A field error: a key (auth.required_field …) or a server message, shown in the interface language. */
export const fieldError = (v: string | null | undefined) => (v ? <AuthText k={v} /> : undefined);
