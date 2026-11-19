import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { ENDPOINTS, enterPortal, flattenedSidebarOrder, stubExternalSites } from '../developers-entry';

// An endpoint page outside Try It (brief §4.3; PLAN §6.2 B, C, D and F): headline, parameters, responses,
// code samples, the tags popover, "Updated", prev/next, feedback and the request-panel Discord button.
test.describe('Developers Reference, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterPortal(context, ENDPOINTS.texts.path));
  });

  test(
    'DEV-REF-001: /reference/get-v3-texts renders its title, method badge, parameters and the request panel',
    { tag: ['@sanity', '@pr'] },
    async () => {
      const reference = pm.onDevelopersReference();
      expect(await pm.onDevelopersShell().pageTitle()).toBe('Texts (v3)');
      expect(await reference.methodBadge()).toBe('GET');
      expect(await reference.parameterNames('path')).toEqual(['tref']);
      expect(await reference.parameterNames('query')).toContain('version');
      expect(await reference.languageButtons()).toEqual(['Shell', 'Node', 'Ruby', 'PHP', 'Python']);
      expect(await reference.codeSampleText()).toContain('https://www.sefaria.org/api/v3/texts/');
    }
  );

  test('DEV-REF-002: The URL line shows the server and the path template', async () => {
    expect(await pm.onDevelopersReference().urlLineText()).toBe('https://www.sefaria.org/api/v3/texts/{tref}');
  });

  test('DEV-REF-003: The document title is the operation summary', async () => {
    await expect(page).toHaveTitle('Texts (v3)');
  });

  test("DEV-REF-004: The tag button opens a popover naming the operation's tag", async () => {
    expect(await pm.onDevelopersReference().openTagPopover()).toMatch(/^Text\b/);
  });

  // ---- B. Parameters ----------------------------------------------------------------------

  test('DEV-REF-010: A text input is prefilled with its default and labelled with type, required and default', async () => {
    const info = await pm.onDevelopersReference().parameterInfo('path', 'tref');
    expect(info).toMatchObject({
      name: 'tref',
      type: 'string',
      required: true,
      defaultText: 'Defaults to Esther 1.1',
      value: 'Esther 1.1',
      isEnum: false,
      anchor: 'path-params-tref',
    });
  });

  test('DEV-REF-011: An optional text input shows its first example as the placeholder', async () => {
    const info = await pm.onDevelopersReference().parameterInfo('query', 'version');
    expect(info.required).toBe(false);
    expect(info.placeholder).not.toBeNull();
    expect(info.value).toBe('');
  });

  test('DEV-REF-012: An enum shows a select and "Allowed:" chips', async () => {
    const reference = pm.onDevelopersReference();
    const info = await reference.parameterInfo('query', 'return_format');
    expect(info.isEnum).toBe(true);
    expect(await reference.allowedChips('query', 'return_format')).toEqual([
      'default',
      'wrap_all_entities',
      'strip_only_footnotes',
      'text_only',
    ]);
  });

  test('DEV-REF-013: Clicking an "Allowed:" chip copies its value without changing the select', async () => {
    const reference = pm.onDevelopersReference();
    const before = await reference.parameterValue('query', 'return_format');
    expect(await reference.clickAllowedChip('query', 'return_format', 'text_only')).toBe('Copied!');
    expect(await reference.clipboardText()).toBe('text_only');
    expect(await reference.parameterValue('query', 'return_format')).toBe(before);
  });

  test('DEV-REF-014: Choosing an enum value updates the code sample', async () => {
    const reference = pm.onDevelopersReference();
    await reference.selectEnumValue('query', 'return_format', 'text_only');
    expect(await reference.parameterValue('query', 'return_format')).toBe('text_only');
    await expect.poll(() => reference.codeSampleText(), { timeout: t(5000) }).toContain('return_format=text_only');
  });

  test('DEV-REF-015: An input with examples lists "Use example value" entries on focus', async () => {
    const reference = pm.onDevelopersReference();
    const examples = await reference.openExampleList('path', 'tref');
    expect(examples.length).toBeGreaterThan(0);
    await reference.useExampleValue('path', 'tref', examples[1]);
    expect(await reference.parameterValue('path', 'tref')).toBe(examples[1]);
  });

  test('DEV-REF-016: Each parameter and each section has an anchor', async () => {
    const reference = pm.onDevelopersReference();
    expect(await reference.sectionAnchors()).toEqual(['path-params', 'query-params', 'response-schemas']);
    for (const name of await reference.parameterNames('query')) {
      expect((await reference.parameterInfo('query', name)).anchor).toBe(`query-params-${name}`);
    }
  });

  test('DEV-REF-017: Clicking the {tref} chip focuses its input; typing replaces the chip and updates the sample', async () => {
    const reference = pm.onDevelopersReference();
    await reference.clickUrlPlaceholder('tref');
    expect(await reference.isParameterFocused('path', 'tref')).toBe(true);
    await reference.fillParameter('path', 'tref', 'Genesis 1:1');
    expect(await reference.urlLineText()).toBe('https://www.sefaria.org/api/v3/texts/Genesis 1:1');
    await expect.poll(() => reference.codeSampleText(), { timeout: t(5000) }).toMatch(/texts\/Genesis(%20| )1(%3A|:)1/);
  });

  test('DEV-REF-018: A POST page has body params whose object expands with "+" to its fields', async () => {
    const reference = pm.onDevelopersReference();
    await pm.onDevelopersShell().openPath(ENDPOINTS.findRefs.path);
    expect(await reference.methodBadge()).toBe('POST');
    expect(await reference.sectionAnchors()).toContain('body-params');
    expect(await reference.parameterNames('body')).toEqual(expect.arrayContaining(['text']));
    const fields = await reference.expandBodyObject('text');
    expect(fields).toEqual(expect.arrayContaining(['body', 'title']));
  });

  test('DEV-REF-019: Tab from an input with examples closes its list and moves on to the next field, as on live', async () => {
    const reference = pm.onDevelopersReference();
    await pm.onDevelopersShell().openPath(ENDPOINTS.findRefs.path);
    await reference.expandBodyObject('text');
    expect((await reference.openExampleList('body', 'text.title')).length).toBeGreaterThan(0);
    // Live's next stops: the lang row's anchor, then its select; the "Use example value" entries are not Tab stops.
    await reference.pressTab();
    await expect.poll(() => reference.isExampleListOpen('body', 'text.title'), { timeout: t(5000) }).toBe(false);
    expect(await reference.isParameterFocused('body', 'text.title')).toBe(false);
    await reference.pressTab();
    expect(await reference.isParameterFocused('body', 'lang')).toBe(true);
  });

  // ---- C. Responses -----------------------------------------------------------------------

  test('DEV-REF-020: The responses heading reads "Response" for one status code', async () => {
    const reference = pm.onDevelopersReference();
    const statuses = await reference.responseStatuses();
    expect(await reference.responsesHeading()).toBe(statuses.length === 1 ? 'Response' : 'Responses');
    expect(statuses[0]).toMatchObject({ code: '200', description: 'Successful retrieval of the desired texts.' });
  });

  test('DEV-REF-021: Each status is an accordion with a coloured dot; it opens and closes', async () => {
    const reference = pm.onDevelopersReference();
    const [first] = await reference.responseStatuses();
    expect(first.dotColor).not.toBe('rgba(0, 0, 0, 0)');
    // Live opens the first status after hydration (Responses.tsx); the toggle closes and reopens it.
    const initially = await reference.isResponseExpanded('200');
    await reference.toggleResponse('200');
    expect(await reference.isResponseExpanded('200')).toBe(!initially);
    await reference.toggleResponse('200');
    expect(await reference.isResponseExpanded('200')).toBe(initially);
  });

  test('DEV-REF-022: An expanded status shows "Response body", its type and its properties', async () => {
    const properties = await pm.onDevelopersReference().responseProperties('200');
    expect(properties).toEqual(expect.arrayContaining(['versions', 'ref', 'heRef', 'sections']));
  });

  test('DEV-REF-023: Arrays of objects show their item properties in sub-cards', async () => {
    const items = await pm.onDevelopersReference().expandChildAttributes('200', 'versions');
    expect(items).toEqual(expect.arrayContaining(['versionTitle', 'language', 'text']));
  });

  test('DEV-REF-024: A nested array sits behind an expander that closes with ✕', async () => {
    const reference = pm.onDevelopersReference();
    expect(await reference.isNestedArrayOpen()).toBe(false);
    await reference.openNestedArray('200', 'text');
    expect(await reference.isNestedArrayOpen()).toBe(true);
    await reference.closeNestedArray();
    expect(await reference.isNestedArrayOpen()).toBe(false);
  });

  test('DEV-REF-027: A union type offers a variant select', async () => {
    const reference = pm.onDevelopersReference();
    expect(await reference.unionVariant('200', 'priority')).toBe('string');
    await reference.selectUnionVariant('200', 'priority', 'number');
    expect(await reference.unionVariant('200', 'priority')).toBe('number');
  });

  test('DEV-REF-025: The response panel shows the first example on load', async () => {
    expect(await pm.onDevelopersReference().responseExampleLabel()).toBe('200 - Esther 1.1');
  });

  test('DEV-REF-026: The status dropdown lists the examples and "Clear Example"; clearing shows the example chips', async () => {
    const reference = pm.onDevelopersReference();
    const entries = await reference.openResponseExampleMenu();
    expect(entries[0]).toBe('200 - Esther 1.1');
    expect(entries[entries.length - 1]).toBe('Clear Example');
    await reference.clearResponseExample();
    expect(await reference.responseExampleLabel()).toBeNull();
    const chips = await reference.emptyStateExampleChips();
    expect(chips).toContain('200 - Esther 1.1');
  });

  // ---- D. Code samples --------------------------------------------------------------------

  test('DEV-REF-030: Shell is selected on load; the "⋯" menu has 18 entries starting with "Agent Prompt"', async () => {
    const reference = pm.onDevelopersReference();
    expect(await reference.selectedLanguage()).toBe('Shell');
    const more = await reference.openMoreLanguages();
    expect(more).toHaveLength(18);
    expect(more[0]).toBe('Agent Prompt');
  });

  test("DEV-REF-031: The request card's header button opens the library menu for the language", async () => {
    const reference = pm.onDevelopersReference();
    await reference.selectLanguage('Node');
    expect(await reference.openLibraryMenu()).toEqual(expect.arrayContaining(['Axios', 'fetch', 'http']));
    await reference.selectLibrary('fetch');
    expect(await reference.selectedLibrary()).toMatch(/fetch/);
    expect(await reference.codeSampleText()).toContain('fetch(');
  });

  test('DEV-REF-032: The chosen language and library survive a reload', async () => {
    const reference = pm.onDevelopersReference();
    await reference.selectLanguage('Python');
    const library = await reference.selectedLibrary();
    await pm.onDevelopersShell().openPath(ENDPOINTS.texts.path);
    expect(await reference.selectedLanguage()).toBe('Python');
    expect(await reference.selectedLibrary()).toBe(library);
  });

  test('DEV-REF-033: The copy button copies the sample and shows "Copied!"', async () => {
    const reference = pm.onDevelopersReference();
    const sample = await reference.codeSampleText();
    expect(await reference.copyCodeSample()).toBe('Copied!');
    expect((await reference.clipboardText()).trim()).toBe(sample.trim());
  });

  test('DEV-REF-034: Each language changes the sample', async () => {
    test.slow();
    const reference = pm.onDevelopersReference();
    const samples = new Set<string>();
    for (const language of await reference.languageButtons()) {
      await reference.selectLanguage(language);
      samples.add(await reference.codeSampleText());
    }
    expect(samples.size).toBe(5);
  });

  test('DEV-REF-035: POST pages offer an "Examples" dropdown of request bodies; GET pages do not', async () => {
    const reference = pm.onDevelopersReference();
    expect(await reference.requestBodyExamples()).toEqual([]);
    await pm.onDevelopersShell().openPath(ENDPOINTS.findRefs.path);
    const examples = await reference.requestBodyExamples();
    expect(examples.length).toBeGreaterThan(0);
    await reference.selectRequestBodyExample(examples[0]);
    expect(await reference.codeSampleText()).toContain('"text"');
  });

  // ---- F. Page chrome ---------------------------------------------------------------------

  test('DEV-REF-040: "Updated N ago" shows a relative time', async () => {
    expect(await pm.onDevelopersShell().updatedText()).toMatch(/^Updated .+ ago$/);
  });

  test('DEV-REF-041: Prev/next follow the flattened sidebar order and skip group rows', async () => {
    const order = await flattenedSidebarOrder(pm, 'reference');
    const here = order.indexOf(ENDPOINTS.texts.path);
    const { previous, next } = await pm.onDevelopersShell().prevNextLinks();
    // The "Text" tag group row sits between the two and is skipped.
    expect(previous?.href).toBe(order[here - 1]);
    expect(next?.href).toBe(order[here + 1]);
    expect([previous?.href, next?.href]).not.toContain('/reference/text');
  });

  test('DEV-REF-042: Feedback on an endpoint page posts its path', async () => {
    const shell = pm.onDevelopersShell();
    const capture = await shell.interceptFeedback();
    await shell.answerFeedback('Yes');
    await shell.submitFeedbackVote();
    await expect.poll(() => capture.requests.length, { timeout: t(10000) }).toBe(1);
    expect(JSON.parse(capture.requests[0].body ?? '{}')).toMatchObject({
      path: ENDPOINTS.texts.path,
      helpful: true,
      comment: '',
    });
  });

  test('DEV-REF-043: The request panel carries "Join our Discord"', async ({ context }) => {
    const shell = pm.onDevelopersShell();
    const button = await shell.discordButton('reference_request_panel');
    expect(button).toMatchObject({ name: 'Join our Discord', opensInNewTab: true });
    expect(button!.href).toMatch(/sefaria\.formstack\.com\/forms\/sefaria_developer_discord_community/);
    await stubExternalSites(context, /formstack\.com/);
    const tab = await shell.clickDiscordButton('reference_request_panel');
    await expect(tab).toHaveURL(/formstack\.com/);
    await tab.close();
  });

  test('DEV-REF-044: A deprecated endpoint shows its marker on the page and in the sidebar', async () => {
    const reference = pm.onDevelopersReference();
    const shell = pm.onDevelopersShell();
    expect(await reference.isDeprecated()).toBe(false);
    for (const path of ENDPOINTS.deprecated) {
      await shell.openPath(path);
      expect(await reference.isDeprecated(), path).toBe(true);
      expect((await shell.sidebarItems()).find((i) => i.href === path)?.deprecated, path).toBe(true);
    }
  });
});
