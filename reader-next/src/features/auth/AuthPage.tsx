/**
 * The login / register / reset experience (Sefaria-Project spec 1602), ported from static/js/auth/AuthPage.jsx.
 *
 * One state machine swaps the card in place — view ∈ {choose, email, forgot, forgot-sent, reset, reset-checking, reset-expired,
 * reset-success}; flow ∈ {login, register, reset} comes from the path. The card's own back arrow returns to `choose`; the URL stays
 * /login, /register or the reset link. Switching between login and register goes through `onNavigate` (the router), and lands on
 * `choose`, as on the old site.
 *
 * One difference: the old page knew at first paint whether a reset link was still valid (Django rendered `authResetValid`). This
 * client is not Django; when `resetValid` is unknown it asks Django with a side-effect-free probe (see `probeResetLink`) and shows
 * the card's loading line meanwhile ("reset-checking").
 *
 * @feature ACC-001 In-app login/register page integration
 * @feature ACC-008 Auth page with choose / email views
 * @feature ACC-011 Forgot and reset password
 */
import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { AuthCard, AuthLoadingLine, AuthStack } from "~/ui/AuthCard/AuthCard";
import { AuthText } from "~/ui/AuthText/AuthText";
import { SSO_CONFIG } from "~/lib/config";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { SIGNUP_METHOD } from "~/lib/auth/analytics";
import { postJson } from "~/lib/auth/http";
import { loadAppleSdk, loadGoogleIdentity, loadRecaptcha } from "~/lib/auth/sdk";
import { useSignUpTracking } from "~/lib/auth/use-sign-up-tracking";
import { flowToPath, nextFromPath, pathToFlow, type AuthFlow } from "~/lib/auth/utils";
import { useProviderTriggers } from "./use-provider-triggers";
import { AuthPrimaryButton, ChooseView, ForgotView, LoginView, MessageView, RegisterView, ResetExpiredView, ResetView, type AuthFields } from "./views";
import styles from "./AuthPage.module.css";

export type AuthView = "choose" | "email" | "forgot" | "forgot-sent" | "reset" | "reset-checking" | "reset-expired" | "reset-success";

export interface AuthPageProps {
  /** pathname + search (e.g. "/register?next=%2FGenesis.1"). */
  initialPath?: string;
  /** The control that led here (data-signup-source), for the sign-up funnel. */
  authSource?: string | null;
  /** For the reset link: true / false when known, null to ask Django. */
  resetValid?: boolean | null;
  /** Go to another auth path in-app (cross-links, "Log In" after a reset). */
  onNavigate?: (path: string, source?: string) => void;
  /** Full-page navigation after success (the old site reloads into `next`). */
  navigate?: (href: string) => void;
  /** Providers' public keys (default: the runtime config). */
  googleClientId?: string;
  appleClientId?: string;
  recaptchaSiteKey?: string;
  /** Load the third-party SDKs (off in stories and tests). */
  loadSdks?: boolean;
  /** Storybook: start on a given view. */
  initialView?: AuthView;
}

const hardNavigate = (href: string) => {
  window.location.href = href;
};

/** The reset link's own address with Django's trailing slash, which the POSTs must hit exactly. */
export const resetUrlOf = (path: string) => {
  const p = path.split("?")[0]!;
  return p.endsWith("/") ? p : `${p}/`;
};

/**
 * Whether Django still accepts this reset link, without changing anything: an empty JSON POST. A valid link reaches the form
 * (400 with field errors, nothing saved); an invalid one answers `_auth.code: invalid_reset_link` (sefaria/views.py
 * CustomPasswordResetConfirmView.render_to_response). Unknown answers count as valid: submitting will tell.
 */
export async function probeResetLink(resetUrl: string): Promise<boolean> {
  const { data } = await postJson(resetUrl, {});
  return (data?._auth as { code?: string } | undefined)?.code !== "invalid_reset_link";
}

const initialViewFor = (flow: AuthFlow, resetValid: boolean | null | undefined): AuthView =>
  flow !== "reset" ? "choose" : resetValid === false ? "reset-expired" : resetValid === true ? "reset" : "reset-checking";

