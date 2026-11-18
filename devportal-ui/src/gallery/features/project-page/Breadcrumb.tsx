import { Link, useLocation, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { galleryPath } from '../../lib/paths';
import { FROM_BROWSE } from '../../lib/slug';
import styles from './Breadcrumb.module.css';

/**
 * "← All projects / Name". When the previous history entry is the browse page, Back is
 * navigate(-1), which restores its filters and scroll; otherwise it links to the gallery root.
 */
export function Breadcrumb({ name }: { name: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Browse-page links set state.fromBrowse; it stays with the history entry across Back/Forward.
  const cameFromBrowse = (location.state as Partial<typeof FROM_BROWSE> | null)?.fromBrowse === true;

  return (
    <nav aria-label="Breadcrumb" className={styles.root}>
      <Link
        to={galleryPath()}
        className={styles.back}
        onClick={(event) => {
          const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
          if (!cameFromBrowse || modified || event.button !== 0) return;
          event.preventDefault();
          navigate(-1);
        }}
      >
        <ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
        All projects
      </Link>
      <span className={styles.current}>
        <span aria-hidden="true" className={styles.slash}>
          /
        </span>
        <span aria-current="page">{name}</span>
      </span>
    </nav>
  );
}
