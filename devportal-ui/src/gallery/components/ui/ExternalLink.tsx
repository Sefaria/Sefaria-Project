import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { VisuallyHidden } from './VisuallyHidden';

interface ExternalLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'target' | 'rel'> {
  href: string;
  children: ReactNode;
}

/** A link to another site: opens in a new tab and says so to assistive tech. */
export function ExternalLink({ children, ...rest }: ExternalLinkProps) {
  return (
    <a {...rest} target="_blank" rel="noopener noreferrer">
      {children}
      <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
    </a>
  );
}
