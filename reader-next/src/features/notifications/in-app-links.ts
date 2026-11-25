import { useNavigate } from "@tanstack/react-router";
import { useCallback, type MouseEvent } from "react";
import { PUBLIC_CONFIG, SITE_ORIGIN } from "~/lib/config";
import { browserHost, leavesClient } from "~/lib/routing/django-paths";

/**
 * A click handler for a block of HTML written on the server (an announcement's text): a plain click on a link to one of this
 * client's pages navigates in the app, as the old ReaderApp handled every in-app link; Django's pages, other sites and modified
 * clicks are left to the browser.
 */
export function useInAppLinkClicks() {
  const navigate = useNavigate();
  return useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || !a.getAttribute("href") || (a.target && a.target !== "_self")) return;
      const url = new URL(a.href, window.location.href);
      const site = SITE_ORIGIN ? new URL(SITE_ORIGIN, window.location.href).host : window.location.host;
      if (url.host !== window.location.host && url.host !== site) return;
      if (leavesClient(url.pathname, browserHost(), PUBLIC_CONFIG.voicesOrigin)) return;
      e.preventDefault();
      void navigate({ href: url.pathname + url.search + url.hash });
    },
    [navigate],
  );
}
