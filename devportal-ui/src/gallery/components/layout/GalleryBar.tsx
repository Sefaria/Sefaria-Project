import { Link } from 'react-router';
import { ArrowLeft, Heart, Plus } from 'lucide-react';
import { DONATE_URL, SUBMIT_URL } from '../../lib/links';
import { galleryPath } from '../../lib/paths';
import { ExternalLink } from '../ui/ExternalLink';
import { Container } from './Container';
import styles from './GalleryBar.module.css';

interface GalleryBarProps {
  /** An optional in-app link shown first, e.g. back to all projects on /powered-by/charts. */
  backLink?: { to: string; label: string };
}

/**
 * The gallery's own bar under the portal header. The gallery's header became the portal header
 * (PLAN §2.14 item 5); what was only the gallery's moved here: its name, linking to the gallery root,
 * and the "Submit a project" and "Donate" actions.
 *
 * "Submit a project" reads "Submit" below 721px; the accessible name is the full phrase either way. The
 * aria-label repeats "(opens in a new tab)" because a label replaces the content, including
 * ExternalLink's visually hidden copy of it.
 */
export function GalleryBar({ backLink }: GalleryBarProps) {
  return (
    <nav aria-label="Powered by Sefaria" className={styles.bar}>
      <Container className={styles.inner}>
        <div className={styles.brand}>
          {backLink && (
            <Link to={backLink.to} className={styles.back}>
              <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
              {backLink.label}
            </Link>
          )}
          <Link to={galleryPath()} className={styles.title}>
            Powered by Sefaria
          </Link>
        </div>
        <div className={styles.actions}>
          <ExternalLink href={SUBMIT_URL} className={styles.submit} aria-label="Submit a project (opens in a new tab)">
            <Plus size={18} strokeWidth={2} aria-hidden="true" />
            <span>
              Submit<span className={styles.submitMore}> a project</span>
            </span>
          </ExternalLink>
          <ExternalLink href={DONATE_URL} className={styles.donate}>
            Donate
            <Heart size={18} strokeWidth={2} aria-hidden="true" />
          </ExternalLink>
        </div>
      </Container>
    </nav>
  );
}
