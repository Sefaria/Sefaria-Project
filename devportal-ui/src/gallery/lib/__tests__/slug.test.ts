import { describe, expect, it } from 'vitest';
import { canonicalPath, parseSlug, projectPath, projectSlug, slugify } from '../slug';

describe('slugify', () => {
  it('lowercases, drops apostrophes and joins words with hyphens', () => {
    expect(slugify('Torah MCP')).toBe('torah-mcp');
    expect(slugify('Today’s Daf')).toBe('todays-daf');
    expect(slugify('Sefaria Desktop (Unofficial)')).toBe('sefaria-desktop-unofficial');
  });

  it('folds accents and drops anything that is not a letter or digit', () => {
    expect(slugify('Café  — Zohar!')).toBe('cafe-zohar');
    expect(slugify('תורה')).toBe('');
  });
});

describe('project slugs', () => {
  it('builds ${id}-${slug}, or just the id when the name has no latin letters', () => {
    expect(projectSlug({ id: 141, name: 'Torah MCP' })).toBe('141-torah-mcp');
    expect(projectSlug({ id: 5, name: 'תורה' })).toBe('5');
    expect(projectPath({ id: 141, name: 'Torah MCP' })).toBe('/powered-by/projects/141-torah-mcp');
  });

  it('parses the leading id and ignores the rest', () => {
    expect(parseSlug('141-torah-mcp')).toEqual({ id: 141, text: 'torah-mcp' });
    expect(parseSlug('141')).toEqual({ id: 141, text: '' });
    expect(parseSlug('141-anything-else')?.id).toBe(141);
  });

  it.each(['', 'torah-mcp', '-5', '0-x', 'x141', '1.5-x', undefined])('rejects %s', (slug) => {
    expect(parseSlug(slug)).toBeNull();
  });

  it('redirects a stale slug to the canonical one, and leaves the canonical one alone', () => {
    const project = { id: 141, name: 'Torah MCP' };
    expect(canonicalPath('141-torah-mcp', project)).toBeNull();
    expect(canonicalPath('141-old-name', project)).toBe('/powered-by/projects/141-torah-mcp');
    expect(canonicalPath('141', project)).toBe('/powered-by/projects/141-torah-mcp');
  });
});
