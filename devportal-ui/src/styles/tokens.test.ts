// @vitest-environment node
// Contract C5: the two token files stay what they claim to be.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OUTPUT_PATH, readSources, render } from '../../scripts/readme-tokens';
import { BREAKPOINTS, MEDIA } from './breakpoints';

const REPO = resolve(import.meta.dirname, '../../..');

describe('tokens.css', () => {
  it('is the design system file, lines 1-422, byte for byte, after the source header', () => {
    const vendored = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf8');
    const source = readFileSync(resolve(REPO, 'docs/dev-portal/research/design/design-system/tokens.css'), 'utf8');
    const expected = `${source.split('\n').slice(0, 422).join('\n')}\n`;
    const headerEnd = vendored.indexOf('*/\n') + '*/\n'.length;
    expect(vendored.slice(headerEnd)).toBe(expected);
  });

  it('defines the DevPortal theme', () => {
    const vendored = readFileSync(resolve(import.meta.dirname, 'tokens.css'), 'utf8');
    expect(vendored).toContain('[data-theme="devportal"] {');
    expect(vendored).toMatch(/\[data-theme="devportal"\] \{[^}]*--module-primary: var\(--purple-700\);/);
  });
});

describe('readme-tokens.css', () => {
  it('equals the output of scripts/readme-tokens.ts', () => {
    expect(readFileSync(OUTPUT_PATH, 'utf8')).toBe(render(...readSources()));
  });

  it('has the measured values the shell depends on', () => {
    const css = readFileSync(OUTPUT_PATH, 'utf8');
    expect(css).toContain('--rm-hub-sidebar-width: 288px;');
    expect(css).toContain('--rm-hub-playground-width: 480px;');
    expect(css).toContain('--rm-project-color-primary: #612854;');
    expect(css).toContain('--rm-header-background: #612854;');
    // ReadMe's type scale inside .rm-ReadMe: the 31px H1.
    expect(css).toMatch(/\.dp-rm-app \{[^}]*--rm-font-size-3xl: 31px;/);
    expect(css).not.toMatch(/--rm-fa-/);
  });
});

describe('breakpoints', () => {
  it('are the five of REFERENCE_SPEC §1.6', () => {
    expect(Object.values(BREAKPOINTS)).toEqual([1300, 1066, 769, 700, 414]);
    expect(Object.values(MEDIA)).toEqual([
      '(max-width: 1299px)',
      '(max-width: 1065px)',
      '(max-width: 768px)',
      '(max-width: 700px)',
      '(max-width: 414px)',
    ]);
  });
});
