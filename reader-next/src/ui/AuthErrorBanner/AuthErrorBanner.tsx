import type { Ref } from "react";
import type { AuthError } from "~/lib/auth/utils";
import { AuthText } from "../AuthText/AuthText";
import styles from "./AuthErrorBanner.module.css";

const SSO_PROVIDER_INFO: Record<string, { msg: string; link: string }> = {
  google: { msg: "auth.email_registered_google", link: "auth.continue_with_google_link" },
  apple: { msg: "auth.email_registered_apple", link: "auth.continue_with_apple_link" },
};

export interface AuthErrorBannerProps {
  error: AuthError | null | undefined;
  /** Google: the inline "Continue with Google" is where the real Google button is placed (see ProviderButton). */
  registerGoogleTarget?: Ref<HTMLSpanElement>;
  triggerApple?: () => void;
  /** The generic error's link (e.g. "Log In" after "An account with this email address already exists."). */
  onLinkClick?: () => void;
}

/**
 * A form's error banner (role=alert): either a message with an optional link, or — for an account that only has Google/Apple
 * sign-in (`sso_only_account`) — one line per provider with an inline "Continue with …". Ported from static/js/auth/ErrorBanner.jsx.
 *
 * @feature ACC-009 Email and password login
 * @feature ACC-012 Sign in with Google and Apple
 */
export function AuthErrorBanner({ error, registerGoogleTarget, triggerApple, onLinkClick }: AuthErrorBannerProps) {
  if (!error) return null;
  return (
    <div className={styles.banner} role="alert" data-auth-error="">
      <img className={styles.icon} src="/auth/icons/info-error.svg" alt="" aria-hidden="true" />
      <div className={styles.content}>
        {error.code === "sso_only_account"
          ? (error.providers ?? []).map((provider) => {
              const key = provider.toLowerCase();
              const display = key.charAt(0).toUpperCase() + key.slice(1);
              const info = SSO_PROVIDER_INFO[key] ?? { msg: `This email is registered via ${display}.`, link: `Continue with ${display}` };
              return (
                <span key={provider}>
                  <AuthText k={info.msg} />{" "}
                  {key === "apple" ? (
                    <a href="#" className={styles.providerAction} onClick={(e) => { e.preventDefault(); triggerApple?.(); }}>
                      <AuthText k={info.link} />
                    </a>
                  ) : (
                    <span ref={registerGoogleTarget} className={`${styles.providerAction} ${styles.googleTarget}`}>
                      <AuthText k={info.link} />
                    </span>
                  )}
                </span>
              );
            })
          : (
              <span>
                <AuthText k={error.message ?? "auth.generic_error"} />
                {error.linkText ? (
                  <>
                    {" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); onLinkClick?.(); }}>
                      <AuthText k={error.linkText} />
                    </a>
                  </>
                ) : null}
              </span>
            )}
      </div>
    </div>
  );
}
