/**
 * The auth page's views, one card each. Ported from static/js/auth/{ChooseView,LoginView,RegisterView,ForgotView,ResetView,
 * ResetExpiredView,MessageView}.jsx — same copy, same requests, same error handling.
 *
 * @feature ACC-008 Auth page with choose / email views
 * @feature ACC-009 Email and password login
 * @feature ACC-010 Email registration with reCAPTCHA
 * @feature ACC-011 Forgot and reset password
 * @feature ACC-012 Sign in with Google and Apple
 */
import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type ReactNode, type Ref } from "react";
import { AuthCard, AuthLoadingLine, AuthStack } from "~/ui/AuthCard/AuthCard";
import { AuthErrorBanner } from "~/ui/AuthErrorBanner/AuthErrorBanner";
import { AuthText, useAuthString } from "~/ui/AuthText/AuthText";
import { Button } from "~/ui/Button/Button";
import { Captcha } from "~/ui/Captcha/Captcha";
import { Divider } from "~/ui/Divider/Divider";
import { LegalText } from "~/ui/LegalText/LegalText";
import { ProviderButton } from "~/ui/ProviderButton/ProviderButton";
import { TextField } from "~/ui/TextField/TextField";
import { EMAIL_EXISTS_ERRORS } from "~/lib/auth/email-exists-errors";
import { postForm, postJson } from "~/lib/auth/http";
import {
  authError, checkPasswordsMatch, emailValidate, onBlurValidate, onChangeClear, pickFirstError, requiredFieldValidate, safeNext, whenReady,
  type AuthError, type FieldErrors,
} from "~/lib/auth/utils";
import { EmailInput, PasswordInput } from "./fields";
import { FormView, fieldError, type ProviderWiring } from "./FormView";
import styles from "./AuthPage.module.css";

export interface AuthFields {
  email: string;
  password: string;
  first: string;
  last: string;
}
type SetField = (k: keyof AuthFields) => (e: ChangeEvent<HTMLInputElement>) => void;
type SwitchFlow = (f: "login" | "register") => (e?: MouseEvent<HTMLElement>) => void;

const Primary = ({ children, onClick, disabled, type = "submit" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "submit" | "button" }) => (
  <Button variant="primary" size="xl" block type={type} onClick={onClick} disabled={disabled} data-auth-primary="">
    {children}
  </Button>
);

const LoginCrossLink = ({ switchFlow }: { switchFlow: SwitchFlow }) => (
  <>
    <AuthText k="auth.dont_have_an_account" />{" "}
    <a href="/register" data-signup-source="login_crosslink" onClick={switchFlow("register")}>
      <AuthText k="header.sign_up" />
    </a>
  </>
);
const RegisterCrossLink = ({ switchFlow }: { switchFlow: SwitchFlow }) => (
  <>
    <AuthText k="auth.already_have_an_account" />{" "}
    <a href="/login" onClick={switchFlow("login")}>
      <AuthText k="auth.log_in_link" />
    </a>
  </>
);

// ---- Choose ---------------------------------------------------------------------------------------------------------------------

export function ChooseView({
  flow, switchFlow, onEmailClick, googleReady, appleReady, ssoLoading, registerGoogleTarget, triggerApple, setActiveErrorHandler,
  googleClientId, appleClientId,
}: ProviderWiring & {
  flow: "login" | "register";
  switchFlow: SwitchFlow;
  onEmailClick: () => void;
  googleReady?: boolean;
  appleReady?: boolean;
  ssoLoading?: boolean;
  googleClientId?: string;
  appleClientId?: string;
}) {
  const [error, setError] = useState<AuthError | null>(null);
  useEffect(() => {
    setActiveErrorHandler?.(setError);
    return () => setActiveErrorHandler?.(null);
  }, [setActiveErrorHandler]);
  const isLogin = flow === "login";
  return (
    <AuthCard
      size="choose"
      heading={<AuthText k={isLogin ? "header.log_in" : "auth.create_account"} />}
      sub={ssoLoading ? <AuthLoadingLine label={<AuthText k="auth.loading" />} /> : isLogin ? <LoginCrossLink switchFlow={switchFlow} /> : <RegisterCrossLink switchFlow={switchFlow} />}
    >
      <AuthErrorBanner error={error} registerGoogleTarget={registerGoogleTarget as Ref<HTMLSpanElement>} triggerApple={triggerApple} />
      <div className={styles.choose}>
        <div className={styles.ssoGroup}>
          <div className={styles.providers}>
            {googleClientId ? (
              <ProviderButton id="google-signin-button" provider="google" label={<AuthText k="auth.continue_with_google" />} disabled={!googleReady} trackingRef={registerGoogleTarget as Ref<HTMLDivElement>} />
            ) : null}
            {appleClientId ? (
              <ProviderButton id="apple-signin-button" provider="apple" label={<AuthText k="auth.continue_with_apple" />} disabled={!appleReady} onClick={triggerApple} />
            ) : null}
          </div>
        </div>
        <Divider label={<AuthText k="auth.or" />} />
        <Primary type="button" onClick={onEmailClick}>
          <AuthText k="auth.continue_with_email" />
        </Primary>
        <LegalText />
      </div>
    </AuthCard>
  );
}

