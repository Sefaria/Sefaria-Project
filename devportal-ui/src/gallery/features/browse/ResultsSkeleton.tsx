import { Skeleton } from '../../components/ui/Skeleton';
import type { ViewMode } from '../../lib/url';
import gridStyles from './ProjectGrid.module.css';
import cardStyles from './ProjectCard.module.css';
import listStyles from './ProjectList.module.css';

const SKELETON_COUNT = 6;

/** Same dimensions as the real cards and rows, so nothing shifts on load. */
export function ResultsSkeleton({ view }: { view: ViewMode }) {
  const items = Array.from({ length: SKELETON_COUNT }, (_, i) => i);
  if (view === 'list') {
    return (
      <ul className={listStyles.rows}>
        {items.map((i) => (
          <li key={i}>
            <div className={listStyles.row}>
              <Skeleton width={32} height={32} />
              <span className={listStyles.rowText}>
                <Skeleton width="50%" height={22} />
                <Skeleton width="70%" height={18} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className={gridStyles.grid}>
      {items.map((i) => (
        <li key={i}>
          <div className={cardStyles.card}>
            <Skeleton width="60%" height={40} />
            <Skeleton width="80%" height={30} />
            <Skeleton width="100%" height={48} />
            <Skeleton width="50%" height={28} />
          </div>
        </li>
      ))}
    </ul>
  );
}