export function AuthPage({
  initialPath = "/login", authSource = null, resetValid = null, onNavigate, navigate = hardNavigate,
  googleClientId = SSO_CONFIG.googleClientId, appleClientId = SSO_CONFIG.appleClientId, recaptchaSiteKey = SSO_CONFIG.recaptchaSiteKey,
  loadSdks = true, initialView,
}: AuthPageProps) {
  const lang = useInterfaceLang();
  const flow = pathToFlow(initialPath);
  const next = nextFromPath(initialPath);
  const resetUrl = resetUrlOf(initialPath);
  const [view, setView] = useState<AuthView>(() => initialView ?? initialViewFor(flow, resetValid));
  // a "Log in" / "Sign up" click elsewhere (the header) only changes the path: land on the choice again
  const prevFlowRef = useRef(flow);
  // the one in-page flow change that must NOT land on the choice: "Request New Link" for an unknown account goes to Forgot.
  // (The old AuthPage set "forgot" and navigated in the same tick, and this effect then reset it to "choose" — fixed here.)
  const keepViewRef = useRef(false);
  useEffect(() => {
    if (prevFlowRef.current === flow) return;
    prevFlowRef.current = flow;
    if (keepViewRef.current) keepViewRef.current = false;
    else setView("choose");
  }, [flow]);

  useEffect(() => {
    if (view !== "reset-checking") return;
    let live = true;
    probeResetLink(resetUrl).then((ok) => live && setView(ok ? "reset" : "reset-expired"));
    return () => {
      live = false;
    };
  }, [view, resetUrl]);

  useEffect(() => {
    if (!loadSdks) return;
    if (googleClientId) loadGoogleIdentity();
    if (appleClientId) loadAppleSdk();
    if (recaptchaSiteKey) loadRecaptcha(lang);
  }, [loadSdks, googleClientId, appleClientId, recaptchaSiteKey, lang]);

  const [fields, setFields] = useState<AuthFields>({ email: "", password: "", first: "", last: "" });
  const tracking = useSignUpTracking({ flow, source: authSource });
  const { googleReady, appleReady, ssoLoading, overlayNode, registerGoogleTarget, setActiveErrorHandler, triggerApple } = useProviderTriggers({
    next, tracking, googleClientId, appleClientId, interfaceLang: lang, navigate,
  });
  const wiring = { registerGoogleTarget, triggerApple, setActiveErrorHandler };

  const setField = (k: keyof AuthFields) => (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFields((f) => ({ ...f, [k]: value }));
  };
  const switchFlow = (f: "login" | "register") => (e?: MouseEvent<HTMLElement>) => {
    e?.preventDefault();
    const source = e?.currentTarget?.getAttribute?.("data-signup-source") || undefined;
    setView("choose");
    onNavigate?.(flowToPath(f, next), source);
  };
  const onForgotClick = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setView("forgot");
  };
  // "no account for this link" falls back to the manual Forgot view
  const requestNewLink = () => {
    keepViewRef.current = true;
    setView("forgot");
    onNavigate?.(flowToPath("login", next));
  };
  const onEmailClick = () => {
    tracking.chooseMethod(SIGNUP_METHOD.EMAIL);
    tracking.startProcess();
    setView("email");
  };

  let content;
  if (view === "email" && flow === "register") {
    content = <RegisterView switchFlow={switchFlow} fields={fields} setField={setField} onBack={() => setView("choose")} endProcess={tracking.endProcess} next={next} navigate={navigate} recaptchaSiteKey={recaptchaSiteKey} {...wiring} />;
  } else if (view === "email") {
    content = <LoginView switchFlow={switchFlow} fields={fields} setField={setField} onBack={() => setView("choose")} onForgotClick={onForgotClick} next={next} navigate={navigate} {...wiring} />;
  } else if (view === "forgot") {
    content = <ForgotView emailValue={fields.email} setField={setField} onSuccess={() => setView("forgot-sent")} onBack={() => setView("email")} {...wiring} />;
  } else if (view === "forgot-sent") {
    content = <MessageView heading="auth.reset_link_sent" sub="auth.check_your_email" />;
  } else if (view === "reset-checking") {
    content = <AuthCard heading={<AuthText k="auth.reset_password" />} sub={<AuthLoadingLine label={<AuthText k="auth.loading" />} />} />;
  } else if (view === "reset") {
    content = <ResetView resetUrl={resetUrl} onLinkExpired={() => setView("reset-expired")} onSuccess={() => setView("reset-success")} />;
  } else if (view === "reset-expired") {
    content = <ResetExpiredView resetUrl={resetUrl} onResendSuccess={() => setView("forgot-sent")} onRequestNewLink={requestNewLink} />;
  } else if (view === "reset-success") {
    content = (
      <MessageView heading="auth.password_reset_success_title" sub="auth.password_reset_success_sub">
        <AuthStack>
          <AuthPrimaryButton type="button" onClick={() => switchFlow("login")()}>
            <AuthText k="auth.log_in_link" />
          </AuthPrimaryButton>
        </AuthStack>
      </MessageView>
    );
  } else {
    content = (
      <ChooseView
        flow={flow === "register" ? "register" : "login"} switchFlow={switchFlow} onEmailClick={onEmailClick}
        googleReady={googleReady} appleReady={appleReady} ssoLoading={ssoLoading} googleClientId={googleClientId} appleClientId={appleClientId} {...wiring}
      />
    );
  }

  return (
    <div className={styles.page} data-auth-page="" data-view={view}>
      {content}
      {overlayNode}
    </div>
  );
}