// ---- Login ----------------------------------------------------------------------------------------------------------------------

export function LoginView({
  switchFlow, fields, setField, onBack, onForgotClick, next, navigate, ...wiring
}: ProviderWiring & {
  switchFlow: SwitchFlow;
  fields: AuthFields;
  setField: SetField;
  onBack: () => void;
  onForgotClick: (e: { preventDefault: () => void }) => void;
  next: string;
  navigate: (href: string) => void;
}) {
  const onSubmit = async () => {
    const { ok, data } = await postJson("/api/auth/login", { email: fields.email, password: fields.password });
    if (ok) {
      navigate(safeNext(next));
      return;
    }
    return { error: authError(data, "auth.invalid_credentials") };
  };
  return (
    <FormView size="login-email" onBack={onBack} heading={<AuthText k="header.log_in" />} sub={<LoginCrossLink switchFlow={switchFlow} />} formId="login-form" onSubmit={onSubmit} {...wiring}>
      {({ submitting }) => (
        <>
          <div className={styles.fields}>
            <EmailInput value={fields.email} onChange={setField("email")} />
            <PasswordInput value={fields.password} onChange={setField("password")} trailingLink={{ text: "auth.forgot_password", onClick: onForgotClick }} />
          </div>
          <Primary disabled={submitting}>
            <AuthText k="header.log_in" />
          </Primary>
        </>
      )}
    </FormView>
  );
}

// ---- Register -------------------------------------------------------------------------------------------------------------------

const FIELD_MAP: Record<string, keyof AuthFields> = { email: "email", password1: "password", first_name: "first", last_name: "last" };
// 'required' is Django's stable error code (sefaria/views.py::_web_register_errors), not the translated message
const BACKEND_MESSAGES: Record<string, string> = { required: "auth.required_field" };

