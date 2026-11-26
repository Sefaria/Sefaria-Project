import type { CSSProperties } from 'react';
import { ALL_PROJECTS_META, CATEGORY_META, type CategoryId } from '../../lib/categories';
import { cx } from '../ui/cx';
import styles from './CategoryIcon.module.css';

export type CategoryIconId = CategoryId | 'all';

function metaFor(id: CategoryIconId) {
  return id === 'all' ? ALL_PROJECTS_META : CATEGORY_META[id];
}

/** The bare category glyph. Decorative: the label is always next to it. Inherits its color. */
export function CategoryIcon({ id, size = 18 }: { id: CategoryIconId; size?: number }) {
  const { Icon } = metaFor(id);
  return <Icon size={size} strokeWidth={2} aria-hidden="true" />;
}

/** The glyph in its category-colored tile: 40px/24px on cards, 32px/18px in list rows. */
export function CategoryTile({ id, size = 'md' }: { id: CategoryIconId; size?: 'md' | 'sm' }) {
  return (
    <span
      className={cx(styles.tile, size === 'sm' && styles.small)}
      style={{ '--tile-color': metaFor(id).colorVar } as CSSProperties}
      aria-hidden="true"
    >
      <CategoryIcon id={id} size={size === 'sm' ? 18 : 24} />
    </span>
  );
}
