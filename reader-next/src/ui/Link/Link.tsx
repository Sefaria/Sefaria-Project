import {
  createContext,
  forwardRef,
  useContext,
  type AnchorHTMLAttributes,
  type ForwardRefExoticComponent,
  type ReactNode,
  type RefAttributes,
} from "react";

/** Props every link implementation must accept. */
export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  children?: ReactNode;
}

type LinkImpl = ForwardRefExoticComponent<LinkProps & RefAttributes<HTMLAnchorElement>>;

const DefaultAnchor: LinkImpl = forwardRef<HTMLAnchorElement, LinkProps>(function DefaultAnchor({ href, ...rest }, ref) {
  return <a ref={ref} href={href} {...rest} />;
});

const LinkImplContext = createContext<LinkImpl>(DefaultAnchor);

/**
 * The app injects its router's Link here so every `Link` / `Button href` in the library does client
 * navigation without the library depending on the router. Without a provider, links are plain anchors.
 */
export const LinkProvider = LinkImplContext.Provider;

const isExternal = (href: string) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href) || href.startsWith("mailto:");

/**
 * A navigation link. Always a real `<a href>` (so open-in-new-tab, copy-address and crawlers work);
 * external links get `rel="noopener noreferrer"` automatically.
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ href, rel, target, ...rest }, ref) {
  const Impl = useContext(LinkImplContext);
  const external = isExternal(href);
  return (
    <Impl
      ref={ref}
      href={href}
      target={target}
      rel={rel ?? (external || target === "_blank" ? "noopener noreferrer" : undefined)}
      {...rest}
    />
  );
});
