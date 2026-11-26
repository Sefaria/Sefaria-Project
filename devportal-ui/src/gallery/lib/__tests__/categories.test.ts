import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_PROJECTS_META,
  CATEGORIES,
  CATEGORY_META,
  isCategoryId,
  parseCategories,
  type CategoryId,
} from '../categories';

describe('parseCategories', () => {
  it('returns none for empty or unknown input', () => {
    expect(parseCategories(null)).toEqual(['none']);
    expect(parseCategories('')).toEqual(['none']);
    expect(parseCategories('Misc')).toEqual(['none']);
  });

  it('finds a single known label', () => {
    expect(parseCategories('Visualization & Data Analysis')).toEqual(['viz']);
    expect(parseCategories('Community, Interaction, & Social')).toEqual(['community']);
    expect(parseCategories('Extensions, API Integrations, & GitHub Code')).toEqual(['ext']);
  });

  it('returns all labels in order of appearance, with or without commas', () => {
    expect(
      parseCategories('AI Projects, Apps, & Other Tools Learning & Study Tools,Community, Interaction, & Social')
    ).toEqual(['ai', 'learn', 'community']);
  });

  it('maps the legacy label and dedupes against the current one', () => {
    expect(parseCategories('Extensions and API Integrations')).toEqual(['ext']);
    expect(parseCategories('Extensions and API Integrations Extensions, API Integrations, & GitHub Code')).toEqual([
      'ext',
    ]);
  });
});

const COLOR_TOKENS: Record<CategoryId, string> = {
  learn: 'var(--category-learn)',
  ai: 'var(--category-ai)',
  community: 'var(--category-community)',
  viz: 'var(--category-viz)',
  ext: 'var(--category-ext)',
  none: 'var(--category-none)',
};

describe('CATEGORY_META', () => {
  it('covers every CategoryId with a label, an icon and its own color token', () => {
    const ids = CATEGORIES.map((c) => c.id);
    expect(Object.keys(CATEGORY_META).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const { label, Icon, colorVar } = CATEGORY_META[id];
      expect(label).not.toBe('');
      expect(Icon).toBeDefined();
      expect(colorVar).toBe(COLOR_TOKENS[id]);
    }
    expect(new Set(ids.map((id) => CATEGORY_META[id].colorVar)).size).toBe(ids.length);
  });
  it('exposes short labels', () => {
    expect(CATEGORY_META.ai.label).toBe('AI & Apps');
    expect(CATEGORY_META.none.label).toBe('Other');
  });
  it('colors the "All projects" row grey', () => {
    expect(ALL_PROJECTS_META.colorVar).toBe('var(--category-none)');
  });
  it('defines every color token in tokens.css', () => {
    const css = readFileSync(join(process.cwd(), 'src/gallery/styles/tokens.css'), 'utf8');
    for (const id of Object.keys(COLOR_TOKENS)) expect(css).toContain(`--category-${id}:`);
  });
  it('validates ids', () => {
    expect(isCategoryId('viz')).toBe(true);
    expect(isCategoryId('all')).toBe(false);
  });
});
