import { BookOpen, ChartColumn, Folder, LayoutGrid, Plug, Sparkles, Users, type LucideIcon } from 'lucide-react';

export type CategoryId = 'learn' | 'ai' | 'community' | 'viz' | 'ext' | 'none';

export interface CategoryMeta {
  id: CategoryId;
  /** Label as stored by the Sefaria API (the free-text field may hold several). */
  apiLabel: string;
}

/** Display order of the filter rows (after "All projects"). */
export const CATEGORIES: readonly CategoryMeta[] = [
  { id: 'learn', apiLabel: 'Learning & Study Tools' },
  { id: 'ai', apiLabel: 'AI Projects, Apps, & Other Tools' },
  { id: 'ext', apiLabel: 'Extensions, API Integrations, & GitHub Code' },
  { id: 'viz', apiLabel: 'Visualization & Data Analysis' },
  { id: 'community', apiLabel: 'Community, Interaction, & Social' },
  { id: 'none', apiLabel: '' },
];

export interface CategoryDisplay {
  /** Short label shown in the UI. */
  label: string;
  /** Lucide used directly: not yet in Sefaria's icon library. */
  Icon: LucideIcon;
  /** CSS color expression for the tile and filter icon, from tokens.css. */
  colorVar: string;
  /** Same hue for text on white, where the tile color is too light (>= 4.5:1). */
  textVar: string;
}

/** The one place a category's label, icon and color are defined. */
export const CATEGORY_META: Record<CategoryId, CategoryDisplay> = {
  learn: {
    label: 'Learning & Study',
    Icon: BookOpen,
    colorVar: 'var(--category-learn)',
    textVar: 'var(--category-learn)',
  },
  ai: {
    label: 'AI & Apps',
    Icon: Sparkles,
    colorVar: 'var(--category-ai)',
    textVar: 'var(--category-ai)',
  },
  community: {
    label: 'Community & Social',
    Icon: Users,
    colorVar: 'var(--category-community)',
    textVar: 'var(--category-community)',
  },
  viz: {
    label: 'Visualization & Data',
    Icon: ChartColumn,
    colorVar: 'var(--category-viz)',
    textVar: 'var(--category-viz)',
  },
  ext: {
    label: 'Extensions & API',
    Icon: Plug,
    colorVar: 'var(--category-ext)',
    textVar: 'var(--category-ext-text)',
  },
  none: {
    label: 'Other',
    Icon: Folder,
    colorVar: 'var(--category-none)',
    textVar: 'var(--category-none)',
  },
};

/** The "All projects" filter row: not a category, so it is kept out of CATEGORY_META. */
export const ALL_PROJECTS_META: CategoryDisplay = {
  label: 'All projects',
  Icon: LayoutGrid,
  colorVar: 'var(--category-none)',
  textVar: 'var(--category-none)',
};

export function isCategoryId(value: string): value is CategoryId {
  return Object.hasOwn(CATEGORY_META, value);
}

/** Older submissions used this wording for the "ext" category. */
const LEGACY_LABELS: ReadonlyArray<readonly [string, CategoryId]> = [['Extensions and API Integrations', 'ext']];

const MATCHERS: ReadonlyArray<readonly [string, CategoryId]> = [
  ...CATEGORIES.filter((c) => c.id !== 'none').map((c) => [c.apiLabel, c.id] as const),
  ...LEGACY_LABELS,
];

/**
 * The raw category is free text that may hold several known labels, with or
 * without commas between them. Returns ids in order of appearance, deduped;
 * `['none']` when nothing matches.
 */
export function parseCategories(raw: string | null | undefined): CategoryId[] {
  if (!raw) return ['none'];
  const found = MATCHERS.map(([label, id]) => ({ id, index: raw.indexOf(label) }))
    .filter(({ index }) => index !== -1)
    .sort((a, b) => a.index - b.index)
    .map(({ id }) => id);
  const unique = [...new Set(found)];
  return unique.length > 0 ? unique : ['none'];
}
