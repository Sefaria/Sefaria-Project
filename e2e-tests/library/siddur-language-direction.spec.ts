import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

/**
 * SID-01N — Language direction on refs whose source side is empty (sc-46469).
 *
 * Landing directly on a segment that has no source text made the WHOLE section render its
 * Hebrew left-to-right. The segment-level API call returns only the translation version (there
 * is no Hebrew for that segment), and `getPrimaryAndTranslationFromVersions` promoted that lone
 * translation to `primary` — handing its `ltr` direction and `english` language to every segment
 * in the section, including the ones that do have Hebrew.
 *
 * The commentary panel in the original report is incidental: clicking a segment to open
 * commentary just moves the URL to that segment ref, which is what triggers the fetch. Loading
 * the section ref, or a segment that has Hebrew, was always fine — SID-012 pins that control so
 * a regression can't be mistaken for "the test never worked".
 */

const SECTION_REF = 'The Koren Shalem Siddur; Ashkenaz, Weekdays, Tefillin';
const SECTION_SLUG = 'The_Koren_Shalem_Siddur%3B_Ashkenaz%2C_Weekdays%2C_Tefillin';

const HEBREW_SEGMENT_REF = `${SECTION_REF} 2`;  // has Hebrew; renders correctly even on master
const HEBREW_RANGE = /[֐-׿]/;

test.describe('Library Reader — language direction with an empty source segment — English', () => {
  let page: Page;
  let pm: PageManager;

  const loadAt = async (context, segment: string) => {
    page = await goToPageWithLang(
      context, `${MODULE_URLS.EN.LIBRARY}/${SECTION_SLUG}.${segment}?lang=bi`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await expect(page.locator(`.basetext .segment[data-ref="${HEBREW_SEGMENT_REF}"]`))
      .toBeVisible({ timeout: t(30000) });
  };

  test('SID-011: landing on a source-less segment keeps the section Hebrew right-to-left', async ({ context }) => {
    // Segment 1 is an instruction rubric with no Hebrew — the trigger for sc-46469.
    await loadAt(context, '1');

    const seg = await pm.onSourceTextPage().getSegmentSpanLayout(HEBREW_SEGMENT_REF);
    expect(seg).not.toBeNull();

    // Sanity: this segment really does carry Hebrew source text.
    const sourceText = await page.locator(
      `.basetext .segment[data-ref="${HEBREW_SEGMENT_REF}"] .contentSpan.primary`).innerText();
    expect(sourceText).toMatch(HEBREW_RANGE);

    // ...so its source span must be marked Hebrew and render rtl.
    expect(seg!.primary!.className).toContain('he');
    expect(seg!.primary!.className).not.toContain('contentSpan en');
    expect(seg!.primary!.direction).toBe('rtl');
  });

  test('SID-012: landing on a segment that has Hebrew is unaffected (control)', async ({ context }) => {
    await loadAt(context, '2');

    const seg = await pm.onSourceTextPage().getSegmentSpanLayout(HEBREW_SEGMENT_REF);
    expect(seg!.primary!.className).toContain('he');
    expect(seg!.primary!.direction).toBe('rtl');
  });
});
