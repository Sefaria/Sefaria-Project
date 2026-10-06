import { Link as TanstackLink } from "@tanstack/react-router";
import { forwardRef } from "react";
import type { LinkProps } from "~/lib/ui-link";

const isExternal = (href: string) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href) || href.startsWith("mailto:");

/** Static app routes; every other path is a ref and goes to the reader's splat route. */
const STATIC_ROUTES = new Set(["/"]);

/** Split an internal href ("/Genesis.1.1?with=all") into what the typed router needs. */
export function toRouterLocation(href: string): { to: string; params?: { _splat: string }; search?: Record<string, string> } {
  const url = new URL(href, "http://x");
  const search = Object.fromEntries(url.searchParams.entries());
  const hasSearch = Object.keys(search).length > 0;
  if (STATIC_ROUTES.has(url.pathname)) return { to: url.pathname, ...(hasSearch ? { search } : {}) };
  return { to: "/$", params: { _splat: decodeURIComponent(url.pathname.slice(1)) }, ...(hasSearch ? { search } : {}) };
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
  return (
    <TanstackLink ref={ref} to={loc.to as never} params={loc.params as never} search={loc.search as never} preload="intent" {...(rest as object)}>
      {children}
    </TanstackLink>
  );
});
