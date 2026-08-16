import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, SOURCE_LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

/**
 * SID-0NN — Siddur instruction rubrics (sc-46669).
 *
 * Siddur texts carry English rubrics in <i class="instruction"> tags ("Some say the following
 * meditation before putting on the tefillin."). They live on the translation side, in segments
 * that have no source text at all.
 *
 * Two behaviors are covered:
 *   - side-by-side bilingual: a rubric spans both columns instead of wrapping inside half of one
 *   - source-only: the rubric shows to an English-UI reader, stays hidden to a Hebrew-UI reader
 *
 * The trigger is "segment has no source text" (the `noPrimary` class), NOT "contains an
 * instruction tag" — segments like Tefillin 11 carry a rubric inline alongside a real translation
 * and a facing Hebrew source, and must keep the normal 50/50 split. SID-002 is that regression
 * guard; without it a `:has(i.instruction)` implementation would look correct.
 *
 * Data verified against production via /api/v3/texts (CLAUDE.md §2A): the section has 16 segments,
 * of which 1, 5, 7, 9, 12 and 14 are rubric-only and 11 is the mixed case.
 */

const SECTION_REF = 'The Koren Shalem Siddur; Ashkenaz, Weekdays, Tefillin';
const SECTION_PATH = '/The_Koren_Shalem_Siddur%3B_Ashkenaz%2C_Weekdays%2C_Tefillin';

const RUBRIC_ONLY_REF = `${SECTION_REF} 1`;   // rubric only, no Hebrew
const MIXED_REF = `${SECTION_REF} 11`;        // "Some say:" rubric + real translation + Hebrew
const PLAIN_REF = `${SECTION_REF} 13`;        // ordinary bilingual segment, no rubric

test.describe('Library Reader — Siddur instruction rubrics — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}${SECTION_PATH}`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    // Wait for a specific segment, not just the reader shell — the panel mounts before the
    // text streams in (CLAUDE.md §2 rule 11).
    await expect(page.locator(`.basetext .segment[data-ref="${PLAIN_REF}"]`))
      .toBeVisible({ timeout: t(30000) });
  });

  test('SID-001: side-by-side — a source-less rubric spans both columns', async () => {
    await pm.onSourceTextPage().setContentLanguage(SOURCE_LANGUAGES.BI);
    await pm.onSourceTextPage().setBiLayout('heRight');

    const rubric = await pm.onSourceTextPage().getSegmentSpanLayout(RUBRIC_ONLY_REF);
    expect(rubric).not.toBeNull();
    expect(rubric!.translation?.hasInstruction).toBe(true);

    // The rubric fills the segment's whole width rather than a 50% column.
    expect(rubric!.translation!.float).toBe('none');
    expect(rubric!.translation!.width).toBeGreaterThan(rubric!.segmentWidth * 0.9);

    // The empty source span must not reserve the facing half.
    expect(rubric!.primary!.display).toBe('none');
  });

  test('SID-002: side-by-side — a rubric mixed with real translation keeps the 50/50 split', async () => {
    await pm.onSourceTextPage().setContentLanguage(SOURCE_LANGUAGES.BI);
    await pm.onSourceTextPage().setBiLayout('heRight');

    const mixed = await pm.onSourceTextPage().getSegmentSpanLayout(MIXED_REF);
    expect(mixed).not.toBeNull();

    // Both columns still render and neither is full width.
    expect(mixed!.primary!.display).not.toBe('none');
    expect(mixed!.translation!.float).not.toBe('none');
    expect(mixed!.translation!.width).toBeLessThan(mixed!.segmentWidth * 0.75);
    expect(mixed!.primary!.width).toBeLessThan(mixed!.segmentWidth * 0.75);

    // And an ordinary segment is untouched.
    const plain = await pm.onSourceTextPage().getSegmentSpanLayout(PLAIN_REF);
    expect(plain!.translation!.width).toBeLessThan(plain!.segmentWidth * 0.75);
  });

  test('SID-003: source-only with an English UI shows the rubric', async () => {
    await pm.onSourceTextPage().setContentLanguage(SOURCE_LANGUAGES.HE);

    const rubric = await pm.onSourceTextPage().isInstructionRendered(RUBRIC_ONLY_REF);
    expect(rubric).not.toBeNull();
    expect(rubric!.present).toBe(true);
    expect(rubric!.rendered).toBe(true);
    expect(rubric!.height).toBeGreaterThan(0);
  });
});

test.describe('Library Reader — Siddur instruction rubrics — Hebrew', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.HE.LIBRARY}${SECTION_PATH}`, LANGUAGES.HE);
    pm = new PageManager(page, LANGUAGES.HE);
    await hideAllModalsAndPopups(page);
    await expect(page.locator(`.basetext .segment[data-ref="${PLAIN_REF}"]`))
      .toBeVisible({ timeout: t(30000) });
  });

  test('SID-004: source-only with a Hebrew UI keeps the English rubric hidden', async () => {
    await pm.onSourceTextPage().setContentLanguage(SOURCE_LANGUAGES.HE);

    const rubric = await pm.onSourceTextPage().isInstructionRendered(RUBRIC_ONLY_REF);
    expect(rubric).not.toBeNull();
    expect(rubric!.present).toBe(true);
    expect(rubric!.rendered).toBe(false);
  });
});
