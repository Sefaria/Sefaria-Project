import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useViewer } from "~/features/auth/viewer";
import { assistantAccessQuery } from "~/lib/assistant/access";
import { assistantAttributes, assistantBuild, versionCookie, versionFromCookie, versionFromQuery } from "~/lib/assistant/config";
import { loadAssistantScript } from "~/lib/assistant/script";
import { PUBLIC_CONFIG } from "~/lib/config";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { remoteConfigQueryOptions } from "~/lib/shell/remote-config";
import { useMediaQuery } from "~/lib/ui/use-media-query";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "lc-chatbot": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, string | undefined>;
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

/**
 * The Library Assistant (`<lc-chatbot>`), floating over the page for a signed-in reader who has it on, on a wide screen, unless remote
 * config hides it (`chatbot.hide`) — sefaria.org's ReaderApp rule. Nothing is rendered on the server or before the browser knows the
 * answer, so the page hydrates the same for everyone. The element's links reach the reader through src/lib/integration.
 *
 * `search` is the address's query (the shell's location): a `?chatbot_version=` in it picks the build.
 *
 * @feature AI-011 Library Assistant chatbot widget
 */
export function LibraryAssistant({ search }: { search: string }) {
  const viewer = useViewer();
  const phone = useMediaQuery("(max-width: 842px)"); // sefaria.org's MOBILE breakpoint (--bp-tablet-min: 843px)
  const lang = useInterfaceLang();
  const remoteConfig = useQuery(remoteConfigQueryOptions()).data;
  const hidden = (remoteConfig?.["feature.client.remote_config_json"] as { chatbot?: { hide?: unknown } } | undefined)?.chatbot?.hide === 1;
  const wanted = !!viewer && !phone && !hidden;
  const access = useQuery({ ...assistantAccessQuery(viewer?.id ?? null), enabled: wanted }).data;
  const version = useReaderVersion(search);
  const env = PUBLIC_CONFIG.assistant;
  const build = useMemo(() => (version === undefined ? null : assistantBuild(version, env)), [version, env]);
  const show = wanted && !!access?.enabled && !!build;

  useEffect(() => {
    if (show && build) loadAssistantScript(build);
  }, [show, build]);

  if (!show || !access || !build) return null;
  const attrs = assistantAttributes(access, build, env, {
    interfaceLang: lang === "hebrew" ? "he" : "en",
    maxInputChars: remoteConfig?.["feature.chatbot.max_input_chars"],
    maxPrompts: remoteConfig?.["feature.chatbot.max_prompts"],
  });
  return <lc-chatbot {...attrs} />;
}
