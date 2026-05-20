import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Guide / Guided Learning (RP-190 → RP-194).
 *
 * Mode anchor: `.guideBox`. Reached from Resources by clicking
 * `data-name="Guided Learning"` — but the button is rendered only when
 * `Sefaria.guidesByRef(srefs).length > 0` (ConnectionsPanel.jsx:297).
 *
 * **Per Hershel: production currently only has guide content for Pirkei Avot.**
 * The tests below use `Pirkei_Avot.1` (specifically segment 1:1) where the
 * Guided Learning button is present and exercisable.
 *
 * Source: GuideBox.jsx — three states (QUESTIONS → SUMMARIES → COMMENTARIES)
 * driven by a custom setState that pushes previous state onto a stack for
 * back-navigation. Each state renders `.guidePromptBox` items; the
 * commentaries state renders a `<TextRange>` instead.
 */
test.describe('Resource Panel — Guide — Pirkei Avot', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Pirkei_Avot.1`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickFirstSegmentToOpen();
  });

  test('RP-190: Guided Learning panel renders the Key Questions list', async () => {
    expect(await pm.onResourcePanel().hasGuideButton()).toBeTruthy();
    await pm.onResourcePanel().openGuide();
    // The Guided Learning header carries the "Experiment" label.
    await pm.onResourcePanel().expectGuideExperimentLabel();
    // Key Questions are rendered as `.guidePromptBox` rows.
    const prompts = await pm.onResourcePanel().guidePromptBoxes().count();
    expect(prompts).toBeGreaterThan(0);
  });

  test('RP-191: Clicking a key question transitions to the summaries view', async () => {
    await pm.onResourcePanel().openGuide();
    const before = await pm.onResourcePanel().guidePromptBoxes().first().textContent();
    await pm.onResourcePanel().clickFirstGuidePrompt();
    // SUMMARIES state still renders `.guidePromptBox` rows but with different
    // text (each row shows a summary + commentary ref). Assert that the
    // first prompt's text has changed, which proves we moved off QUESTIONS.
    const promptsAfter = pm.onResourcePanel().guidePromptBoxes();
    await expect(promptsAfter.first()).toBeVisible({ timeout: t(15000) });
    const after = await promptsAfter.first().textContent();
    expect(after).not.toBe(before);
  });

  test('RP-192: Clicking a summary transitions to the commentary view', async () => {
    await pm.onResourcePanel().openGuide();
    await pm.onResourcePanel().clickFirstGuidePrompt();    // Q → S
    await pm.onResourcePanel().clickFirstGuidePrompt();    // S → C
    // COMMENTARIES renders a TextRange instead of guidePromptBox rows.
    await pm.onResourcePanel().expectGuideCommentaryMode();
  });

  test('RP-193: Back button traverses guide states (C → S → Q → Resources)', async () => {
    await pm.onResourcePanel().openGuide();
    await pm.onResourcePanel().clickFirstGuidePrompt(); // Q → S
    await pm.onResourcePanel().clickFirstGuidePrompt(); // S → C
    // Back: C → S
    await pm.onResourcePanel().clickBack();
    await expect(pm.onResourcePanel().guidePromptBoxes().first()).toBeVisible({ timeout: t(15000) });
    // Back: S → Q
    await pm.onResourcePanel().clickBack();
    await expect(pm.onResourcePanel().guidePromptBoxes().first()).toBeVisible({ timeout: t(15000) });
    // Back: Q → Resources (GuideBox calls setPreviousSettings(null) when the
    // history is empty, restoring the default back behaviour).
    await pm.onResourcePanel().clickBack();
    await pm.onResourcePanel().expectMode('Resources');
  });
});

test.describe('Resource Panel — Guide — Hidden when no guide content', () => {
  test('RP-194: Guided Learning button is hidden on a text without guide content', async ({ context }) => {
    // Genesis.1 has no guide content (per `Sefaria.guidesByRef`); the
    // Guided Learning button should not render.
    const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    const hasGuide = await pm.onResourcePanel().hasGuideButton();
    expect(hasGuide).toBeFalsy();
  });
});