export function RegisterView({
  switchFlow, fields, setField, onBack, endProcess, next, navigate, recaptchaSiteKey, ...wiring
}: ProviderWiring & {
  switchFlow: SwitchFlow;
  fields: AuthFields;
  setField: SetField;
  onBack: () => void;
  endProcess: (status: string, error?: string | null) => void;
  next: string;
  navigate: (href: string) => void;
  recaptchaSiteKey?: string;
}) {
  const t = useAuthString();
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const captchaToken = useRef("");
  const captchaWidgetId = useRef<number | null>(null);
  const captchaObserver = useRef<ResizeObserver | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!recaptchaSiteKey) {
      captchaWidgetId.current = null;
      captchaToken.current = "";
      return;
    }
    // reCAPTCHA always draws 304×78px: scale the slot to its box, anchored to the physical edge of the reading direction
    const scaleWidget = () => {
      const slot = slotRef.current;
      if (!slot?.firstElementChild) return;
      const box = slot.parentElement;
      if (!box) return;
      const scale = box.offsetWidth / 304;
      const isRtl = getComputedStyle(slot).direction === "rtl";
      Object.assign(slot.style, {
        display: "block", width: "304px", height: "78px", marginLeft: isRtl ? "auto" : "1px", marginRight: isRtl ? "1px" : "auto", marginTop: "1px",
        transform: `scale(${scale})`, transformOrigin: isRtl ? "right top" : "left top",
      });
      box.style.height = `${Math.round(78 * scale)}px`;
    };
    const renderWidget = () => {
      const slot = slotRef.current;
      if (!slot || captchaWidgetId.current !== null || !window.grecaptcha?.render) return;
      try {
        captchaWidgetId.current = window.grecaptcha.render(slot, {
          sitekey: recaptchaSiteKey,
          callback: (tok: string) => (captchaToken.current = tok),
          "expired-callback": () => (captchaToken.current = ""),
        });
        scaleWidget();
        const box = slot.parentElement;
        if (box && typeof ResizeObserver !== "undefined") {
          captchaObserver.current = new ResizeObserver(scaleWidget);
          captchaObserver.current.observe(box);
        }
      } catch {
        /* not ready / already rendered */
      }
    };
    const cancel = whenReady(
      () => window.grecaptcha?.render,
      () => (window.grecaptcha!.ready ? window.grecaptcha!.ready(renderWidget) : renderWidget()),
    );
    return () => {
      cancel();
      captchaObserver.current?.disconnect();
      captchaObserver.current = null;
    };
  }, [recaptchaSiteKey]);

  const onSubmit = async () => {
    setCaptchaError(null);
    // the /register view's JSON ("noredirect") mode: server-side captcha check and the full onboarding
    const body = new URLSearchParams();
    body.set("email", fields.email);
    body.set("password1", fields.password);
    body.set("first_name", fields.first);
    body.set("last_name", fields.last);
    body.set("g-recaptcha-response", captchaToken.current || "");
    body.set("next", next || "/");
    body.set("noredirect", "1");
    const { data, networkError } = await postForm("/register", body);
    if (networkError) {
      endProcess("failure", "network_error");
      return { error: authError(null, "auth.generic_error") };
    }
    if (typeof data?.redirect === "string") {
      endProcess("success", null);
      navigate(data.redirect);
      return;
    }
    const message = pickFirstError(data) || "auth.generic_error";
    endProcess("failure", Object.keys(data || {}).filter((k) => k !== "_auth").map((k) => `${k}: ${data[k]}`).join(" | "));
    const newFieldErrors: FieldErrors = {};
    let hasUnknownError = false;
    let emailExistsError: AuthError | null = null;
    for (const [key, val] of Object.entries(data || {})) {
      if (key === "_auth" || key === "captcha") continue;
      const mapped = FIELD_MAP[key];
      if (mapped) {
        const raw = typeof val === "string" ? val : String(val);
        if (mapped === "email" && EMAIL_EXISTS_ERRORS[raw]) emailExistsError = EMAIL_EXISTS_ERRORS[raw]!;
        else newFieldErrors[mapped] = BACKEND_MESSAGES[raw] || raw;
      } else {
        hasUnknownError = true;
      }
    }
    if (data?.captcha) setCaptchaError("auth.verify_not_robot");
    if (window.grecaptcha && captchaWidgetId.current !== null) {
      try {
        window.grecaptcha.reset(captchaWidgetId.current);
      } catch {
        /* noop */
      }
      captchaToken.current = "";
    }
    const hasAuthError = !!(data?._auth as { code?: string } | undefined)?.code;
    return {
      error: emailExistsError || (hasAuthError || hasUnknownError ? authError(data, message) : undefined),
      fieldErrors: newFieldErrors,
    };
  };

  return (
    <FormView size="register-email" onBack={onBack} heading={<AuthText k="auth.create_account" />} sub={<RegisterCrossLink switchFlow={switchFlow} />} formId="register-form" onSubmit={onSubmit} onLinkClick={switchFlow("login")} {...wiring}>
      {({ fieldErrors, submitting, setFieldError }) => {
        const clear = (k: keyof AuthFields) => onChangeClear(k, setField(k), requiredFieldValidate, fieldErrors, setFieldError);
        const blur = (k: keyof AuthFields) => onBlurValidate(k, () => requiredFieldValidate(fields[k]), setFieldError);
        return (
          <>
            <div className={styles.fields}>
              <EmailInput value={fields.email} onChange={clear("email")} onBlur={(e) => setFieldError("email", requiredFieldValidate(fields.email) || emailValidate(e.target))} error={fieldErrors.email} />
              <PasswordInput autoComplete="new-password" value={fields.password} onChange={clear("password")} onBlur={blur("password")} error={fieldErrors.password} />
              <TextField label={<AuthText k="common.first_name" />} placeholder={t("common.first_name")} name="first_name" value={fields.first} onChange={clear("first")} onBlur={blur("first")} error={fieldError(fieldErrors.first)} />
              <TextField label={<AuthText k="common.last_name" />} placeholder={t("common.last_name")} name="last_name" value={fields.last} onChange={clear("last")} onBlur={blur("last")} error={fieldError(fieldErrors.last)} />
            </div>
            {recaptchaSiteKey ? (
              <Captcha error={captchaError ? <AuthText k={captchaError} /> : undefined}>
                <div id="auth-captcha-slot" ref={slotRef} />
              </Captcha>
            ) : null}
            <Primary disabled={submitting}>
              <AuthText k="auth.create_account" />
            </Primary>
            <LegalText />
          </>
        );
      }}
    </FormView>
  );
}

// ---- Forgot ---------------------------------------------------------------------------------------------------------------------

