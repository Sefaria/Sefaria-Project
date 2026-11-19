import { Link as TanstackLink, useNavigate } from "@tanstack/react-router";
import { forwardRef, type MouseEvent } from "react";
import { PUBLIC_CONFIG } from "~/lib/config";
import { browserHost, leavesClient } from "~/lib/routing/django-paths";
import type { LinkProps } from "~/lib/ui-link";

/**
 * Must a plain click on this internal href load the page from the server rather than navigate in the app? When the path is one this
 * client does not serve on the current host: Django's pages, and on the Voices host the Library-only pages (/topics…), which Django
 * answers there. Decided at click time, so the server-rendered markup is the same on every host (no hydration mismatch).
 */
export function fullLoadOnClick(href: string, onClick?: (e: MouseEvent<HTMLAnchorElement>) => void) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!leavesClient(new URL(href, "http://x").pathname, browserHost(), PUBLIC_CONFIG.voicesOrigin)) return;
    e.preventDefault();
    window.location.assign(href);
  };
}

const isExternal = (href: string) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href) || href.startsWith("mailto:");

/**
 * Split an internal href ("/Genesis.1.1?with=all") into what the typed router needs. The path goes as it is written, encoded: given as
 * the `$` route's splat param it would be encoded again (`%3F` → `%253F`), and a `/` inside a title (`%2F`, #3790) would become a real
 * slash.
 */
export function toRouterLocation(href: string): { to: string; search?: Record<string, string> } {
  const url = new URL(href, "http://x");
  const search = Object.fromEntries(url.searchParams.entries());
  return { to: url.pathname, ...(Object.keys(search).length > 0 ? { search } : {}) };
}

/**
 * Adapts TanStack Router's Link to the library's Link contract. Internal hrefs navigate on the client
 * (and preload on intent); external ones stay plain anchors.
 */
export const RouterLink = forwardRef<HTMLAnchorElement, LinkProps>(function RouterLink({ href, children, ...rest }, ref) {
  if (isExternal(href) || href.startsWith("#")) {
    return (
      <a ref={ref} href={href} {...rest}>
        {children}
      </a>
    );
  }
  const loc = toRouterLocation(href);
  const { onClick, ...others } = rest;
  return (
    <TanstackLink ref={ref} to={loc.to as never} search={loc.search as never} preload="intent" {...(others as object)} onClick={fullLoadOnClick(href, onClick)}>
      {children}
    </TanstackLink>
  );
});

/**
 * A link whose `href` is written exactly as given — an address sefaria.org's server wrote (`/Genesis.1?ven=german%7CDie+f%C3%BCnf…`),
 * which the router's Link would re-serialise (`ven=german|Die+fünf…`) — and which still navigates on the client: a plain click goes
 * through the router; a modified or middle click, a target, or an external address is left to the browser.
 */
export const VerbatimRouterLink = forwardRef<HTMLAnchorElement, LinkProps>(function VerbatimRouterLink({ href, onClick, children, ...rest }, ref) {
  const navigate = useNavigate();
  const external = isExternal(href) || href.startsWith("#");
  return (
    <a
      ref={ref}
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (external || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (rest.target && rest.target !== "_self")) return;
        e.preventDefault();
        const loc = toRouterLocation(href);
        void navigate({ to: loc.to as never, search: loc.search as never });
      }}
      {...rest}
    >
      {children}
    </a>
  );
});
