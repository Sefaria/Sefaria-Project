import { Link as TanstackLink } from "@tanstack/react-router";
import { forwardRef } from "react";
import type { LinkProps } from "~/lib/ui-link";

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
  return (
    <TanstackLink ref={ref} to={loc.to as never} search={loc.search as never} preload="intent" {...(rest as object)}>
      {children}
    </TanstackLink>
  );
});
