import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { PUBLIC_CONFIG } from "~/lib/config";
import { browserHost, leavesClient } from "~/lib/routing/django-paths";
import type { StaticPageModel } from "~/lib/static-page/content";

/**
 * A static information page (LAUNCH_PLAN D-5, T-F31): Django's content block, sanitised on the server (lib/static-page), inside this
 * client's header and footer — wrapped as templates/base.html wraps it (`#staticContentWrapper > #content`, which static.css selects
 * on), with the page's own stylesheets in the head (the route's) and its `{% block css %}` inline.
 *
 * Links in the content: a same-site page this client renders is a navigation in the app; Django's pages (and, on the Voices host,
 * the Library-only pages) load in full, as RouterLink does; other sites, new windows and modified clicks are left to the browser.
 *
 * @feature STA-001 Static content pages
 * @feature STA-005 Static page serving and About sidebar
 */
export function StaticPage({ model }: { model: StaticPageModel }) {
  return <StaticPageFrame model={model} html={model.html} />;
}

/**
 * The legacy page's frame around the content (`#staticContentWrapper > #content`, with base.html's body classes and the Library's
 * `data-active-module`, which the legacy theme stylesheet selects on), its inline CSS, and the in-app links: around Django's content
 * (`html`) or a port's own markup (`children`).
 */
export function StaticPageFrame({ model, html, children }: { model: StaticPageModel; html?: string; children?: ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useStaticPageBehaviour(model.page, ref);
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const href = inAppHref(e.target as Element | null, e, window.location);
    if (!href) return;
    e.preventDefault();
    void router.navigate({ href });
  };
  const he = model.lang === "he";
  const lang = he ? "interface-hebrew" : "interface-english";
  return (
    <>
      {model.inlineCss ? <style dangerouslySetInnerHTML={{ __html: model.inlineCss }} /> : null}
      <div id="staticContentWrapper" ref={ref} className={model.bodyClass || lang} data-active-module="library" data-static-page={model.page} dir={he ? "rtl" : "ltr"} onClick={onClick}>
        {html !== undefined ? (
          <div id="content" className={lang} data-active-module="library" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div id="content" className={lang} data-active-module="library">
            {children}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The address to navigate to inside the app for a click on (or in) a link of the content, or null when the browser should follow it
 * itself: another site, a new window, a download, a modified click, an anchor on this page, or a page this client does not serve here.
 */
export function inAppHref(
  target: Element | null,
  e: { defaultPrevented: boolean; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  location: { href: string; origin: string; pathname: string; search: string; host: string },
): string | null {
  const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  if ((a.getAttribute("target") && a.getAttribute("target") !== "_self") || a.hasAttribute("download")) return null;
  let url: URL;
  try {
    url = new URL(a.getAttribute("href") ?? "", location.href);
  } catch {
    return null;
  }
  if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return null;
  if (url.hash && url.pathname === location.pathname && url.search === location.search) return null;
  if (leavesClient(url.pathname, browserHost() ?? location.host, PUBLIC_CONFIG.voicesOrigin)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** What a page's own script did that is still wanted (the rest of the scripts are not run: lib/static-page/pages.ts). */
function useStaticPageBehaviour(page: string, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    // strategy.html: `$("#deck").css("max-width", $(window).height() + 100)` — the slide deck no wider than the window is tall
    if (page !== "strategy") return;
    const deck = ref.current?.querySelector<HTMLElement>("#deck");
    if (deck) deck.style.maxWidth = `${window.innerHeight + 100}px`;
  }, [page, ref]);
}
