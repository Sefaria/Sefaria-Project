import { AUTH_STRINGS, authString, isAuthStringKey } from "~/lib/auth/strings";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { InterfaceText } from "../InterfaceText/InterfaceText";

/**
 * An auth string by its old key (`auth.or`, `header.log_in` …) in the interface language. Anything that is not a known key — a
 * server message in plain words — is shown as it is, as the old `<InterfaceText>{key}</InterfaceText>` did.
 *
 * @feature ACC-008 Auth page with choose / email views
 */
export function AuthText({ k }: { k: string }) {
  if (!isAuthStringKey(k)) return <>{k}</>;
  const s = AUTH_STRINGS[k];
  return <InterfaceText en={s.en} he={s.he} />;
}

/** The same lookup as a plain string, for attributes (aria-label, placeholder). */
export function useAuthString(): (key: string) => string {
  const lang = useInterfaceLang();
  return (key) => authString(key, lang);
}
