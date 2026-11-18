import * as fs from 'node:fs';
import { test, expect, Page } from '@playwright/test';
import { t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { EditorBlock } from '../../pages/developers/developersCommon';
import { enterBlank } from '../developers-entry';
import { RUN_ID, enterAsNonStaff, enterEditorAsStaff } from './editor-entry';

// The staff editor (brief §4.6, PLAN §2.11; devportal-ui/src/editor). Read-only and intercepted tests touch
// nothing; the real-write tests (PLAN §5.2.2 "Writes") work only on hidden custom pages titled
// `e2e-<run id>-…`, delete them in afterEach, and never run in @pr (none here is tagged).

const BLOCKS: EditorBlock[] = [
  'Callout',
  'Image',
  'Table',
  'Embed',
  'HTML Block',
  'Code Block',
  'Heading',
  'Bulleted List',
  'Numbered List',
  'Quote',
  'Divider',
];

test.describe('Developers Editor, English (access)', () => {
  test('DEV-EDIT-001: An anonymous visitor is sent to the login page; the editor API answers 401', async ({
    context,
  }) => {
    const { pm } = await enterBlank(context);
    const copy = pm.onDevelopersCopyPage();
    const shell = await copy.httpGet('/editor');
    expect(shell.status).toBe(302);
    expect(shell.headers['location']).toBe('/login?next=%2Feditor');
    expect((await copy.httpGet('/editor/docs/welcome')).headers['location']).toBe(
      '/login?next=%2Feditor%2Fdocs%2Fwelcome'
    );
    expect((await copy.httpGet('/_portal/editor/tree/docs')).status).toBe(401);
  });

  test('DEV-EDIT-002: A signed-in visitor who is not staff is refused', async ({ context }) => {
    const { pm } = await enterAsNonStaff(context);
    expect(await pm.onDevelopersEditor().accessOutcome()).toBe('forbidden');
    expect((await pm.onDevelopersCopyPage().httpGet('/_portal/editor/tree/docs')).status).toBe(403);
  });

  test('DEV-EDIT-003: Staff get the editor', async ({ context }) => {
    const { pm } = await enterEditorAsStaff(context);
    expect(await pm.onDevelopersEditor().accessOutcome()).toBe('editor');
  });
});

test.describe('Developers Editor, English (read-only and intercepted)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterEditorAsStaff(context));
  });

  test('DEV-EDIT-010: Each section has its page tree, with groups, endpoints and hidden pages marked', async () => {
    const editor = pm.onDevelopersEditor();
    await editor.selectSection('docs');
    const docs = await editor.treeItems();
    expect(docs.some((item) => item.kind === 'group' && item.title.toUpperCase() === 'TECHNICAL DOCS')).toBe(true);
    expect(docs.find((item) => item.title === "Welcome to Sefaria's Technical Documentation")?.depth).toBeGreaterThan(
      0
    );
    expect(docs.find((item) => item.title === 'Shape API')?.hidden).toBe(true);
    await editor.selectSection('reference');
    expect((await editor.treeItems()).some((item) => item.kind === 'endpoint' && item.title === 'Texts (v3)')).toBe(
      true
    );
    await editor.selectSection('custom_pages');
    expect((await editor.treeItems()).map((item) => item.title)).toContain('Contact Us');
  });

  test('DEV-EDIT-011: Opening a page shows its title, body and settings', async () => {
    const editor = pm.onDevelopersEditor();
    await editor.selectSection('docs');
    await editor.selectPage('Text References');
    expect(await editor.currentMode()).toBe('edit');
    expect(await editor.settingValue('pageType')).toBe('Page');
    expect(await editor.settingValue('slug')).toBe('text-references');
    expect(await editor.settingValue('visibility')).toBe('public');
    expect((await editor.documentBlocks()).length).toBeGreaterThan(3);
  });

  test("DEV-EDIT-012: View shows the server's rendering of the draft; Edit returns to the canvas", async () => {
    const editor = pm.onDevelopersEditor();
    await editor.selectSection('docs');
    await editor.selectPage('Text References');
    await editor.setMode('view');
    expect(await editor.currentMode()).toBe('view');
    expect(await editor.previewText()).toMatch(/^Text References/);
    await editor.setMode('edit');
    expect(await editor.currentMode()).toBe('edit');
  });

  test('DEV-EDIT-013: An unknown construct is kept as raw Markdown, not dropped', async () => {
    const editor = pm.onDevelopersEditor();
    await editor.selectSection('custom_pages');
    await editor.selectPage('Contact Us');
    const blocks = await editor.documentBlocks();
    // The contact page's body is raw HTML: it stays a source block (rawHtml), never dropped.
    expect(blocks.some((b) => ['rawHtml', 'htmlBlock', 'rawMarkdown'].includes(b))).toBe(true);
  });

  test('DEV-EDIT-014: The "/" menu offers every construct', async () => {
    const editor = pm.onDevelopersEditor();
    await editor.selectSection('docs');
    await editor.selectPage('Text References');
    const entries = await editor.openSlashMenu();
    for (const label of [
      'Text',
      'Heading 2',
      'Bulleted list',
      'Numbered list',
      'Quote',
      'Callout',
      'Code block',
      'Table',
      'Image',
      'Embed',
      'HTML block',
      'Divider',
    ]) {
      expect(entries, label).toContain(label);
    }
  });

  for (const [index, block] of BLOCKS.entries()) {
    test(`DEV-EDIT-${String(20 + index).padStart(3, '0')}: The "/" menu inserts a ${block}`, async () => {
      const editor = pm.onDevelopersEditor();
      const writes = await editor.interceptEditorWrites();
      await editor.selectSection('docs');
      await editor.selectPage('Text References');
      // A paragraph first, so the new block does not join a list the page ends with (lists merge).
      await editor.appendParagraph(`${RUN_ID} anchor`);
      const before = await editor.documentBlocks();
      await editor.openSlashMenu();
      await editor.insertBlock(block);
      const after = await editor.documentBlocks();
      const expected: Record<EditorBlock, string> = {
        Callout: 'callout',
        Image: 'image',
        Table: 'table',
        Embed: 'embed',
        'HTML Block': 'htmlBlock',
        'Code Block': 'codeBlock',
        Heading: 'heading',
        'Bulleted List': 'bulletList',
        'Numbered List': 'orderedList',
        Quote: 'blockquote',
        Divider: 'horizontalRule',
      };
      expect(after.slice(0, before.length)).toEqual(before);
      expect(after[before.length]).toBe(expected[block]);
      expect(writes.requests.filter((r) => !r.url.endsWith('/preview'))).toEqual([]);
    });
  }

  test('DEV-EDIT-035: Saving sends the base revision and the edited content (intercepted)', async () => {
    const editor = pm.onDevelopersEditor();
    await editor.selectSection('docs');
    await editor.selectPage('Text References');
    const writes = await editor.interceptDraftSaves();
    await editor.appendParagraph(`${RUN_ID} intercepted paragraph`);
    await editor.saveDraft();
    const draft = writes.requests.find(
      (r) => r.method === 'PUT' && /\/_portal\/editor\/pages\/\d+\/draft$/.test(r.url)
    );
    expect(draft).toBeDefined();
    const body = JSON.parse(draft!.body ?? '{}');
    expect(typeof body.baseRevision).toBe('number');
    expect(JSON.stringify(body.content)).toContain(`${RUN_ID} intercepted paragraph`);
    expect(draft!.headers['x-csrftoken']).toBeTruthy();
  });

  test('DEV-EDIT-036: An endpoint shows the spec read-only and edits only the overlay (intercepted)', async () => {
    const editor = pm.onDevelopersEditor();
    await editor.selectSection('reference');
    await editor.selectPage('Texts (v3)');
    expect(await editor.readOnlySpecFields()).toEqual(
      expect.arrayContaining([
        'Method and path',
        'Title in the API definition',
        'Tags',
        'Description in the API definition',
      ])
    );
    const writes = await editor.interceptDraftSaves();
    await editor.setOverlayField('title', `${RUN_ID} title`);
    await editor.setOverlayField('sidebarLabel', `${RUN_ID} label`);
    await editor.setOverlayField('description', `${RUN_ID} description`);
    await editor.saveDraft();
    const draft = writes.requests.find((r) => r.method === 'PUT');
    const body = JSON.stringify(JSON.parse(draft?.body ?? '{}'));
    expect(body).toContain(`${RUN_ID} title`);
    expect(body).toContain(`${RUN_ID} label`);
    expect(body).toContain(`${RUN_ID} description`);
    expect(body).not.toContain('"paths"');
  });

  test('DEV-EDIT-037: An image is uploaded through the image block (intercepted)', async ({}, testInfo) => {
    const editor = pm.onDevelopersEditor();
    await editor.selectSection('docs');
    await editor.selectPage('Text References');
    const file = testInfo.outputPath('e2e.png');
    fs.writeFileSync(
      file,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      )
    );
    const url = 'https://storage.googleapis.com/e2e-bucket/developers/abc123-e2e.png';
    const writes = await editor.interceptEditorWrites(
      JSON.stringify({
        contractVersion: 1,
        created: true,
        asset: { id: 1, url, contentType: 'image/png', size: 68, width: 1, height: 1, sha256: 'abc123' },
      })
    );
    await editor.openSlashMenu();
    await editor.insertBlock('Image');
    expect(await editor.uploadImage(file)).toBe(url);
    const upload = writes.requests.find((r) => r.url.endsWith('/_portal/editor/uploads'));
    expect(upload?.method).toBe('POST');
    expect(upload?.headers['content-type']).toMatch(/^multipart\/form-data/);
  });

  test('DEV-EDIT-038: The editor page has no accessibility violation', async () => {
    const editor = pm.onDevelopersEditor();
    await editor.selectSection('docs');
    await editor.selectPage('Text References');
    const violations = await pm.onDevelopersShell().axeViolations();
    expect(violations, violations.map((v) => `${v.id}: ${v.targets.join(', ')}`).join('\n')).toEqual([]);
    await expect(page).toHaveURL(/\/editor/);
  });
});

