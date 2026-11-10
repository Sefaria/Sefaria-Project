import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useViewer } from "~/features/auth/viewer";
import { anonymousAccess, assistantAccessQuery, ANONYMOUS_FREE_ANSWERS_KEY } from "~/lib/assistant/access";
import { isAuthPath, withNext } from "~/lib/auth/utils";
import { isVoicesHost } from "~/lib/routing/django-paths";
import { useSiteHost } from "~/lib/routing/library-href";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { Link } from "~/ui/Link/Link";
import styles from "./LibraryAssistant.module.css";
import { assistantAttributes, assistantBuild, versionCookie, versionFromCookie, versionFromQuery } from "~/lib/assistant/config";
import { loadAssistantScript } from "~/lib/assistant/script";
import { PUBLIC_CONFIG } from "~/lib/config";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { remoteConfigQueryOptions } from "~/lib/shell/remote-config";
import { useMediaQuery } from "~/lib/ui/use-media-query";
import { setAssistantShown } from "~/features/shell/assistant-pill";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "lc-chatbot": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { children?: React.ReactNode } & Record<string, string | React.ReactNode | undefined>;
    }
  }
}

/**
 * The address the page was first loaded with: read before the reader completes its address (which drops unknown parameters), and
 * applied once — a later `?chatbot_version=clear` must not be undone by it on the next navigation.
 */
let firstSearch: string | null = typeof window !== "undefined" ? window.location.search : null;

/** The build this reader asked for: `?chatbot_version=` now or earlier this session (remembered in a cookie), else none. */
function useReaderVersion(searchStr: string): string | null | undefined {
  const [version, setVersion] = useState<string | null | undefined>(undefined); // undefined until read in the browser
  useEffect(() => {
    const searches = firstSearch !== null ? [firstSearch, searchStr] : [searchStr];
    firstSearch = null;
    for (const search of searches) {
      const asked = versionFromQuery(search);
      if (asked) document.cookie = versionCookie("set" in asked ? asked.set : null, window.location.protocol === "https:");
    }
    setVersion(versionFromCookie(document.cookie));
  }, [searchStr]);
  return version;
}

/** Where the assistant's sign-up prompt sends a visitor for the sign-up funnel (the old ReaderApp's CHATBOT_SIGNUP_SOURCE). */
export const ASSISTANT_SIGNUP_SOURCE = "rate_limit_login_button";

/**
 * What a signed-out visitor sees in the assistant's login prompt (its `signup-options` slot). The old ReaderApp put round
 * Google / Apple / Email buttons there (static/js/auth/SignupOptions.jsx); here they are this client's own Sign up / Log in pages,
 * which offer the same three ways, coming back to this page. It stays in this page's DOM, so our links and styles work as usual.
 */
function AssistantSignupOptions({ next }: { next: string }) {
  return (
    <div slot="signup-options" data-signup-source={ASSISTANT_SIGNUP_SOURCE} className={styles.signupOptions}>
      <Link href={withNext("/register", next)}><InterfaceText en="Sign up" he="להרשמה" /></Link>
      <Link href={withNext("/login", next)}><InterfaceText en="Log in" he="התחברות" /></Link>
    </div>
  );
}

/**
 * The Library Assistant (`<lc-chatbot>`), floating over the page on a wide screen unless remote config hides it (`chatbot.hide`) —
 * sefaria.org's ReaderApp rule. A signed-in reader gets it when it is on for them (with their token); a signed-out visitor when remote
 * config's `feature.chatbot.anonymous_enabled` is not off (base_props' `chatbot_access_props`), without a token and with the sign-up
 * prompt's options. Not on the login, registration and password-reset pages, which a visitor reaches from the assistant itself, and
 * only in the Library (never on the Voices host), as there.
 * Nothing is rendered on the server or before the browser knows the answer, so the page hydrates the same for everyone. The element's
 * links reach the reader through src/lib/integration.
 *
 * `search` is the address's query (the shell's location): a `?chatbot_version=` in it picks the build. `pathname` is the address's
 * path (read from the window when not given).
 *
 * @feature AI-011 Library Assistant chatbot widget
 */
export function LibraryAssistant({ search, pathname }: { search: string; pathname?: string }) {
  const viewer = useViewer();
  const phone = useMediaQuery("(max-width: 842px)"); // sefaria.org's MOBILE breakpoint (--bp-tablet-min: 843px)
  const lang = useInterfaceLang();
  const remoteConfig = useQuery(remoteConfigQueryOptions()).data;
  const hidden = (remoteConfig?.["feature.client.remote_config_json"] as { chatbot?: { hide?: unknown } } | undefined)?.chatbot?.hide === 1;
  const path = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  // the old ReaderApp's !showAuth (login, registration) and authResetUid (a password reset)
  const onAuthPage = isAuthPath(path) || path.startsWith("/password/reset/confirm/");
  // only in the Library: the old ReaderApp's isLibraryModule — never on the Voices host, signed in or out (read, not changed, here)
  const siteHost = useSiteHost() ?? (typeof window !== "undefined" ? window.location.host : undefined);
  const library = !isVoicesHost(siteHost, PUBLIC_CONFIG.voicesOrigin);
  const wanted = !phone && !hidden && !onAuthPage && library;
  const signedIn = useQuery({ ...assistantAccessQuery(viewer?.id ?? null), enabled: wanted && !!viewer }).data;
  // signed out: remote config decides (undefined until it has loaded)
  const anonymous = useMemo(() => (remoteConfig ? anonymousAccess(remoteConfig) : undefined), [remoteConfig]);
  const access = viewer ? signedIn : anonymous;
  const version = useReaderVersion(search);
  const env = PUBLIC_CONFIG.assistant;
  const build = useMemo(() => (version === undefined ? null : assistantBuild(version, env)), [version, env]);
  const show = wanted && !!access?.enabled && !!build;

  useEffect(() => {
    if (show && build) loadAssistantScript(build);
  }, [show, build]);
  // the header's pill shows while the widget does (src/features/shell/assistant-pill.ts)
  useEffect(() => {
    setAssistantShown(show && !!access);
    return () => setAssistantShown(false);
  }, [show, access]);

  if (!show || !access || !build) return null;
  const attrs = assistantAttributes(access, build, env, {
    interfaceLang: lang === "hebrew" ? "he" : "en",
    maxInputChars: remoteConfig?.["feature.chatbot.max_input_chars"],
    maxPrompts: remoteConfig?.["feature.chatbot.max_prompts"],
    anonFreeAnswers: viewer ? undefined : remoteConfig?.[ANONYMOUS_FREE_ANSWERS_KEY],
  });
  return <lc-chatbot {...attrs}>{viewer ? null : <AssistantSignupOptions next={path + search} />}</lc-chatbot>;
}