/** An SSO-only address gets the same sso_only_account banner as login, with live Continue links. */
export function ForgotView({ emailValue, setField, onSuccess, onBack, ...wiring }: ProviderWiring & { emailValue: string; setField: SetField; onSuccess: () => void; onBack: () => void }) {
  const onSubmit = async () => {
    const { ok, data } = await postJson("/api/auth/password/reset", { email: emailValue });
    if (ok) {
      onSuccess();
      return;
    }
    return { error: authError(data, "auth.generic_error") };
  };
  return (
    <FormView onBack={onBack} heading={<AuthText k="auth.forgot_password" />} formId="forgot-form" onSubmit={onSubmit} {...wiring}>
      {({ submitting }) => (
        <>
          <EmailInput value={emailValue} onChange={setField("email")} />
          <Primary disabled={submitting}>
            <AuthText k="auth.send_reset_link" />
          </Primary>
        </>
      )}
    </FormView>
  );
}

// ---- Reset ----------------------------------------------------------------------------------------------------------------------

/** New password + confirm, posted as JSON to the reset link's own address (Django's CustomPasswordResetConfirmView). */
export function ResetView({ resetUrl, onLinkExpired, onSuccess }: { resetUrl: string; onLinkExpired: () => void; onSuccess: () => void }) {
  const [password1, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");

  const onSubmit = async () => {
    const mismatch = checkPasswordsMatch(password1, password2);
    if (mismatch || !password2) return { fieldErrors: { password2: mismatch || "auth.required_field" } };
    const { ok, data } = await postJson(resetUrl, { new_password1: password1, new_password2: password2 });
    if (ok) {
      onSuccess();
      return;
    }
    if ((data?._auth as { code?: string } | undefined)?.code === "invalid_reset_link") {
      onLinkExpired();
      return;
    }
    if (data?.new_password1 || data?.new_password2) {
      return { fieldErrors: { password1: (data.new_password1 as string) || null, password2: (data.new_password2 as string) || null } };
    }
    return { error: authError(data, "auth.generic_error") };
  };

  return (
    <FormView heading={<AuthText k="auth.reset_password" />} formId="reset-form" onSubmit={onSubmit}>
      {({ fieldErrors, submitting, setFieldError }) => {
        // only blurring Confirm (or submitting) may SET the mismatch; typing may only clear it once the two match
        const change = (setter: (v: string) => void, isPassword2: boolean) =>
          onChangeClear(
            "password2",
            (e: ChangeEvent<HTMLInputElement>) => setter(e.target.value),
            (value) => checkPasswordsMatch(isPassword2 ? password1 : value, isPassword2 ? value : password2),
            fieldErrors,
            setFieldError,
          );
        return (
          <>
            <div className={styles.fields}>
              <PasswordInput label="auth.new_password" name="new_password1" autoComplete="new-password" value={password1} onChange={change(setPassword1, false)} error={fieldErrors.password1} />
              <PasswordInput
                label="auth.confirm_new_password" name="new_password2" autoComplete="new-password" value={password2} onChange={change(setPassword2, true)}
                onBlur={onBlurValidate("password2", () => checkPasswordsMatch(password1, password2), setFieldError)} error={fieldErrors.password2}
              />
            </div>
            <Primary disabled={submitting}>
              <AuthText k="auth.reset_password" />
            </Primary>
          </>
        );
      }}
    </FormView>
  );
}

/**
 * The reset link is (or turned out to be) invalid — expired, used, malformed. One click re-sends a link to the account's own email:
 * Django resolves the account from the link's uid before checking the token.
 */
export function ResetExpiredView({ resetUrl, onResendSuccess, onRequestNewLink }: { resetUrl: string; onResendSuccess: () => void; onRequestNewLink: () => void }) {
  const [noAccountForLink, setNoAccountForLink] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [resending, setResending] = useState(false);
  const handleResend = async () => {
    setError(null);
    setResending(true);
    const { ok, data } = await postJson(resetUrl, { action: "resend" });
    if (ok) onResendSuccess();
    else if ((data?._auth as { code?: string } | undefined)?.code === "no_account_for_link") setNoAccountForLink(true);
    else setError(authError(data, "auth.generic_error"));
    setResending(false);
  };
  return (
    <AuthCard heading={<AuthText k="auth.reset_link_expired_title" />}>
      {noAccountForLink ? (
        <AuthErrorBanner error={{ message: "auth.reset_link_no_account_sub", linkText: "auth.request_new_link" }} onLinkClick={onRequestNewLink} />
      ) : (
        <>
          <AuthErrorBanner error={error} />
          <AuthStack>
            <Primary type="button" onClick={handleResend} disabled={resending}>
              <AuthText k="auth.request_new_link" />
            </Primary>
          </AuthStack>
        </>
      )}
    </AuthCard>
  );
}

/** A terminal message: reset link sent, password reset. */
export function MessageView({ heading, sub, children }: { heading: string; sub?: string; children?: ReactNode }) {
  return (
    <AuthCard size="message" heading={<AuthText k={heading} />} sub={sub ? <AuthText k={sub} /> : undefined}>
      {children}
    </AuthCard>
  );
}

export { Primary as AuthPrimaryButton };
