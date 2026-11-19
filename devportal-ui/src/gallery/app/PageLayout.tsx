import type { ReactNode } from 'react';
import { GalleryBar } from '../components/layout/GalleryBar';
import { SiteFooter } from '../components/layout/SiteFooter';
import { SkipLink } from '../components/layout/SkipLink';
import { useGalleryOptions } from './GalleryContext';

interface PageLayoutProps {
  /** Where the skip link goes: the id of the main content's heading. */
  skipTo: { id: string; label: string };
  backLink?: { to: string; label: string };
  children: ReactNode;
}

/**
 * Landmarks shared by every page: skip link, the portal header (a slot, PLAN §2.14 item 5), the gallery's
 * bar with its own actions, main, footer. The gallery's styles (styles/*.css) are scoped to `.dp-gallery`,
 * which wraps everything but the portal header, so neither side restyles the other.
 */
export function PageLayout({ skipTo, backLink, children }: PageLayoutProps) {
  const { header } = useGalleryOptions();
  return (
    <>
      <div className="dp-gallery">
        <SkipLink targetId={skipTo.id}>{skipTo.label}</SkipLink>
      </div>
      {header}
      <div className="dp-gallery">
        <GalleryBar backLink={backLink} />
        <main id="main">{children}</main>
        <SiteFooter />
      </div>
    </>
  );
}