test.describe('Developers Editor, English (real writes)', () => {
  let page: Page;
  let pm: PageManager;
  const created: string[] = [];

  test.beforeEach(async ({ context }) => {
    ({ page, pm } = await enterEditorAsStaff(context));
    await pm.onDevelopersEditor().selectSection('custom_pages');
  });

  test.afterEach(async () => {
    const editor = pm.onDevelopersEditor();
    // Children first: a row with children has no Delete.
    for (const title of created.splice(0).reverse()) await editor.deletePage(title);
  });

  async function newHiddenPage(suffix: string): Promise<{ title: string; slug: string }> {
    const editor = pm.onDevelopersEditor();
    const title = `${RUN_ID}-${suffix}`;
    await editor.newPage(title);
    created.push(title);
    await editor.openSettings();
    await editor.setSetting('visibility', 'hidden');
    return { title, slug: String(await editor.settingValue('slug')) };
  }

  test('DEV-EDIT-040: "+ New page" creates an unpublished page that visitors cannot see', async () => {
    const editor = pm.onDevelopersEditor();
    const { title, slug } = await newHiddenPage('new');
    expect(slug).toMatch(new RegExp(`^${RUN_ID}-new`));
    expect((await editor.treeItems()).map((i) => i.title)).toContain(title);
    expect((await pm.onDevelopersCopyPage().httpGet(`/page/${slug}`)).status).toBe(404);
  });

  test('DEV-EDIT-041: A draft is not public; publishing makes it public', async () => {
    const editor = pm.onDevelopersEditor();
    const copy = pm.onDevelopersCopyPage();
    const { slug } = await newHiddenPage('publish');
    await editor.appendParagraph('First published text.');
    await editor.saveDraft();
    expect(await editor.saveStatus()).toMatch(/^Draft saved as revision \d+\. Visitors still see the published page\./);
    expect((await copy.httpGet(`/page/${slug}`)).status).toBe(404);
    await editor.publish();
    expect(await editor.saveStatus()).toMatch(/^Published revision \d+/);
    const published = await copy.httpGet(`/page/${slug}`);
    expect(published.status).toBe(200);
    expect(published.body).toContain('First published text.');
  });

  test('DEV-EDIT-042: Visitors keep seeing the published version while a newer draft exists', async () => {
    const editor = pm.onDevelopersEditor();
    const copy = pm.onDevelopersCopyPage();
    const { slug } = await newHiddenPage('draft');
    await editor.appendParagraph('Published version.');
    await editor.publish();
    await editor.replaceParagraphText('Published version.', 'Draft version.');
    await editor.saveDraft();
    let body = (await copy.httpGet(`/page/${slug}`)).body;
    expect(body).toContain('Published version.');
    expect(body).not.toContain('Draft version.');
    await editor.setMode('view');
    expect(await editor.previewText()).toContain('Draft version.');
    await editor.publish();
    body = (await copy.httpGet(`/page/${slug}`)).body;
    expect(body).toContain('Draft version.');
  });

  test('DEV-EDIT-043: Revision history lists revisions newest first; restoring creates a new draft', async () => {
    const editor = pm.onDevelopersEditor();
    await newHiddenPage('revisions');
    await editor.appendParagraph('Revision A text.');
    await editor.saveDraft();
    await editor.replaceParagraphText('Revision A text.', 'Revision B text.');
    await editor.saveDraft();
    const revisions = await editor.openRevisionHistory();
    expect(revisions.length).toBeGreaterThanOrEqual(3);
    const numbers = revisions.map((r) => r.number);
    expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
    const older = revisions[1].number;
    await editor.restoreRevision(older);
    const after = await editor.openRevisionHistory();
    expect(after[0].number).toBe(numbers[0] + 1);
    await editor.setMode('view');
    expect(await editor.previewText()).toContain('Revision A text.');
  });

  // Custom pages are a flat list, so nesting is tried in docs: a hidden, unpublished page under the
  // "TECHNICAL DOCS" category, and a child under it; both are deleted afterwards.
  test('DEV-EDIT-044: "+ add child" creates a page under another', async () => {
    const editor = pm.onDevelopersEditor();
    await editor.selectSection('docs');
    const parent = { title: `${RUN_ID}-parent` };
    const categories = (await editor.treeItems()).filter((i) => i.kind === 'group');
    const category = categories.find((c) => c.title.toUpperCase() === 'TECHNICAL DOCS')!.title;
    await editor.addChild(category, parent.title);
    created.push(parent.title);
    await editor.openSettings();
    await editor.setSetting('visibility', 'hidden');
    await editor.saveDraft();
    const child = `${RUN_ID}-child`;
    await editor.addChild(parent.title, child);
    created.push(child);
    const items = await editor.treeItems();
    const parentRow = items.find((i) => i.title === parent.title)!;
    const childRow = items.find((i) => i.title === child)!;
    expect(childRow.depth).toBe(parentRow.depth + 1);
    expect(items.indexOf(childRow)).toBe(items.indexOf(parentRow) + 1);
  });

  test('DEV-EDIT-045: Dragging a row reorders the tree, and the order is saved', async () => {
    const editor = pm.onDevelopersEditor();
    const first = await newHiddenPage('first');
    const second = await newHiddenPage('second');
    const order = () =>
      editor.treeItems().then((items) => items.map((i) => i.title).filter((t) => t.startsWith(RUN_ID)));
    expect(await order()).toEqual([first.title, second.title]);
    await editor.movePage(second.title, { before: first.title });
    await expect.poll(order, { timeout: t(10000) }).toEqual([second.title, first.title]);
    await editor.open();
    await editor.selectSection('custom_pages');
    expect(await order()).toEqual([second.title, first.title]);
  });

  test('DEV-EDIT-046: Settings are saved: subtitle and SEO fields', async () => {
    const editor = pm.onDevelopersEditor();
    const { title } = await newHiddenPage('settings');
    await editor.setSetting('subtitle', 'An e2e subtitle');
    await editor.setSetting('seoTitle', 'An e2e meta title');
    await editor.setSetting('seoDescription', 'An e2e meta description');
    await editor.saveDraft();
    await editor.open();
    await editor.selectSection('custom_pages');
    await editor.selectPage(title);
    await editor.openSettings();
    expect(await editor.settingValue('subtitle')).toBe('An e2e subtitle');
    expect(await editor.settingValue('seoTitle')).toBe('An e2e meta title');
    expect(await editor.settingValue('seoDescription')).toBe('An e2e meta description');
    expect(await editor.settingValue('visibility')).toBe('hidden');
  });

  test("DEV-EDIT-047: Changing a published page's slug redirects the old address", async () => {
    const editor = pm.onDevelopersEditor();
    const copy = pm.onDevelopersCopyPage();
    const { slug } = await newHiddenPage('slug');
    await editor.appendParagraph('Slug test.');
    await editor.publish();
    const renamed = `${slug}-renamed`;
    await editor.setSetting('slug', renamed);
    const old = await copy.httpGet(`/page/${slug}`);
    expect(old.status).toBe(301);
    expect(old.headers['location']).toMatch(new RegExp(`/page/${renamed}$`));
    expect((await copy.httpGet(`/page/${renamed}`)).status).toBe(200);
  });

  test('DEV-EDIT-048: Editing the title updates the tree and the public page', async () => {
    const editor = pm.onDevelopersEditor();
    const copy = pm.onDevelopersCopyPage();
    const { title, slug } = await newHiddenPage('title');
    const renamed = `${title} renamed`;
    await editor.setPageTitle(renamed);
    await editor.publish();
    created[created.indexOf(title)] = renamed;
    await expect
      .poll(() => editor.treeItems().then((items) => items.map((i) => i.title)), { timeout: t(10000) })
      .toContain(renamed);
    expect((await copy.httpGet(`/page/${slug}`)).body).toContain(renamed);
    await expect(page).toHaveURL(/\/editor/);
  });
});
