import { Page } from '@playwright/test';
import { HelperBase } from '../helperBase';
import { hideAllModalsAndPopups } from '../../utils';
import { t } from '../../globals';
import {
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
  notImplemented,
} from './developersCommon';

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

  // ---- Entry and access -------------------------------------------------------------------

  /** Navigate to `/editor` or `/editor/<section>/<slug>` (after the test's first entry). */
  async open(section?: PortalSection, slug?: string): Promise<void> {
    const path = section ? `/editor/${section}${slug ? `/${slug}` : ''}` : '/editor';
    await this.page.goto(developersUrl(path), { waitUntil: 'domcontentloaded', timeout: t(30000) });
    await hideAllModalsAndPopups(this.page);
  }

  /** What a visitor who opened the editor got: the editor, the login page, or a refusal. */
  async accessOutcome(): Promise<'editor' | 'login' | 'forbidden'> {
    return notImplemented('DevelopersEditorPage.accessOutcome');
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

  // ---- Page tree --------------------------------------------------------------------------

  async selectSection(section: PortalSection): Promise<void> {
    return notImplemented('DevelopersEditorPage.selectSection');
  }

  /** Rows of the current section's tree, in order. */
  async treeItems(): Promise<EditorTreeItem[]> {
    return notImplemented('DevelopersEditorPage.treeItems');
  }

  async selectPage(title: string): Promise<void> {
    return notImplemented('DevelopersEditorPage.selectPage');
  }

  /** Drag a row before or after another, or into it as a child. */
  async movePage(title: string, target: { before: string } | { after: string } | { into: string }): Promise<void> {
    return notImplemented('DevelopersEditorPage.movePage');
  }

  /** "+ New" at the section root; returns once the new page is open for editing. */
  async newPage(title: string): Promise<void> {
    return notImplemented('DevelopersEditorPage.newPage');
  }

  /** "+ add child" on a row. */
  async addChild(parentTitle: string, title: string): Promise<void> {
    return notImplemented('DevelopersEditorPage.addChild');
  }

  // ---- View / Edit ------------------------------------------------------------------------

  async setMode(mode: EditorMode): Promise<void> {
    return notImplemented('DevelopersEditorPage.setMode');
  }

  async currentMode(): Promise<EditorMode> {
    return notImplemented('DevelopersEditorPage.currentMode');
  }

  /** View mode: the rendered draft's article text. */
  async previewText(): Promise<string> {
    return notImplemented('DevelopersEditorPage.previewText');
  }

  // ---- Content ----------------------------------------------------------------------------

  /** The editable title of the open page. */
  async setPageTitle(title: string): Promise<void> {
    return notImplemented('DevelopersEditorPage.setPageTitle');
  }

  /** Replace the text of the first paragraph containing `oldText`. */
  async replaceParagraphText(oldText: string, newText: string): Promise<void> {
    return notImplemented('DevelopersEditorPage.replaceParagraphText');
  }

  /** Put the cursor at the end of the document and type a new paragraph. */
  async appendParagraph(text: string): Promise<void> {
    return notImplemented('DevelopersEditorPage.appendParagraph');
  }

  /** Type "/" on an empty line; returns the menu's entries. */
  async openSlashMenu(): Promise<string[]> {
    return notImplemented('DevelopersEditorPage.openSlashMenu');
  }

  /** Insert a block through the "/" menu and fill its own form (icon, theme, language, URL, …). */
  async insertBlock(block: EditorBlock, fields?: Record<string, string>): Promise<void> {
    return notImplemented('DevelopersEditorPage.insertBlock');
  }

  /** Top-level node types of the document, in order (e.g. "paragraph", "callout", "rawMarkdown"). */
  async documentBlocks(): Promise<string[]> {
    return notImplemented('DevelopersEditorPage.documentBlocks');
  }

  /** Upload an image file through the image block; returns the stored URL. */
  async uploadImage(filePath: string): Promise<string> {
    return notImplemented('DevelopersEditorPage.uploadImage');
  }

  // ---- Settings and the endpoint overlay --------------------------------------------------

  async openSettings(): Promise<void> {
    return notImplemented('DevelopersEditorPage.openSettings');
  }

  async setSetting(field: PageSettingField, value: string | boolean): Promise<void> {
    return notImplemented('DevelopersEditorPage.setSetting');
  }

  async settingValue(field: PageSettingField): Promise<string | boolean> {
    return notImplemented('DevelopersEditorPage.settingValue');
  }

  /** Endpoint pages: edit an overlay field. */
  async setOverlayField(field: OverlayField, value: string): Promise<void> {
    return notImplemented('DevelopersEditorPage.setOverlayField');
  }

  /** Endpoint pages: labels of the spec-derived fields shown read-only. */
  async readOnlySpecFields(): Promise<string[]> {
    return notImplemented('DevelopersEditorPage.readOnlySpecFields');
  }

  // ---- Revisions, draft and publish -------------------------------------------------------

  /** Open the revision history; newest first. */
  async openRevisionHistory(): Promise<RevisionRow[]> {
    return notImplemented('DevelopersEditorPage.openRevisionHistory');
  }

  /** Restore revision `number` (creates a new draft). */
  async restoreRevision(number: number): Promise<void> {
    return notImplemented('DevelopersEditorPage.restoreRevision');
  }

  async saveDraft(): Promise<void> {
    return notImplemented('DevelopersEditorPage.saveDraft');
  }

  async publish(): Promise<void> {
    return notImplemented('DevelopersEditorPage.publish');
  }

  /** The save-state text ("Draft saved", "Published", "Unsaved changes", …). */
  async saveStatus(): Promise<string> {
    return notImplemented('DevelopersEditorPage.saveStatus');
  }

  /** The message shown after a 409 (someone else saved first), or null. */
  async conflictMessage(): Promise<string | null> {
    return notImplemented('DevelopersEditorPage.conflictMessage');
  }

  /** Delete the open page (soft delete); used by real-write tests in afterEach. */
  async deletePage(title: string): Promise<void> {
    return notImplemented('DevelopersEditorPage.deletePage');
  }
}
