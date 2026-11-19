import { expect, Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import { hideAllModalsAndPopups } from '../../utils';
import { t } from '../../globals';
import {
  CapturedRequest,
  EditorBlock,
  EditorMode,
  EditorTreeItem,
  OverlayField,
  PageSettingField,
  PortalSection,
  RequestCapture,
  RevisionRow,
  developersUrl,
  interceptRequests,
} from './developersCommon';

/** The editor's section buttons (devportal-ui/src/editor/EditorApp.tsx). */
const SECTION_LABEL: Record<PortalSection, string> = {
  docs: 'Docs',
  reference: 'API Reference',
  custom_pages: 'Custom Pages',
};

/** "/" menu entries for each block (devportal-ui/src/editor/canvas/slash.ts). */
const SLASH_LABEL: Record<EditorBlock, string> = {
  Callout: 'Callout',
  Image: 'Image',
  Table: 'Table',
  Embed: 'Embed',
  'HTML Block': 'HTML block',
  'Code Block': 'Code block',
  Heading: 'Heading 2',
  'Bulleted List': 'Bulleted list',
  'Numbered List': 'Numbered list',
  Quote: 'Quote',
  Divider: 'Divider',
};

/** Settings panel labels (devportal-ui/src/editor/panels/SettingsPanel.tsx). */
const SETTING_LABEL: Record<Exclude<PageSettingField, 'pageType' | 'visibility'>, string> = {
  subtitle: 'Subtitle (excerpt)',
  seoTitle: 'Meta title',
  seoDescription: 'Meta description',
  nextPages: 'Description',
  linkUrl: 'Link URL',
  linkOpensInNewTab: 'Open in a new tab',
  slug: 'Slug',
};

const HIDDEN_LABEL = 'Hidden (not in the sidebar, search or llms.txt)';

/** Endpoint overlay labels (devportal-ui/src/editor/panels/EndpointPanel.tsx). */
const OVERLAY_LABEL: Record<Exclude<OverlayField, 'markdown'>, string | RegExp> = {
  sidebarLabel: 'Sidebar label',
  title: 'Title',
  description: /^Description \(Markdown/,
};

/**
 * The staff-only editor at `/editor` (DEV-EDIT; brief §4.6, PLAN §2.11): page tree, View/Edit,
 * the "/" menu, settings, endpoint overlay fields, revisions, draft and publish, upload.
 *
 * Writes: BDD steps and `@pr` tests call interceptEditorWrites() before any save, so nothing
 * reaches the shared database. Only the editor suite's real-write tests (in the *-developers
 * projects) skip it, and they create hidden pages with slugs starting `e2e-<run id>-`.
 */
export class DevelopersEditorPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // ---- Locators ---------------------------------------------------------------------------

  private get tree() {
    return this.page.getByRole('navigation', { name: 'Pages' });
  }

  private get rail() {
    return this.page.getByRole('complementary', { name: 'Page details' });
  }

  private get canvas() {
    return this.page.getByRole('textbox', { name: /^Body of / }).first();
  }

  private treeRow(title: string) {
    return this.tree.getByRole('listitem').filter({
      has: this.page.getByRole('button', {
        name: new RegExp(`^(GET|POST|PUT|PATCH|DELETE)?\\s*${escapeRegExp(title)}(\\s|$)`),
      }),
    });
  }

  private treeTitleButton(title: string) {
    return this.treeRow(title).last().locator('button[aria-current], button:not([aria-label])').first();
  }

  // ---- Entry and access -------------------------------------------------------------------

  /** Navigate to `/editor` or `/editor/<section>/<slug>` (after the test's first entry). */
  async open(section?: PortalSection, slug?: string): Promise<void> {
    const path = section ? `/editor/${section}${slug ? `/${slug}` : ''}` : '/editor';
    await this.page.goto(developersUrl(path), { waitUntil: 'domcontentloaded', timeout: t(30000) });
    await hideAllModalsAndPopups(this.page);
  }

  /**
   * Sign in on the standalone portal (devportal/dev/settings_standalone.py), which has no library host
   * and so no Sefaria login: through the Django admin login of the developers host, then on to `next`.
   * Local runs only; sandboxes use the enAdmin storage state instead. Added by W14.
   */
  async signInWithPassword(username: string, password: string, next = '/editor'): Promise<void> {
    await this.page.goto(developersUrl(`/admin/login/?next=${encodeURIComponent(next)}`), {
      waitUntil: 'domcontentloaded',
      timeout: t(30000),
    });
    await this.page.getByLabel(/^Username/).fill(username);
    await this.page.getByLabel(/^Password/).fill(password);
    await this.page.getByRole('button', { name: 'Log in' }).click();
    await this.page.waitForURL((url) => !url.pathname.startsWith('/admin/login'), { timeout: t(15000) });
  }

  /** What a visitor who opened the editor got: the editor, the login page, or a refusal. */
  async accessOutcome(): Promise<'editor' | 'login' | 'forbidden'> {
    if (/\/login\b/.test(new URL(this.page.url()).pathname) || /\/login\b/.test(this.page.url())) return 'login';
    const forbidden = this.page.getByRole('heading', { level: 1, name: 'Staff only' });
    await expect(this.tree.or(forbidden).first()).toBeVisible({ timeout: t(15000) });
    return (await forbidden.isVisible()) ? 'forbidden' : 'editor';
  }

  /**
   * Answer every write under `/_portal/editor/` (saves, publishes, moves, uploads, restores)
   * locally with a 200 and `responseBody`, and record it. Pass the C3 response shape the UI
   * expects (e.g. the save response with its new revision number) where the default is not enough.
   */
  async interceptEditorWrites(responseBody: string = '{"ok":true}'): Promise<RequestCapture> {
    return interceptRequests(this.page, '**/_portal/editor/**', {
      status: 200,
      contentType: 'application/json',
      body: responseBody,
    });
  }

  /**
   * Answer "Save draft" locally with the C3 EditorDraftSaveResponse the UI needs (the page as the server
   * last sent it and a revision one higher), and record each save; nothing is written. For tests on
   * shared pages (an endpoint's overlay) where interceptEditorWrites' fixed body is not enough. Added by W14.
   */
  async interceptDraftSaves(): Promise<RequestCapture> {
    const capture: { requests: CapturedRequest[] } = { requests: [] };
    await this.page.route(/\/_portal\/editor\/pages\/\d+\/draft$/, async (route) => {
      const request = route.request();
      if (request.method() !== 'PUT') return route.continue();
      capture.requests.push({
        url: request.url(),
        method: request.method(),
        headers: await request.allHeaders(),
        body: request.postData(),
      });
      const current = await this.page.request.get(request.url().replace(/\/draft$/, ''));
      const loaded = (await current.json()) as { page: unknown; revision: { number: number } | null };
      const number = (loaded.revision?.number ?? 0) + 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          contractVersion: 1,
          page: loaded.page,
          revision: { ...(loaded.revision ?? {}), number, isDraft: true, isPublished: false },
        }),
      });
    });
    return capture;
  }

  // ---- Page tree --------------------------------------------------------------------------

  async selectSection(section: PortalSection): Promise<void> {
    const button = this.page.getByRole('navigation', { name: 'Sections' }).getByRole('button', {
      name: SECTION_LABEL[section],
      exact: true,
    });
    if ((await button.getAttribute('aria-pressed')) !== 'true') {
      // Wait for this section's tree to arrive: the previous section's rows stay on screen until it does.
      const api = section === 'custom_pages' ? 'page' : section;
      const loaded = this.page.waitForResponse((r) => r.url().endsWith(`/_portal/editor/tree/${api}`), {
        timeout: t(15000),
      });
      await button.click();
      await loaded;
    }
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: t(5000) });
    // The tree of the section just chosen (custom pages offer "+ New page", the others "+ New category").
    const create = section === 'custom_pages' ? '+ New page' : '+ New category';
    await expect(this.tree.getByRole('button', { name: create, exact: true })).toBeVisible({ timeout: t(15000) });
    await expect(this.tree.getByRole('listitem').first()).toBeVisible({ timeout: t(15000) });
  }

  /** Rows of the current section's tree, in order. */
  async treeItems(): Promise<EditorTreeItem[]> {
    const rows = this.tree.getByRole('listitem');
    await expect(rows.first()).toBeVisible({ timeout: t(15000) });
    return rows.evaluateAll((items) =>
      items.map((li) => {
        const kind = li.getAttribute('data-kind') ?? 'page';
        const title = li.querySelector('button[aria-current], button:not([aria-label])');
        const spans = Array.from(title?.querySelectorAll('span') ?? []).map((s) => (s.textContent ?? '').trim());
        const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
        const name = spans.find((s) => s && !methods.includes(s)) ?? '';
        // PageTree.tsx indents each level by INDENT = 20px.
        const indent = parseFloat((li as HTMLElement).style.paddingLeft || '0');
        return {
          title: name,
          slug: '',
          depth: Math.round(indent / 20),
          kind: (spans.some((s) => methods.includes(s)) || kind === 'endpoint'
            ? 'endpoint'
            : kind === 'category' || kind === 'tag_group'
              ? 'group'
              : kind === 'link'
                ? 'link'
                : kind === 'endpoint'
                  ? 'endpoint'
                  : 'page') as 'page' | 'link' | 'endpoint' | 'group',
          hidden: spans.includes('Hidden'),
        };
      })
    );
  }

  async selectPage(title: string): Promise<void> {
    const button = this.treeTitleButton(title);
    await button.scrollIntoViewIfNeeded({ timeout: t(10000) });
    await button.click();
    await expect(button).toHaveAttribute('aria-current', 'page', { timeout: t(10000) });
    await expect(this.rail.getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: t(10000) });
  }

  /** Drag a row before or after another, or into it as a child. */
  async movePage(title: string, target: { before: string } | { after: string } | { into: string }): Promise<void> {
    const handle = this.tree.getByRole('button', { name: `Move ${title}`, exact: true });
    const other = 'before' in target ? target.before : 'after' in target ? target.after : target.into;
    if (!('into' in target)) {
      // dnd-kit's keyboard sensor: Space picks the row up, arrows move it one row at a time, Space drops it.
      const titles = (await this.treeItems()).map((item) => item.title);
      const from = titles.indexOf(title);
      let to = titles.indexOf(other);
      if ('after' in target && to < from) to += 1;
      if ('before' in target && to > from) to -= 1;
      await handle.focus();
      await this.page.keyboard.press('Space');
      for (let i = 0; i < Math.abs(to - from); i += 1)
        await this.page.keyboard.press(to < from ? 'ArrowUp' : 'ArrowDown');
      await this.page.keyboard.press('Space');
      return;
    }
    const targetRow = this.treeRow(other).last();
    await handle.scrollIntoViewIfNeeded();
    const from = await handle.boundingBox();
    const to = await targetRow.boundingBox();
    if (!from || !to) throw new Error('tree rows are not rendered');
    const x = from.x + from.width / 2;
    const y = 'before' in target ? to.y + 2 : to.y + to.height - 2;
    const dx = 'into' in target ? 40 : 0;
    await this.page.mouse.move(x, from.y + from.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(x, from.y + from.height / 2 + 8, { steps: 4 });
    await this.page.mouse.move(x + dx, y, { steps: 15 });
    await this.page.mouse.up();
  }

  private async createVia(button: ReturnType<Page['getByRole']>, title: string): Promise<void> {
    this.page.once('dialog', (dialog) => dialog.accept(title));
    await button.click();
    await expect(this.page.getByRole('status').filter({ hasText: `Created “${title}”` })).toBeVisible({
      timeout: t(15000),
    });
  }

  /** "+ New" at the section root; returns once the new page is open for editing. */
  async newPage(title: string): Promise<void> {
    const button = this.tree.getByRole('button', { name: /^\+ New (page|category)$/ });
    await this.createVia(button, title);
  }

  /** "+ add child" on a row. */
  async addChild(parentTitle: string, title: string): Promise<void> {
    const button = this.tree.getByRole('button', { name: `Add a page under ${parentTitle}`, exact: true });
    await this.createVia(button, title);
  }

  // ---- Modes ------------------------------------------------------------------------------

  async setMode(mode: EditorMode): Promise<void> {
    const button = this.page.getByRole('group', { name: 'Mode' }).getByRole('button', {
      name: mode === 'edit' ? 'Edit' : 'View',
      exact: true,
    });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: t(5000) });
  }

  async currentMode(): Promise<EditorMode> {
    const edit = this.page.getByRole('group', { name: 'Mode' }).getByRole('button', { name: 'Edit', exact: true });
    return (await edit.getAttribute('aria-pressed')) === 'true' ? 'edit' : 'view';
  }

  /** View mode: the rendered draft's article text. */
  async previewText(): Promise<string> {
    const preview = this.page.getByRole('article', { name: 'Preview of the draft' });
    await expect(preview.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: t(15000) });
    return (await preview.innerText()).trim();
  }

  // ---- Editing ----------------------------------------------------------------------------

  /** The editable title of the open page. */
  async setPageTitle(title: string): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Title', exact: true }).first().fill(title);
  }

  /** Replace the text of the first paragraph containing `oldText`. */
  async replaceParagraphText(oldText: string, newText: string): Promise<void> {
    const paragraph = this.canvas.getByRole('paragraph').filter({ hasText: oldText }).first();
    await paragraph.click();
    await this.page.keyboard.press('End');
    await this.page.keyboard.press('Shift+Home');
    await this.page.keyboard.type(newText);
  }

  /** Focus the canvas and put the caret at the end of the document (a click could land in a node view's form). */
  private async focusCanvasEnd(): Promise<void> {
    await expect(this.canvas).toBeVisible({ timeout: t(15000) });
    await this.canvas.focus();
    await this.page.keyboard.press('Control+End');
  }

  /**
   * A new empty paragraph at the end of the document, at the top level: when the document ends in a list
   * or a quote, Enter on the new empty item lifts it out (the standard editing behavior).
   */
  private async newTopLevelLine(): Promise<void> {
    await this.focusCanvasEnd();
    await this.page.keyboard.press('Enter');
    for (let i = 0; i < 3; i += 1) {
      const nested = await this.page.evaluate(() => {
        const node = window.getSelection()?.anchorNode;
        const el = node instanceof Element ? node : node?.parentElement;
        return !!el?.closest('li, blockquote, td, th');
      });
      if (!nested) return;
      await this.page.keyboard.press('Enter');
    }
  }

  /** Put the cursor at the end of the document and type a new paragraph. */
  async appendParagraph(text: string): Promise<void> {
    await this.newTopLevelLine();
    await this.page.keyboard.type(text);
  }

  /** Type "/" on an empty line; returns the menu's entries. */
  async openSlashMenu(): Promise<string[]> {
    await this.newTopLevelLine();
    await this.page.keyboard.type('/');
    const menu = this.page.getByRole('listbox', { name: 'Insert a block' });
    await expect(menu).toBeVisible({ timeout: t(5000) });
    return (await menu.getByRole('option').allInnerTexts()).map((text) => text.split('\n')[0].trim());
  }

  /** Insert a block through the "/" menu and fill its own form (icon, theme, language, URL, …). */
  async insertBlock(block: EditorBlock, fields?: Record<string, string>): Promise<void> {
    const menu = this.page.getByRole('listbox', { name: 'Insert a block' });
    if (!(await menu.isVisible())) await this.openSlashMenu();
    // Narrow the menu by typing the label's first word (a space ends the query), move the highlight to the
    // entry with the arrow keys and take it with Enter, as a keyboard user does; a click would move focus
    // out of the canvas first.
    const label = SLASH_LABEL[block];
    await this.page.keyboard.type(label.split(' ')[0].toLowerCase());
    const selected = menu.locator('[role="option"][aria-selected="true"]');
    const wanted = new RegExp(`^${escapeRegExp(label)}`);
    for (let i = 0; i < 12 && !wanted.test((await selected.textContent()) ?? ''); i += 1) {
      await this.page.keyboard.press('ArrowDown');
    }
    await expect(selected).toHaveText(wanted, { timeout: t(5000) });
    await this.page.keyboard.press('Enter');
    await expect(menu).toBeHidden({ timeout: t(5000) });
    for (const [label, value] of Object.entries(fields ?? {})) {
      const field = this.canvas.getByLabel(label, { exact: true }).last();
      const tag = await field.evaluate((el) => el.tagName);
      if (tag === 'SELECT') await field.selectOption(value);
      else await field.fill(value);
    }
  }

  /** Top-level node types of the document, in order (e.g. "paragraph", "callout", "rawMarkdown"). */
  async documentBlocks(): Promise<string[]> {
    await expect(this.canvas).toBeVisible({ timeout: t(15000) });
    return this.canvas.evaluate((root) =>
      Array.from(root.children).map((el) => {
        const cls = el.className.toString();
        // TipTap React node views: <div class="react-renderer node-dpImage">.
        const view = cls.match(/\bnode-(\w+)/)?.[1];
        if (view) return view.replace(/^dp([A-Z])/, (_, c: string) => c.toLowerCase());
        if (cls.includes('dp-table')) return 'table';
        const inner = el.firstElementChild?.className.toString() ?? '';
        if (cls.includes('dp-callout') || inner.includes('dp-callout')) return 'callout';
        if (cls.includes('dp-codetabs') || el.querySelector(':scope pre')) return 'codeBlock';
        if (cls.includes('dp-image')) return 'image';
        if (cls.includes('dp-embed')) return 'embed';
        if (cls.includes('dp-htmlblock')) return 'htmlBlock';
        if (cls.includes('dp-editor-raw')) return 'rawMarkdown';
        if (el.querySelector(':scope table') || el.tagName === 'TABLE') return 'table';
        const byTag: Record<string, string> = {
          P: 'paragraph',
          H1: 'heading',
          H2: 'heading',
          H3: 'heading',
          H4: 'heading',
          UL: 'bulletList',
          OL: 'orderedList',
          BLOCKQUOTE: 'blockquote',
          PRE: 'codeBlock',
          HR: 'horizontalRule',
        };
        return byTag[el.tagName] ?? (el.getAttribute('data-type') || el.tagName.toLowerCase());
      })
    );
  }

  /** Upload an image file through the image block; returns the stored URL. */
  async uploadImage(filePath: string): Promise<string> {
    // The image block still waiting for its image (the one just inserted): it shows no img yet.
    const blocks = this.canvas.locator('xpath=.//*[contains(concat(" ", normalize-space(@class), " "), " dp-image ")]');
    const index = await blocks.evaluateAll((list) => list.map((b) => !!b.querySelector('img')).lastIndexOf(false));
    const block = blocks.nth(index);
    const input = block.getByLabel('Upload', { exact: true });
    await input.setInputFiles(filePath);
    const img = block.locator('img').first();
    await expect(img).toHaveAttribute('src', /.+/, { timeout: t(20000) });
    return (await img.getAttribute('src')) ?? '';
  }

  // ---- Settings ---------------------------------------------------------------------------

  async openSettings(): Promise<void> {
    const history = this.page.getByRole('button', { name: 'History', exact: true });
    if ((await history.getAttribute('aria-pressed')) === 'true') await history.click();
    await expect(this.rail.getByRole('heading', { name: 'Page settings' })).toBeVisible({ timeout: t(10000) });
  }

  async setSetting(field: PageSettingField, value: string | boolean): Promise<void> {
    if (field === 'pageType') throw new Error('The page type is shown read-only in the editor');
    if (field === 'visibility') {
      const hidden = value === true || value === 'hidden';
      await this.rail.getByRole('checkbox', { name: HIDDEN_LABEL }).setChecked(hidden);
      return;
    }
    const control = this.rail.getByLabel(SETTING_LABEL[field], { exact: true }).first();
    if (typeof value === 'boolean') {
      await control.setChecked(value);
      return;
    }
    await control.fill(value);
    if (field === 'slug') {
      await this.rail.getByRole('button', { name: 'Change slug' }).click();
      await expect(this.rail.getByRole('status').filter({ hasText: /\S/ })).toBeVisible({ timeout: t(10000) });
    }
  }

  async settingValue(field: PageSettingField): Promise<string | boolean> {
    if (field === 'pageType') {
      return (
        (await this.rail
          .getByText(/^Type:/)
          .locator('strong')
          .textContent()) ?? ''
      ).trim();
    }
    if (field === 'visibility') {
      return (await this.rail.getByRole('checkbox', { name: HIDDEN_LABEL }).isChecked()) ? 'hidden' : 'public';
    }
    const control = this.rail.getByLabel(SETTING_LABEL[field], { exact: true }).first();
    if ((await control.getAttribute('type')) === 'checkbox') return control.isChecked();
    return control.inputValue();
  }

  /** Endpoint pages: edit an overlay field. */
  async setOverlayField(field: OverlayField, value: string): Promise<void> {
    if (field === 'markdown') {
      await this.focusCanvasEnd();
      await this.page.keyboard.type(value);
      return;
    }
    await this.rail.getByLabel(OVERLAY_LABEL[field]).first().fill(value);
  }

  /** Endpoint pages: labels of the spec-derived fields shown read-only. */
  async readOnlySpecFields(): Promise<string[]> {
    const panel = this.rail.getByRole('region', { name: 'API endpoint' });
    await expect(panel).toBeVisible({ timeout: t(10000) });
    return panel.locator('dt').allInnerTexts();
  }

  // ---- Revisions, draft and publish -------------------------------------------------------

  /** Open the revision history; newest first. */
  async openRevisionHistory(): Promise<RevisionRow[]> {
    const history = this.page.getByRole('button', { name: 'History', exact: true });
    // Reopen it when it is already open, so the list is fetched again (after a save or a restore).
    if ((await history.getAttribute('aria-pressed')) === 'true') {
      await history.click();
      await expect(history).toHaveAttribute('aria-pressed', 'false', { timeout: t(5000) });
    }
    await expect(async () => {
      if ((await history.getAttribute('aria-pressed')) !== 'true') await history.click();
      await expect(history).toHaveAttribute('aria-pressed', 'true', { timeout: t(2000) });
    }).toPass({ timeout: t(10000) });
    const panel = this.rail.getByRole('region', { name: 'Revision history' });
    const rows = panel.getByRole('listitem');
    await expect(rows.first()).toBeVisible({ timeout: t(10000) });
    return rows.evaluateAll((items) =>
      items.map((li) => {
        const text = (li as HTMLElement).innerText;
        const by = text.match(/ by (.+?) ·/);
        return {
          number: Number(text.match(/Revision (\d+)/)?.[1] ?? NaN),
          author: by ? by[1].trim() : '',
          when: (li.querySelector('time')?.textContent ?? '').trim(),
          published: /\bPublished\b/.test(text),
        };
      })
    );
  }

  /** Restore revision `number` (creates a new draft). */
  async restoreRevision(number: number): Promise<void> {
    await this.rail.getByRole('button', { name: `Restore revision ${number} as a new draft` }).click();
    await expect(this.page.getByRole('status').filter({ hasText: `Revision ${number} restored` })).toBeVisible({
      timeout: t(15000),
    });
  }

  async saveDraft(): Promise<void> {
    await this.page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(
      this.page
        .getByRole('status')
        .filter({ hasText: /^Draft saved/ })
        .or(this.page.getByRole('alert'))
        .first()
    ).toBeVisible({ timeout: t(15000) });
  }

  async publish(): Promise<void> {
    await this.page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(
      this.page
        .getByRole('status')
        .filter({ hasText: /^Published revision/ })
        .or(this.page.getByRole('alert'))
        .first()
    ).toBeVisible({ timeout: t(20000) });
  }

  /** The save-state text ("Draft saved", "Published", "Unsaved changes", …). */
  async saveStatus(): Promise<string> {
    const message = this.page.getByRole('status').or(this.page.getByRole('alert')).first();
    await expect(message).toBeVisible({ timeout: t(10000) });
    return (await message.innerText()).replace(/\s*Dismiss$/, '').trim();
  }

  /** The message shown after a 409 (someone else saved first), or null. */
  async conflictMessage(): Promise<string | null> {
    const alert = this.page
      .getByRole('alert')
      .filter({ has: this.page.getByRole('button', { name: /^Load their version/ }) });
    if ((await alert.count()) === 0) return null;
    return (await alert.locator('p').first().innerText()).trim();
  }

  /** Delete the open page (soft delete); used by real-write tests in afterEach. */
  async deletePage(title: string): Promise<void> {
    const button = this.tree.getByRole('button', { name: `Delete ${title}`, exact: true });
    if ((await button.count()) === 0) return;
    this.page.once('dialog', (dialog) => dialog.accept());
    await button.click();
    await expect(button).toHaveCount(0, { timeout: t(15000) });
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
