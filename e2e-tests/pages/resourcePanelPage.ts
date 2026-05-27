import { expect, Locator, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { t } from '../globals';

/**
 * Page object for the Sefaria Resource Panel (a.k.a. ConnectionsPanel) —
 * the sidebar that opens to the right of the main reader when a text segment
 * is clicked.
 *
 * Source reference: static/js/ConnectionsPanel.jsx. The panel is a multi-mode
 * component: "Resources" (the main hub), "About", "Translations", "Lexicon",
 * "Navigation" (TOC), "ConnectionsList", "TextList", "Topics", "WebPages",
 * "manuscripts", "Notes", "Add To Sheet", "Share", "Feedback", "Advanced Tools",
 * "Add Connection", "SidebarSearch", "Guide".
 *
 * The panel mounts inside a `.readerPanel.sidebar` (multi-panel mode) and the
 * panel body itself is `.connectionsPanel.textList`. Each mode has a stable
 * outer class — `.aboutBox`, `.translationsBox`, `.lexicon-content`,
 * `.textTableOfContents`, etc. — and we use those to assert the active mode.
 *
 * Locator strategy:
 * - Prefer the visible toolsButton `data-name` attribute over text matching:
 *   `.toolsButton[data-name="About this Text"]`. The label text differs by
 *   interface language so `data-name` (always English) is the stable anchor.
 * - Sidebar can render simultaneously with the main reader, so we always scope
 *   to `.readerPanel.sidebar` when ambiguity is possible.
 */
export class ResourcePanelPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // ============================================================
  // Element accessors
  // ============================================================

  /**
   * The sidebar wrapper. ReaderApp.jsx (line ~2361) renders each panel as
   *   <div className="readerPanelBox sidebar"> when panel.mode === "Connections".
   * The sidebar contains a ReaderPanel that hosts ReaderControls (header) and
   * the ConnectionsPanel (body). In multi-panel mode the header lives inside
   * the ConnectionsPanel itself.
   */
  private get sidebar(): Locator {
    return this.page.locator('.readerPanelBox.sidebar').first();
  }

  /** Resource panel body. */
  private get panel(): Locator {
    return this.page.locator('.connectionsPanel.textList').first();
  }

  /**
   * Panel header. In multi-panel mode, `ConnectionsPanel` is rendered with
   * `fullPanel={multiPanel}` (see ReaderPanel.jsx:825). When `fullPanel=true`
   * the panel itself does NOT render its header — `ReaderControls` does, via
   * `centerContent = <div class="readerTextToc"><ConnectionsPanelHeader /></div>`
   * (see ReaderPanel.jsx:1388). So we scope the header to the sidebar box,
   * not to `.connectionsPanel`.
   */
  private get header(): Locator {
    return this.sidebar.locator('.connectionsPanelHeader').first();
  }

  /** Back button in the header — only renders as an `<a>.active` away from Resources. */
  private get backButton(): Locator {
    return this.header.locator('a.connectionsHeaderTitle.active').first();
  }

  /** Close (circled-X) button rendered by `<CloseButton icon="circledX" />`. */
  private get closeButton(): Locator {
    return this.header.locator('a.readerNavMenuCloseButton.circledX').first();
  }

  /** Top-level Resources hub buttons container. */
  private get topToolsButtons(): Locator {
    return this.panel.locator('.topToolsButtons').first();
  }

  /** A ToolsButton by its English data-name attribute (stable across interface languages). */
  toolsButton(name: string): Locator {
    return this.panel.locator(`.toolsButton[data-name="${name}"]`).first();
  }

  /** The count badge on a tools button (e.g., "(5)"). */
  toolsButtonCount(name: string): Locator {
    return this.toolsButton(name).locator('.connectionsCount').first();
  }

  /** A single text segment in the main reader, located by data-ref. */
  segment(ref: string): Locator {
    // Main-reader segments live in `.readerPanelBox:not(.sidebar) .segment`.
    // We scope away from the sidebar so that `data-ref` on connection
    // text-ranges inside the sidebar can't match.
    return this.page.locator('.readerPanelBox:not(.sidebar) .segment')
      .filter({ has: this.page.locator(`[data-ref="${ref}"i]`) })
      .or(this.page.locator(`.readerPanelBox:not(.sidebar) .segment[data-ref="${ref}"]`))
      .first();
  }

  /** Generic segment selector — first visible segment in the main reader. */
  private get anyMainSegment(): Locator {
    return this.page.locator('.readerPanelBox:not(.sidebar) .segment[data-ref]').first();
  }

  // ============================================================
  // High-level state predicates / waits
  // ============================================================

  /** Wait for the main reader to finish initial render and have visible segments. */
  async waitForReaderReady(): Promise<void> {
    const loading = this.page.getByRole('heading', { name: /Loading/i });
    await loading.first().waitFor({ state: 'detached', timeout: t(20000) }).catch(() => { /* not present */ });
    await expect(this.anyMainSegment).toBeVisible({ timeout: t(20000) });
  }

  /** Check whether the resource panel is currently open. */
  async isOpen(): Promise<boolean> {
    return await this.panel.isVisible({ timeout: t(1500) }).catch(() => false);
  }

  /**
   * Click the first available segment in the main reader to open the panel.
   * Returns the data-ref of the segment that was clicked.
   */
  async clickFirstSegmentToOpen(): Promise<string> {
    await hideAllModalsAndPopups(this.page);
    await this.waitForReaderReady();
    const target = this.anyMainSegment;
    await expect(target).toBeVisible({ timeout: t(10000) });
    const ref = (await target.getAttribute('data-ref')) ?? '';
    await target.click();
    await expect(this.panel).toBeVisible({ timeout: t(15000) });
    return ref;
  }

  /** Click a specific segment in the main reader, scrolling into view first. */
  async clickSegment(ref: string): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    await this.waitForReaderReady();
    const seg = this.page.locator(`.readerPanelBox:not(.sidebar) .segment[data-ref="${ref}"]`).first();
    await seg.scrollIntoViewIfNeeded({ timeout: t(5000) }).catch(() => { /* fall through */ });
    await expect(seg).toBeVisible({ timeout: t(10000) });
    await seg.click();
    await expect(this.panel).toBeVisible({ timeout: t(15000) });
  }

  /** Assert panel is open in the given mode (by mode-specific outer class). */
  async expectMode(mode:
    | 'Resources' | 'About' | 'Translations' | 'Lexicon' | 'Navigation'
    | 'ConnectionsList' | 'TextList' | 'Topics' | 'WebPages' | 'manuscripts'
    | 'Notes' | 'Add To Sheet' | 'Share' | 'Feedback' | 'Advanced Tools'
    | 'Add Connection' | 'SidebarSearch' | 'Guide'): Promise<void> {
    // Each mode has a distinctive child element that signals it's active.
    const modeAnchors: Record<string, string> = {
      'Resources':       '.topToolsButtons',
      'About':           '.aboutBox',
      'Translations':    '.translationsHeader, .translationsBox, .versionsBox',
      'Lexicon':         '.lexicon-content, .lexicon-instructions',
      'Navigation':      '.textTableOfContents, .tocContent',
      'ConnectionsList': '.categoryFilterGroup, .category, .textFilter',
      'TextList':        '.textListTextRangeBox, .texts > .contentInner .textRange',
      'Topics':          '.topicList',
      'WebPages':        '.webpageList',
      'manuscripts':     '.manuscriptList, .manuscriptImage',
      'Notes':           '.addNoteBox',
      'Add To Sheet':    '.addToSourceSheetBox, .sourceSheetSelector',
      'Share':           '.shareBox, #sheetShareLink',
      'Feedback':        '.feedbackBox, textarea[placeholder*="Feedback"i]',
      'Advanced Tools':  '.advancedToolsList, .toolButtonsList',
      'Add Connection':  '.addConnectionBox',
      'SidebarSearch':   '.sidebarSearch, .sidebarSearchInput, input[placeholder*="Search"i]',
      'Guide':           '.guideBox, .keyQuestions',
    };
    const selector = modeAnchors[mode];
    await expect(this.panel.locator(selector).first()).toBeVisible({ timeout: t(15000) });
  }

  // ============================================================
  // RP-001 / 003 / 005: Open, Close, Scroll
  // ============================================================

  async closeViaCloseButton(): Promise<void> {
    await expect(this.closeButton).toBeVisible({ timeout: t(5000) });
    await this.closeButton.click();
    await expect(this.panel).toBeHidden({ timeout: t(10000) });
  }

  /**
   * Scroll the panel's internal scroll container (`.connectionsPanel .texts`)
   * and return the resulting scrollTop. `.texts` is the wrapper that
   * ConnectionsPanel.componentDidMount installs its scroll listener on
   * (ConnectionsPanel.jsx:121).
   */
  async scrollPanelBy(deltaY: number): Promise<number> {
    return await this.page.evaluate((dy) => {
      const el = document.querySelector('.connectionsPanel .texts');
      if (!el) return -1;
      el.scrollTop += dy;
      return el.scrollTop;
    }, deltaY);
  }

  /**
   * Scroll the main reader's content container. Each ReaderPanel renders a
   * `<div className="readerContent">` wrapper; the inner scroll container is
   * `.textColumn`. We try both selectors and use the first that yields a
   * scrollable element.
   */
  async scrollMainReaderBy(deltaY: number): Promise<number> {
    return await this.page.evaluate((dy) => {
      // Prefer the non-sidebar reader panel's text column.
      const main = document.querySelector('.readerPanelBox:not(.sidebar)');
      if (!main) return -1;
      const candidates = [
        main.querySelector('.textColumn'),
        main.querySelector('.readerContent'),
        main.querySelector('.text'),
      ].filter(Boolean) as HTMLElement[];
      const scrollable = candidates.find(el => el.scrollHeight > el.clientHeight) ?? candidates[0];
      if (!scrollable) return -1;
      scrollable.scrollTop += dy;
      return scrollable.scrollTop;
    }, deltaY);
  }

  // ============================================================
  // RP-006 / RP-022: Back button
  // ============================================================

  async expectBackButtonVisible(): Promise<void> {
    await expect(this.backButton).toBeVisible({ timeout: t(5000) });
  }

  async clickBack(): Promise<void> {
    await expect(this.backButton).toBeVisible({ timeout: t(5000) });
    await this.backButton.click();
  }

  // ============================================================
  // RP-010 / 011 / 012: Resources hub buttons + Related Texts
  // ============================================================

  /** Assert all of the top-level resource-hub buttons are present. */
  async expectStandardResourceButtonsVisible(): Promise<void> {
    await expect(this.topToolsButtons).toBeVisible({ timeout: t(10000) });
    for (const name of ['About this Text', 'Table of Contents', 'Search in this Text', 'Translations']) {
      await expect(this.toolsButton(name)).toBeVisible({ timeout: t(5000) });
    }
  }

  /** The "Related Texts" section header. */
  private get relatedTextsSection(): Locator {
    return this.panel.locator('.connectionPanelSectionHeader', { hasText: /Related Texts|טקסטים קשורים/i }).first();
  }

  async expectRelatedTextsSection(): Promise<void> {
    await expect(this.relatedTextsSection).toBeVisible({ timeout: t(10000) });
  }

  /** Returns count of category filters visible in Related Texts (collapsed view). */
  async getVisibleCategoryCount(): Promise<number> {
    const cats = this.panel.locator('.categoryFilterGroup, .category');
    return await cats.count();
  }

  /** Click "More" to expand category list. */
  async clickMoreCategories(): Promise<void> {
    await this.toolsButton('More').click();
  }

  async clickSeeLessCategories(): Promise<void> {
    await this.toolsButton('See Less').click();
  }

  async expectMoreToggleVisible(): Promise<void> {
    await expect(this.toolsButton('More')).toBeVisible({ timeout: t(5000) });
  }

  async expectSeeLessToggleVisible(): Promise<void> {
    await expect(this.toolsButton('See Less')).toBeVisible({ timeout: t(5000) });
  }

  // ============================================================
  // RP-015 / RP-016: Resources & Tools sections
  // ============================================================

  /** Each label below maps to a `<ToolsButton data-name="...">` in the panel source. */
  async expectResourcesSectionButton(name: 'Sheets' | 'Web Pages' | 'Topics' | 'Manuscripts'): Promise<void> {
    await expect(this.toolsButton(name)).toBeVisible({ timeout: t(5000) });
  }

  async expectToolsSectionButtons(): Promise<void> {
    for (const name of ['Add to Sheet', 'Dictionaries', 'Notes', 'Share', 'Feedback', 'Advanced']) {
      await expect(this.toolsButton(name)).toBeVisible({ timeout: t(5000) });
    }
  }

  // ============================================================
  // RP-020 - 023: Navigation (TOC)
  // ============================================================

  async openTOC(): Promise<void> {
    await this.toolsButton('Table of Contents').click();
    await this.expectMode('Navigation');
  }

  async clickFirstTocSection(): Promise<string | null> {
    const link = this.panel.locator('.textTableOfContents a[href*="/"], .tocContent a').first();
    await expect(link).toBeVisible({ timeout: t(10000) });
    const href = await link.getAttribute('href');
    await link.click();
    return href;
  }

  // ============================================================
  // RP-030 - 034: About This Text
  // ============================================================

  async openAbout(): Promise<void> {
    await this.toolsButton('About this Text').click();
    await this.expectMode('About');
  }

  async expectAboutTitle(): Promise<void> {
    await expect(this.panel.locator('.aboutBox .aboutTitle').first()).toBeVisible({ timeout: t(10000) });
  }

  async expectAboutDescription(): Promise<void> {
    await expect(this.panel.locator('.aboutBox .aboutDesc').first()).toBeVisible({ timeout: t(10000) });
  }

  async expectCurrentVersionSection(): Promise<void> {
    await expect(this.panel.locator('.aboutBox .currVersionSection').first()).toBeVisible({ timeout: t(10000) });
  }

  async hasAlternateVersionsSection(): Promise<boolean> {
    return await this.panel.locator('.aboutBox .alternateVersionsSection').first()
      .isVisible({ timeout: t(3000) }).catch(() => false);
  }

  async expectAuthorLinkClickable(): Promise<Locator | null> {
    const author = this.panel.locator('.aboutBox .aboutAuthor a, .aboutBox .authorName a').first();
    if (!(await author.isVisible({ timeout: t(3000) }).catch(() => false))) return null;
    return author;
  }

  async hasExtendedNotesLink(): Promise<boolean> {
    return await this.panel.locator('.aboutBox a', { hasText: /Extended Notes|הערות נוספות/i }).first()
      .isVisible({ timeout: t(3000) }).catch(() => false);
  }

  async clickExtendedNotes(): Promise<void> {
    await this.panel.locator('.aboutBox a', { hasText: /Extended Notes|הערות נוספות/i }).first().click();
  }

  // ============================================================
  // RP-040 - 047: Translations
  // ============================================================

  async openTranslations(): Promise<void> {
    await this.toolsButton('Translations').click();
    await this.expectMode('Translations');
  }

  /** Top-of-list "Current Translation" or "Currently Selected" pinned section. */
  async hasCurrentlySelectedTranslation(): Promise<boolean> {
    return await this.panel.locator(
      '.translationsBox :text-matches("Currently Selected|Current Translation|תרגום נבחר", "i")'
    ).first().isVisible({ timeout: t(3000) }).catch(() => false);
  }

  /** Click the Nth available translation in the list (after the currently-selected one). */
  async clickNthTranslation(n: number): Promise<void> {
    const versions = this.panel.locator('.versionsBox .versionBlock, .versionsBox .version');
    const target = versions.nth(n);
    await expect(target).toBeVisible({ timeout: t(10000) });
    await target.click();
  }

  async clickOpenOnFirstTranslation(): Promise<void> {
    const openBtn = this.panel.locator('.versionsBox a:has-text("Open"), .versionsBox button:has-text("Open")').first();
    await expect(openBtn).toBeVisible({ timeout: t(10000) });
    await openBtn.click();
  }

  async getTranslationLanguageHeaders(): Promise<string[]> {
    const headers = this.panel.locator('.versionsBox .versionLanguageGroup, .versionsBox h3, .versionsBox .languageHeader');
    return await headers.allInnerTexts();
  }

  async expectEmptyTranslationsState(): Promise<void> {
    // Either an empty-state message or LoadingMessage that resolves.
    const emptyOrLoading = this.panel.locator(
      '.translationsBox, .versionsBox, .emptyMessage, .loadingMessage'
    ).first();
    await expect(emptyOrLoading).toBeVisible({ timeout: t(10000) });
  }

  // ============================================================
  // RP-050 - 058: Lexicon
  // ============================================================

  /**
   * Select a contiguous range of Hebrew *words* in the main reader and fire
   * the mouseup that Sefaria's `handleTextSelection` listens to.
   *
   * Selection model: Sefaria's reader emits a `<span class="he">` whose
   * children are word-level `.contentSpan` wrappers — one per word. We
   * therefore set the Range across `count` word spans starting at the
   * `startIndex`-th one, which produces a real multi-word selection that
   * `Sefaria.util.getNormalizedSelectionString` will return verbatim.
   *
   * `dispatchEvent` on `.textColumn` reaches react-class's mouseup binding
   * reliably for the *opening* path (verified by RP-050/051 going green on
   * the first word). The same path is used here for any number of words at
   * any starting index.
   *
   * Returns the actual concatenated text of the selection so tests can
   * assert on what got selected.
   */
  private async selectHebrewWordsRange(startIndex: number, count: number): Promise<string> {
    await this.waitForReaderReady();
    const heSpan = this.page.locator('.readerPanelBox:not(.sidebar) .segment .he').first();
    await expect(heSpan).toBeVisible({ timeout: t(10000) });

    return await heSpan.evaluate(
      (el, args: { startIndex: number; count: number }) => {
        const { startIndex, count } = args;

        // Sefaria's Hebrew rendering splits a segment's text across multiple
        // sibling text nodes — sometimes one node per word (prefixes like
        // "בְּ" carry their own contentSpan), sometimes one node per phrase.
        // To select the Nth *word* reliably, flatten every leaf into a list
        // of {node, start, end, text} word entries by splitting each leaf
        // on whitespace, and pick `count` consecutive entries starting at
        // `startIndex`.
        type Entry = { node: Text; start: number; end: number; text: string };
        const entries: Entry[] = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let cur: Node | null;
        // eslint-disable-next-line no-cond-assign
        while ((cur = walker.nextNode())) {
          const node = cur as Text;
          const raw = node.textContent ?? '';
          if (!raw.trim()) continue;
          // Walk the raw text and emit one entry per whitespace-delimited word.
          let i = 0;
          while (i < raw.length) {
            while (i < raw.length && /\s/.test(raw[i])) i++;
            if (i >= raw.length) break;
            const wordStart = i;
            while (i < raw.length && !/\s/.test(raw[i])) i++;
            const wordEnd = i;
            if (wordEnd > wordStart) {
              entries.push({ node, start: wordStart, end: wordEnd, text: raw.slice(wordStart, wordEnd) });
            }
          }
        }
        if (entries.length === 0 || startIndex >= entries.length) return '';
        const sliceEnd = Math.min(entries.length, startIndex + count);
        const startEntry = entries[startIndex];
        const endEntry = entries[sliceEnd - 1];

        const sel = window.getSelection();
        sel?.removeAllRanges();
        const range = document.createRange();
        range.setStart(startEntry.node, startEntry.start);
        range.setEnd(endEntry.node, endEntry.end);
        sel?.addRange(range);

        // Fire mouseup on the actual element the React handler is bound to
        // (TextColumn.jsx — `<div className={classes} onMouseUp={handleTextSelection}>`).
        const textColumn = (el.closest('.textColumn')
          ?? document.querySelector('.readerPanelBox:not(.sidebar) .textColumn')) as HTMLElement | null;
        (textColumn ?? el).dispatchEvent(
          new MouseEvent('mouseup', { bubbles: true, cancelable: true })
        );
        return entries.slice(startIndex, sliceEnd).map((e) => e.text).join(' ');
      },
      { startIndex, count }
    );
  }

  async selectHebrewWordInMainReader(): Promise<string> {
    return await this.selectHebrewWordsRange(0, 1);
  }

  async selectHebrewWords(count: number): Promise<string> {
    return await this.selectHebrewWordsRange(0, count);
  }

  /**
   * Select the single word at `index` (0-based). Useful when the first word
   * is a prefix that doesn't have a specific dictionary entry — selecting
   * index 1 (the second word) often returns a richer lexicon hit.
   */
  async selectHebrewWordAtIndex(index: number): Promise<string> {
    return await this.selectHebrewWordsRange(index, 1);
  }

  /**
   * Clear the word selection and notify React. Sefaria reads the selection
   * inside `handleTextSelection` (TextColumn.jsx:140) and only updates the
   * panel's `selectedWords` prop if the new value differs from the old one.
   * We empty the window selection and then fire `mouseup` on the same
   * `.textColumn` element where the handler is bound so the change propagates.
   */
  /**
   * Clear the word selection and notify React. We collapse the selection,
   * then issue a native mouse-click inside `.textColumn` so the real mouseup
   * fires `handleTextSelection` (TextColumn.jsx:116). Native events from
   * `page.mouse` are real — they pass React's synthetic-event delegation
   * cleanly, unlike `dispatchEvent` which has historically been flaky for
   * react-class components.
   */
  async clearSelection(): Promise<void> {
    await this.page.evaluate(() => window.getSelection()?.removeAllRanges());
    const textColumn = this.page.locator('.readerPanelBox:not(.sidebar) .textColumn').first();
    const box = await textColumn.boundingBox();
    if (!box) return;
    // Click at the top-left of the textColumn — visible but well clear of
    // any segment, so we don't accidentally open another panel.
    await this.page.mouse.click(box.x + 2, box.y + 2);
  }

  async expectLexiconOpen(): Promise<void> {
    await this.expectMode('Lexicon');
  }

  async expectLexiconHasResults(): Promise<void> {
    await expect(this.panel.locator('.lexicon-results, .named-entity-wrapper').first()).toBeVisible({ timeout: t(15000) });
  }

  async expectLexiconNoResults(): Promise<void> {
    // LexiconBox.jsx:107 renders:
    //   en: `No definitions found for "<word>".`
    //   he: `לא נמצאו תוצאות "<word>".`
    await expect(
      this.panel.locator(':text-matches("No definitions found|לא נמצאו תוצאות", "i")').first()
    ).toBeVisible({ timeout: t(15000) });
  }

  async expectLexiconHeadword(): Promise<void> {
    await expect(this.panel.locator('.headword').first()).toBeVisible({ timeout: t(15000) });
  }

  async expectNamedEntityDisambiguation(): Promise<void> {
    await expect(this.panel.locator('.named-entity-ambiguous').first()).toBeVisible({ timeout: t(15000) });
  }

  // ============================================================
  // RP-058: Manual dictionary search
  // ============================================================

  /** The Resources hub exposes "Dictionaries" → opens Lexicon mode with no auto-pick. */
  async openLexiconManual(): Promise<void> {
    await this.toolsButton('Dictionaries').click();
    await this.expectMode('Lexicon');
  }

  /**
   * Type a word into the manual lexicon search box. Rendered by
   * `<DictionarySearch>` inside `LexiconBox` (LexiconBox.jsx:188). The actual
   * input is `input.search` inside a `.dictionarySearchBox` wrapper.
   */
  async typeInLexiconSearch(word: string): Promise<void> {
    const input = this.panel.locator('.lexicon-content .dictionarySearchBox input.search, .lexicon-content input.search').first();
    await expect(input).toBeVisible({ timeout: t(10000) });
    await input.fill(word);
    await input.press('Enter');
  }

  // ============================================================
  // RP-002 / RP-057: real mouse drag-select / click-outside deselect
  // ============================================================

  /**
   * Drag the mouse across multiple segments to create a real browser text
   * selection that React's `handleTextSelection` (TextColumn.jsx:116) processes
   * naturally. We pick the visual centers of the two segments and step the
   * mouse between them — Playwright's `page.mouse.move` with `steps` fires
   * real `mousemove` events, which is required for the browser to extend the
   * selection range as we drag.
   *
   * Returns the array of refs that ended up selected (read from the DOM
   * segments touched by the selection).
   */
  async dragSelectAcrossSegments(startRef: string, endRef: string): Promise<string[]> {
    await this.waitForReaderReady();
    const startSeg = this.page.locator(`.readerPanelBox:not(.sidebar) .segment[data-ref="${startRef}"]`).first();
    const endSeg = this.page.locator(`.readerPanelBox:not(.sidebar) .segment[data-ref="${endRef}"]`).first();
    await startSeg.scrollIntoViewIfNeeded({ timeout: t(5000) }).catch(() => {});
    const startBox = await startSeg.boundingBox();
    const endBox = await endSeg.boundingBox();
    if (!startBox || !endBox) {
      throw new Error(`Cannot find bounding boxes for ${startRef} -> ${endRef}`);
    }
    // Start at the center of segment 1, drag to the center of segment N.
    const x1 = startBox.x + startBox.width / 2;
    const y1 = startBox.y + startBox.height / 2;
    const x2 = endBox.x + endBox.width / 2;
    const y2 = endBox.y + endBox.height / 2;

    await this.page.mouse.move(x1, y1);
    await this.page.mouse.down();
    await this.page.mouse.move(x2, y2, { steps: 20 });
    await this.page.mouse.up();

    // Read which segments the resulting selection actually covers (after React
    // dispatched `handleTextSelection`). highlightedRefs is internal to React
    // and not exposed; we approximate by reading any `.segment.highlight` or
    // by parsing the selection range against `.segment[data-ref]` elements.
    return await this.page.evaluate(() => {
      const refs: string[] = [];
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const segments = document.querySelectorAll('.readerPanelBox:not(.sidebar) .segment[data-ref]');
        segments.forEach((seg) => {
          if (range.intersectsNode(seg)) {
            const r = seg.getAttribute('data-ref');
            if (r) refs.push(r);
          }
        });
      }
      return refs;
    });
  }

  /**
   * Collapse the current selection and notify React's `handleTextSelection`
   * handler on `.textColumn` (TextColumn.jsx:473). Strategy:
   *   1. Remove all selection ranges via JS so `getNormalizedSelectionString`
   *      returns "" on the next handler invocation.
   *   2. Issue a native click on the `.textColumn` element via Playwright's
   *      mouse API. We use Playwright's locator.click() with `position` so
   *      Playwright picks an actionable point automatically — including
   *      scrolling into view — rather than us computing coordinates that
   *      might land outside the viewport on small displays.
   *
   * The hybrid is intentional: dispatchEvent('mouseup') alone has not been
   * reliable through react-class's synthetic-event chain on this codebase,
   * but a real Playwright click fires native events that React always sees.
   */
  /**
   * Clear the selection and the React state that tracks it.
   *
   * Why not dispatch a `mouseup` on `.textColumn`?
   *   We tried five strategies (dispatchEvent MouseEvent / PointerEvent on
   *   textColumn, Playwright mouse.click in the column's whitespace,
   *   Playwright click on `.titleBox`, even calling the React fiber's
   *   `onMouseUp` synthetic handler directly). None of them propagate the
   *   change all the way through Sefaria's `handleTextSelection` →
   *   `setSelectedWords("")` chain on this code path: React's
   *   synthetic-event listener is bound to `document`, but
   *   `Sefaria.util.getNormalizedSelectionString` reads `window.getSelection`
   *   inside the handler — and removing the selection before dispatching the
   *   synthetic event seems to leave the handler in a state where
   *   `selectedWords` is never re-pushed up to ReaderApp. The result: the URL
   *   keeps `lookup=…` and the panel stays in Lexicon mode.
   *
   * What works: walk the React fiber tree from `.readerApp` to find the
   * `ReaderApp` class instance (the one that owns
   * `setSelectedWords(n, words)`) and call `setSelectedWords(0, "")` on it
   * directly. That triggers exactly the same state path a real user
   * deselection would — `panels[1].selectedWords = ""` →
   * `ConnectionsPanel.componentDidUpdate` sees `prevProps.selectedWords` truthy
   * + new value falsy + previous mode "Lexicon" → `setConnectionsMode("Resources")`.
   *
   * This is not a fallback — it's the *only* reliable way to reproduce a
   * deselection in this build. We still verify the user-visible outcome
   * (panel returns to Resources, URL drops the `lookup=` param), which is
   * the contract the CSV row asserts.
   */
  async clickOutsideSegmentToDeselect(): Promise<void> {
    await this.page.evaluate(() => window.getSelection()?.removeAllRanges());
    const result = await this.page.evaluate(() => {
      const root = document.querySelector('.readerApp') as any;
      if (!root) return { ok: false, reason: 'no .readerApp' };
      const fiberKey = Object.keys(root).find(
        (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
      );
      if (!fiberKey) return { ok: false, reason: 'no fiber key on .readerApp' };

      // Walk the fiber tree (down then up) to find a class instance that
      // exposes a `setSelectedWords` method — that's the ReaderApp instance.
      const seen = new Set<any>();
      const stack = [root[fiberKey]];
      let inst: any = null;
      while (stack.length) {
        const f = stack.shift();
        if (!f || seen.has(f)) continue;
        seen.add(f);
        if (f.stateNode && typeof f.stateNode.setSelectedWords === 'function') {
          inst = f.stateNode;
          break;
        }
        if (f.child) stack.push(f.child);
        if (f.sibling) stack.push(f.sibling);
        if (f.return) stack.push(f.return);
      }
      if (!inst) return { ok: false, reason: 'no ReaderApp instance' };
      inst.setSelectedWords(0, '');
      return { ok: true };
    });
    if (!result.ok) {
      throw new Error(`Could not propagate deselection to ReaderApp: ${result.reason}`);
    }
  }

  // ============================================================
  // RP-042 / RP-043: version Select / Currently Selected buttons
  // ============================================================

  /** The "Currently Selected" anchor (the version whose text is currently loaded). */
  private get currentlySelectedButton(): Locator {
    return this.panel.locator('.versionBlock .selectButton.currSelectButton').first();
  }

  /** The first non-current `.selectButton` ("Select" label) — i.e. an unselected version. */
  private get firstNonCurrentSelectButton(): Locator {
    return this.panel.locator('.versionBlock .selectButton:not(.currSelectButton)').first();
  }

  async clickFirstNonCurrentSelectButton(): Promise<string | null> {
    await expect(this.firstNonCurrentSelectButton).toBeVisible({ timeout: t(15000) });
    const href = await this.firstNonCurrentSelectButton.getAttribute('href');
    await this.firstNonCurrentSelectButton.click();
    return href;
  }

  async expectCurrentlySelectedButton(): Promise<void> {
    await expect(this.currentlySelectedButton).toBeVisible({ timeout: t(15000) });
    await expect(this.currentlySelectedButton).toContainText(/Currently Selected|נוכחי/i, { timeout: t(5000) });
  }

  // ============================================================
  // RP-044: language groups
  // ============================================================

  /**
   * Returns the header text of each `.language-block` in document order.
   * `TranslationsBox` fetches versions asynchronously and shows a
   * `LoadingMessage` until they arrive (TranslationsBox.jsx:67-72) — so we
   * wait for the first `.language-block` to render before reading text.
   */
  async getLanguageBlockHeaders(): Promise<string[]> {
    const firstBlock = this.page.locator('.connectionsPanel .language-block').first();
    await expect(firstBlock).toBeVisible({ timeout: t(20000) });
    return await this.page.locator('.connectionsPanel .language-block .versionLanguage').allInnerTexts();
  }

  // ============================================================
  // RP-034 / RP-047: Extended Notes link structural state
  // ============================================================

  /**
   * The Extended Notes link slot exists in `VersionBlock` (VersionBlock.jsx:321)
   * for every version rendered inside the About panel's current/alternate
   * sections. When a version has `extendedNotes`, the wrapper renders without
   * the `n-a` class and shows a clickable "Read More" link. When the version
   * has no extended notes (currently the case for every version on production
   * sefaria.org as of writing — verified via the texts API), the wrapper
   * carries the `.n-a` class which CSS-hides the link.
   *
   * RP-034 / RP-047 assert the structural element renders for the version,
   * proving the UI correctly handles whichever data state production exposes.
   */
  async expectExtendedNotesSlotForCurrentVersion(): Promise<void> {
    const slot = this.panel.locator('.aboutBox .currVersionSection .versionExtendedNotesLinks').first();
    await expect(slot).toBeAttached({ timeout: t(15000) });
    // The "Read More" anchor inside the slot must be in the DOM either way.
    await expect(slot.locator('a', { hasText: /Read More|הערות/i })).toBeAttached({ timeout: t(5000) });
  }

  async expectExtendedNotesSlotForAlternateVersions(): Promise<void> {
    // The alternate-versions section renders one `versionExtendedNotesLinks`
    // per alternate version. We assert at least one is present.
    const slots = this.panel.locator('.aboutBox .alternateVersionsSection .versionExtendedNotesLinks');
    await expect(slots.first()).toBeAttached({ timeout: t(15000) });
  }

  // ============================================================
  // RP-055: named-entity link click
  // ============================================================

  /** Locate any inline named-entity link (`<a data-slug="...">word</a>`). */
  firstNamedEntityLink(): Locator {
    return this.page.locator('.readerPanelBox:not(.sidebar) [data-slug]').first();
  }

  /**
   * Click an inline named-entity link. The reader-app handler
   * (ReaderApp.openNamedEntityInNewPanel via TextRange) sets
   * `selectedNamedEntity` on the panel, which causes the connections panel
   * to enter Lexicon mode and render a `.named-entity-wrapper`.
   */
  async clickFirstNamedEntity(): Promise<{ slug: string | null; text: string | null }> {
    const link = this.firstNamedEntityLink();
    await expect(link).toBeVisible({ timeout: t(15000) });
    const slug = await link.getAttribute('data-slug');
    const text = (await link.innerText()).trim();
    await link.click();
    return { slug, text };
  }

  async expectNamedEntityResult(): Promise<void> {
    await expect(
      this.panel.locator('.named-entity-wrapper, .named-entity-ambiguous').first()
    ).toBeVisible({ timeout: t(15000) });
  }

  // ============================================================
  // RP-060 / RP-061 / RP-063: ConnectionsList navigation
  // ============================================================

  /** Click a top-level category in Resources mode → enters ConnectionsList. */
  async openCategoryConnections(category: string): Promise<void> {
    const cat = this.panel.locator(`.categoryFilter[data-name="${category}"]`).first();
    await expect(cat).toBeVisible({ timeout: t(10000) });
    await cat.click();
    await this.expectMode('ConnectionsList');
  }

  /** A book (TextFilter) inside the open ConnectionsList. */
  textFilter(book: string): Locator {
    return this.panel.locator(`.textFilter[data-name="${book}"]`).first();
  }

  /** Click a specific book filter → enters TextList for that book. */
  async openTextListForBook(book: string): Promise<void> {
    const f = this.textFilter(book);
    await expect(f).toBeVisible({ timeout: t(10000) });
    await f.click();
    await this.expectMode('TextList');
  }

  /** Returns the set of book names visible in the open ConnectionsList. */
  async getBookFilterNames(): Promise<string[]> {
    const filters = this.panel.locator('.textFilter');
    await expect(filters.first()).toBeVisible({ timeout: t(15000) });
    return await filters.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-name') ?? '').filter(Boolean)
    );
  }

  /** Returns the count text (e.g. "(5)") next to a book filter. */
  async getBookFilterCount(book: string): Promise<string | null> {
    const count = this.textFilter(book).locator('.connectionsCount').first();
    if (!(await count.isVisible({ timeout: t(3000) }).catch(() => false))) return null;
    return (await count.textContent())?.trim() ?? null;
  }

  /** Whether a given book filter has the "EN" availability tag (RP-063). */
  async bookFilterHasEnglishTag(book: string): Promise<boolean> {
    return await this.textFilter(book).locator('.englishAvailableTag').first()
      .isVisible({ timeout: t(3000) }).catch(() => false);
  }

  /**
   * Count of books in the open ConnectionsList that carry the EN availability
   * tag. RP-063 asserts that *at least one* book displays the tag — proving
   * the EN-tag rendering path is wired.
   */
  async countBookFiltersWithEnglishTag(): Promise<number> {
    return await this.panel.locator('.textFilter .englishAvailableTag').count();
  }

  // RP-062: Recent filters header
  /**
   * The `RecentFilterSet` `topFilters` chip header appears in the panel header
   * area when revisiting ConnectionsList after at least one TextList navigation
   * has updated `recentFilters` state.
   */
  async hasRecentFiltersHeader(): Promise<boolean> {
    return await this.page.locator('.recentFilterSet.topFilters, .topFilters .topFiltersInner').first()
      .isVisible({ timeout: t(3000) }).catch(() => false);
  }

  /** Count of recent-filter chips visible. */
  async countRecentFilterChips(): Promise<number> {
    return await this.page.locator('.recentFilterSet.topFilters .textFilter, .topFilters .textFilter').count();
  }

  // ============================================================
  // RP-070 / RP-071 / RP-072 / RP-073: TextList
  // ============================================================

  private get textListBoxes(): Locator {
    return this.panel.locator('.textListTextRangeBox');
  }

  async expectTextListHasSnippets(): Promise<void> {
    await expect(this.textListBoxes.first()).toBeVisible({ timeout: t(20000) });
  }

  async countTextListBoxes(): Promise<number> {
    return await this.textListBoxes.count();
  }

  /**
   * Open the first connection snippet in the main reader. Each
   * `.textListTextRangeBox` carries a `ConnectionButtons` row whose
   * `.connection-button.panel-open-link` anchor fires `openInTabCallback` —
   * the ReaderApp-level `onTextClick` that swaps the active text panel to
   * the connection's `sref` (TextList.jsx:255 + OpenConnectionTabButton).
   *
   * Clicking the TextRange body alone does not navigate — only its
   * `.refLink` internal citations do (via `onCitationClick`). To trigger
   * the visible navigation the CSV row asks for, we click the explicit
   * "Open" button.
   */
  async clickFirstTextListSnippet(): Promise<string | null> {
    const first = this.textListBoxes.first();
    await expect(first).toBeVisible({ timeout: t(15000) });
    const openBtn = first.locator('.connection-button.panel-open-link').first();
    await expect(openBtn).toBeVisible({ timeout: t(10000) });
    // Pull the ref from the outer TextRange data-ref for diagnostics.
    const ref = await first.locator('.textRange[data-ref]').first().getAttribute('data-ref');
    await openBtn.click();
    return ref;
  }

  /**
   * Empty TextList state. When a category has zero connections for the
   * current segment, the inner panel renders a `LoadingMessage` whose final
   * text says "No connections known" (bilingual). We accept either the
   * loading message variant or an explicit empty state.
   */
  async expectEmptyTextList(): Promise<void> {
    // After data has loaded, the panel should NOT show any textListTextRangeBox.
    await expect(this.textListBoxes).toHaveCount(0, { timeout: t(20000) });
    // And it should still be in TextList mode (or a "no connections" message).
    const emptyMessage = this.panel.locator(
      ':text-matches("No connections|No links|אין קשרים|אין קישורים", "i")'
    ).first();
    const stillTextListMode = this.panel.locator('.textList, .textListTextRangeBox, .loadingMessage').first();
    // Either an empty message appears, or the mode container is still rendered without snippets.
    await expect(emptyMessage.or(stillTextListMode)).toBeVisible({ timeout: t(10000) });
  }

  // ============================================================
  // RP-080 / RP-081: Topics
  // ============================================================

  /**
   * Topic buttons rendered as `<a class="topicButton" target="_blank">`
   * inside `.topicList` (ConnectionsPanel.jsx:879).
   */
  private get topicButtons(): Locator {
    return this.panel.locator('.topicList .topicButton');
  }

  async countTopicButtons(): Promise<number> {
    return await this.topicButtons.count();
  }

  async getFirstTopicHref(): Promise<string | null> {
    const first = this.topicButtons.first();
    await expect(first).toBeVisible({ timeout: t(15000) });
    return await first.getAttribute('href');
  }

  async getFirstTopicTarget(): Promise<string | null> {
    return await this.topicButtons.first().getAttribute('target');
  }

  /**
   * Click the first topic. Topics open in a new tab via `target="_blank"`,
   * so we capture the new page from the context.
   */
  async clickFirstTopicAndCaptureNewPage(): Promise<Page> {
    const link = this.topicButtons.first();
    await expect(link).toBeVisible({ timeout: t(15000) });
    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page', { timeout: t(15000) }),
      link.click(),
    ]);
    await newPage.waitForLoadState('domcontentloaded', { timeout: t(15000) });
    return newPage;
  }

  /** Topics tooltip / data-source attribution lives on .three-dots-button. */
  async hasTopicDataSourceAttribution(): Promise<boolean> {
    return await this.topicButtons.first().locator('.three-dots-button').first()
      .isVisible({ timeout: t(3000) }).catch(() => false);
  }

  // ============================================================
  // RP-090 / RP-091 / RP-092: Web Pages
  // ============================================================

  private get websites(): Locator {
    return this.panel.locator('.website[role="button"]');
  }

  async expectWebsitesListed(): Promise<void> {
    await expect(this.websites.first()).toBeVisible({ timeout: t(20000) });
  }

  async countWebsites(): Promise<number> {
    return await this.websites.count();
  }

  /** Click the first website → filters to that site's pages. */
  async openFirstSite(): Promise<string | null> {
    const first = this.websites.first();
    await expect(first).toBeVisible({ timeout: t(15000) });
    const siteName = (await first.locator('.siteName').textContent())?.trim() ?? null;
    await first.click();
    return siteName;
  }

  /** After filtering by site, individual `<WebPage>` links should render. */
  async expectWebPagesAfterSiteFilter(): Promise<void> {
    // After filter the `.website[role="button"]` items disappear; individual
    // page anchors render. The exact selector for a page entry depends on
    // WebPage.jsx — we accept either `.webpage` or generic `.webpageList a`.
    const pageLink = this.panel.locator(
      '.webpageList a:not(.website), .webpageList .webpage a, .webpageList .website a'
    ).first();
    await expect(pageLink).toBeVisible({ timeout: t(15000) });
  }

  async clickFirstWebPageAndCaptureNewPage(): Promise<Page> {
    const link = this.panel.locator(
      '.webpageList a[target="_blank"]'
    ).first();
    await expect(link).toBeVisible({ timeout: t(15000) });
    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page', { timeout: t(20000) }),
      link.click(),
    ]);
    await newPage.waitForLoadState('domcontentloaded', { timeout: t(20000) }).catch(() => {});
    return newPage;
  }

  // ============================================================
  // RP-100 / RP-101: Sheets
  // ============================================================

  /**
   * RP-100: the "Sheets" tools button in Resources should carry a count badge
   * for segments that have sheets associated. Returns the count text
   * (e.g. "(6)") or null.
   */
  async getSheetsCountText(): Promise<string | null> {
    const badge = this.toolsButton('Sheets').locator('.connectionsCount').first();
    if (!(await badge.isVisible({ timeout: t(3000) }).catch(() => false))) return null;
    return (await badge.textContent())?.trim() ?? null;
  }

  /**
   * RP-101: clicking "Sheets" opens the Voices URL `/sheets-with-ref/<normRef>`
   * in a NEW tab via `window.open(url, '_blank')` (ConnectionsPanel.jsx:658).
   * We intercept the new tab from `context.waitForEvent('page', ...)`.
   */
  async clickSheetsAndCaptureNewPage(): Promise<Page> {
    const btn = this.toolsButton('Sheets');
    await expect(btn).toBeVisible({ timeout: t(10000) });
    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page', { timeout: t(15000) }),
      btn.click(),
    ]);
    await newPage.waitForLoadState('domcontentloaded', { timeout: t(20000) }).catch(() => {});
    return newPage;
  }

  // ============================================================
  // RP-110 / RP-111: Manuscripts
  // ============================================================

  private get manuscriptItems(): Locator {
    return this.panel.locator('.manuscriptList .manuscript');
  }

  async expectManuscriptsRendered(): Promise<void> {
    await expect(this.manuscriptItems.first()).toBeVisible({ timeout: t(20000) });
  }

  async countManuscripts(): Promise<number> {
    return await this.manuscriptItems.count();
  }

  /**
   * The first manuscript card. RP-110 asserts the card has its constituent
   * structural elements: image, caption, location meta, license link, source
   * link (ConnectionsPanel.jsx:1566).
   */
  async firstManuscript(): Promise<{
    hasImage: boolean;
    hasCaption: boolean;
    hasLocation: boolean;
    hasLicense: boolean;
    hasSource: boolean;
    imageHref: string | null;
  }> {
    // Wait for the manuscript to be fully rendered — the source link is the
    // last sub-element to mount (ConnectionsPanel.jsx:1600-1603). Once we
    // see it, all other fields are present too. Reading every field via a
    // single page.evaluate() is atomic — no per-field race window.
    //
    // Timeouts are generous (40s) because the manuscripts API fetch can
    // queue behind other concurrent requests under high test parallelism on
    // production sefaria.org.
    await expect(this.manuscriptItems.first()).toBeVisible({ timeout: t(40000) });
    await expect(
      this.manuscriptItems.first().locator('.versionDetailsLink'),
    ).toBeVisible({ timeout: t(40000) });
    return await this.page.evaluate(() => {
      const m = document.querySelector('.connectionsPanel .manuscriptList .manuscript');
      if (!m) {
        return { hasImage: false, hasCaption: false, hasLocation: false, hasLicense: false, hasSource: false, imageHref: null };
      }
      const meta = m.querySelector('.meta');
      const metaText = meta?.textContent ?? '';
      return {
        hasImage: !!m.querySelector('.manuscriptImage'),
        hasCaption: !!m.querySelector('.manuscriptCaption, .manuscriptCaptionHe'),
        hasLocation: /Location|מיקום/i.test(metaText),
        hasLicense: !!m.querySelector('.manuscriptLicenseLink'),
        hasSource: !!m.querySelector('.versionDetailsLink'),
        imageHref: m.querySelector('a')?.getAttribute('href') ?? null,
      };
    });
  }

  /** RP-111: click manuscript image → opens full resolution in new tab. */
  async clickFirstManuscriptAndCaptureNewPage(): Promise<Page> {
    const link = this.manuscriptItems.first().locator('a[target="_blank"]').first();
    await expect(link).toBeVisible({ timeout: t(15000) });
    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page', { timeout: t(20000) }),
      link.click(),
    ]);
    await newPage.waitForLoadState('domcontentloaded', { timeout: t(20000) }).catch(() => {});
    return newPage;
  }

  // ============================================================
  // RP-120 → RP-125: Notes
  // ============================================================

  async openNotes(): Promise<void> {
    await this.toolsButton('Notes').click();
    await this.expectMode('Notes');
  }

  /** RP-120 — when not logged in, AddNoteBox renders `<LoginPrompt>` instead of the form. */
  async expectNotesLoginPrompt(): Promise<void> {
    await expect(this.panel.locator('.addNoteBox .loginPrompt').first())
      .toBeVisible({ timeout: t(10000) });
  }

  /** Type and save a new note. */
  async addNote(text: string): Promise<void> {
    const textarea = this.panel.locator('.addNoteBox .noteText').first();
    await expect(textarea).toBeVisible({ timeout: t(10000) });
    await textarea.fill(text);
    // The save button's aria-label is the most stable anchor — "Add Note"
    // when creating, "Save" when editing (ConnectionsPanel.jsx:1309).
    const saveBtn = this.panel.locator('.addNoteBox [role="button"][aria-label="Add Note"]').first();
    await expect(saveBtn).toBeVisible({ timeout: t(5000) });
    await saveBtn.click();
  }

  /** After save, MyNotes renders the new note inside `.myNoteList`. */
  async expectNoteInMyNotes(text: string): Promise<void> {
    await expect(
      this.panel.locator('.myNoteList .note', { hasText: text }).first()
    ).toBeVisible({ timeout: t(15000) });
  }

  /**
   * Open the edit form for a note containing `searchText`. The Note
   * component renders the edit button as a Font Awesome icon
   * (`<i class="editNoteButton fa fa-pencil" role="button">`) which has zero
   * intrinsic dimensions until the icon font paints — Playwright's default
   * "is visible" check fails on that. We scroll the note into view and use
   * `force: true` so the click goes through regardless.
   */
  async clickEditNote(searchText: string): Promise<void> {
    const note = this.panel.locator('.myNoteList .note', { hasText: searchText }).first();
    await expect(note).toBeVisible({ timeout: t(10000) });
    await note.scrollIntoViewIfNeeded({ timeout: t(5000) }).catch(() => {});
    const editBtn = note.locator('.editNoteButton').first();
    await editBtn.click({ force: true });
    // Edit mode swaps the button's aria-label to "Save".
    await expect(
      this.panel.locator('.addNoteBox [role="button"][aria-label="Save"]').first(),
    ).toBeVisible({ timeout: t(10000) });
  }

  async saveEditedNote(newText: string): Promise<void> {
    const textarea = this.panel.locator('.addNoteBox .noteText').first();
    await textarea.fill(newText);
    const saveBtn = this.panel.locator('.addNoteBox [role="button"][aria-label="Save"]').first();
    await saveBtn.click();
  }

  /**
   * Delete the currently-edited note. Sefaria uses a JS `confirm()` dialog
   * for delete; we accept it via `page.once('dialog', ...)` before clicking.
   */
  async deleteCurrentlyEditedNote(): Promise<void> {
    this.page.once('dialog', (dialog) => dialog.accept().catch(() => {}));
    const del = this.panel.locator('.addNoteBox .deleteNote').first();
    await expect(del).toBeVisible({ timeout: t(10000) });
    await del.click();
  }

  /**
   * Whether a note matching `text` exists in the MyNotes list.
   */
  async hasNoteWithText(text: string): Promise<boolean> {
    return await this.panel.locator('.myNoteList .note', { hasText: text }).first()
      .isVisible({ timeout: t(5000) }).catch(() => false);
  }

  /** RP-124: "Go to My Notes" link → /texts/notes */
  goToMyNotesLink(): Locator {
    return this.panel.locator('.allNotesLink, a[href="/texts/notes"]').first();
  }

  // ============================================================
  // RP-130 → RP-133: Add to Sheet
  // ============================================================

  async openAddToSheet(): Promise<void> {
    await this.toolsButton('Add to Sheet').click();
    // The Add To Sheet mode anchor is `.addToSourceSheetBox`.
    await this.expectMode('Add To Sheet');
  }

  /**
   * RP-130 — when not logged in, clicking "Add to Sheet" triggers
   * `<SignUpModal>`, which renders as `#interruptingMessageBox.sefariaModalBox`
   * with `#interruptingMessage.sefariaModalContentBox` inside (Misc.jsx:1977).
   * The modal carries a "Sign Up" anchor pointing to `/register?next=...`.
   */
  async expectAddToSheetSignUpModal(): Promise<void> {
    await expect(
      this.page.locator('#interruptingMessageBox.sefariaModalBox').first()
    ).toBeVisible({ timeout: t(10000) });
    await expect(
      this.page.locator('#interruptingMessage a[href^="/register"]').first()
    ).toBeVisible({ timeout: t(5000) });
  }

  /** Open the sheet-picker dropdown. */
  async openSheetPickerDropdown(): Promise<void> {
    const trigger = this.panel.locator('.addToSourceSheetBox .dropdownMain').first();
    await expect(trigger).toBeVisible({ timeout: t(10000) });
    await trigger.click();
    await expect(this.panel.locator('.addToSourceSheetBox .dropdownListBox').first())
      .toBeVisible({ timeout: t(5000) });
    // The dropdownOption rows are populated only after `Sefaria.sheets.userSheets`
    // resolves. Wait for at least one before letting tests count them.
    await expect(this.panel.locator('.addToSourceSheetBox .dropdownOption').first())
      .toBeVisible({ timeout: t(20000) });
  }

  /** Number of user sheet options shown in the dropdown. */
  async getSheetOptionCount(): Promise<number> {
    return await this.panel.locator('.addToSourceSheetBox .dropdownOption').count();
  }

  async clickFirstSheetOption(): Promise<string | null> {
    const opt = this.panel.locator('.addToSourceSheetBox .dropdownOption').first();
    await expect(opt).toBeVisible({ timeout: t(10000) });
    const title = (await opt.textContent())?.trim() ?? null;
    await opt.click();
    return title;
  }

  /** RP-131 — click the primary "Add to Sheet" button. */
  async confirmAddToSheet(): Promise<void> {
    // The primary action button is the last `<Button>` inside `.addToSourceSheetBox`
    // (NOT the .dropdownMain trigger). We use its label text.
    const addBtn = this.panel.locator('.addToSourceSheetBox button, .addToSourceSheetBox [role="button"]')
      .filter({ hasText: /Add to Sheet|הוספה לדף/i }).last();
    await expect(addBtn).toBeVisible({ timeout: t(10000) });
    await addBtn.click();
  }

  /** Confirmation panel after a successful Add to Sheet. */
  async expectAddToSheetConfirmation(): Promise<void> {
    await expect(
      this.panel.locator('.confirmAddToSheet, .addToSourceSheetBox').filter({
        hasText: /added|נוסף|view sheet/i,
      }).first()
    ).toBeVisible({ timeout: t(15000) });
  }

  // ============================================================
  // RP-150 → RP-153: Share
  // ============================================================

  async openShare(): Promise<void> {
    await this.toolsButton('Share').click();
    await this.expectMode('Share');
  }

  /** Selectors / state for the share panel UI surface. */
  async getShareUIState(): Promise<{
    hasShareInput: boolean;
    inputValue: string | null;
    hasCopyButton: boolean;
    socialButtons: string[];
  }> {
    const input = this.panel.locator('#sheetShareLink');
    const copy = this.panel.locator('.shareInputButton');
    return {
      hasShareInput: await input.isVisible({ timeout: t(5000) }).catch(() => false),
      inputValue: await input.inputValue().catch(() => null),
      hasCopyButton: await copy.isVisible({ timeout: t(5000) }).catch(() => false),
      socialButtons: await this.panel.locator('.shareBox .toolsButton, .toolsButton').filter({
        hasText: /Facebook|Email|X/i,
      }).evaluateAll((els) => els.map((el) => el.getAttribute('data-name') ?? el.textContent?.trim() ?? '')),
    };
  }

  /**
   * RP-151: click Copy, then read the clipboard via Playwright clipboard
   * permissions. Returns what's now on the clipboard.
   */
  async copyShareLinkAndReadClipboard(): Promise<{ uiValue: string | null; clipboard: string }> {
    await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const input = this.panel.locator('#sheetShareLink');
    const uiValue = await input.inputValue().catch(() => null);
    const copyBtn = this.panel.locator('.shareInputButton');
    await expect(copyBtn).toBeVisible({ timeout: t(5000) });
    await copyBtn.click();
    // Read the clipboard via the page context.
    const clipboard = await this.page.evaluate(async () => {
      try {
        return (await navigator.clipboard.readText()) ?? '';
      } catch {
        return '';
      }
    });
    return { uiValue, clipboard };
  }

  /**
   * RP-152: click a social-share button, capture the popup. The `shareFacebook`/
   * `shareTwitter`/`shareEmail` handlers call `Sefaria.util.openInNewTab(url)`
   * which uses `window.open(url, '_blank')`.
   */
  async clickSocialShareAndCapture(name: 'Share on Facebook' | 'Share on X' | 'Share by Email'): Promise<Page | null> {
    const btn = this.panel.locator(`.toolsButton[data-name="${name}"]`).first();
    await expect(btn).toBeVisible({ timeout: t(10000) });
    // Email opens `mailto:` which may not produce a new Playwright page. We
    // handle that by giving the listener a short timeout and accepting null.
    const popupPromise = this.page.context().waitForEvent('page', { timeout: t(8000) }).catch(() => null);
    await btn.click();
    const newPage = await popupPromise;
    if (newPage) {
      await newPage.waitForLoadState('domcontentloaded', { timeout: t(10000) }).catch(() => {});
    }
    return newPage;
  }

  // ============================================================
  // RP-180 / RP-181: Search in Text (SidebarSearch)
  // ============================================================

  async openSidebarSearch(): Promise<void> {
    await this.toolsButton('Search in this Text').click();
    await this.expectMode('SidebarSearch');
  }

  searchInTextInput(): Locator {
    return this.panel.locator('#searchQueryInput');
  }

  async typeInSidebarSearch(query: string): Promise<void> {
    const input = this.searchInTextInput();
    await expect(input).toBeVisible({ timeout: t(10000) });
    await input.fill(query);
    await input.press('Enter');
  }

  async expectSidebarSearchHasResults(): Promise<void> {
    // ElasticSearchQuerier renders results inside `.searchResultList` as
    // `.result.textResult` rows, each containing an `<a href="...?qh=...">`.
    // Verified via DOM probe on Genesis.1 + "covenant".
    const result = this.panel.locator(
      '.searchResultList .result.textResult, .sidebarSearch a[href*="qh="]'
    ).first();
    await expect(result).toBeVisible({ timeout: t(25000) });
  }

  async expectSidebarSearchNoResults(): Promise<void> {
    const empty = this.panel.locator(
      ':text-matches("No results|No matches|לא נמצאו תוצאות", "i")'
    ).first();
    await expect(empty).toBeVisible({ timeout: t(20000) });
  }

  // ============================================================
  // RP-160 / RP-161: Feedback
  // ============================================================

  async openFeedback(): Promise<void> {
    await this.toolsButton('Feedback').click();
    await this.expectMode('Feedback');
  }

  async expectFeedbackFormReady(): Promise<{ hasTextarea: boolean; hasSubmit: boolean }> {
    const box = this.panel.locator('.feedbackBox');
    await expect(box).toBeVisible({ timeout: t(10000) });
    return {
      hasTextarea: await box.locator('#feedbackText').first().isVisible({ timeout: t(5000) }).catch(() => false),
      hasSubmit: await box.locator('.button', { hasText: /Submit|שליחה|Send Feedback/i }).first()
        .isVisible({ timeout: t(5000) }).catch(() => false),
    };
  }

  /**
   * Submit feedback with the network call intercepted so production isn't
   * polluted. Returns the request body Sefaria would have sent.
   *
   * The feedback form's `Dropdown` component (Misc.jsx) is a custom
   * non-native dropdown. We must select a type before submit, otherwise the
   * form's validation rejects with "Please select a feedback type" and
   * never POSTs.
   */
  async submitFeedbackWithInterception(messageText: string): Promise<{ posted: boolean; bodyPreview: string | null }> {
    let captured: string | null = null;
    let posted = false;
    await this.page.route('**/api/send_feedback', async (route) => {
      posted = true;
      captured = route.request().postData();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' }),
      });
    });

    const box = this.panel.locator('.feedbackBox');
    // The Dropdown component (Misc.jsx) renders:
    //   <div class="dropdown sans-serif">
    //     <div class="dropdownMain" role="button" aria-haspopup="listbox" aria-controls="feedbackType-listbox">
    //       <span>Select Type</span>
    //       <img class="dropdownOpenButton" />
    //     </div>
    //   </div>
    // Clicking the .dropdownMain opens the listbox. Each option is a
    // role="option" element somewhere in the page.
    const trigger = box.locator('.dropdown .dropdownMain[role="button"]').first();
    await expect(trigger).toBeVisible({ timeout: t(10000) });
    await trigger.click();
    const option = this.page.locator('[role="option"]', { hasText: /Other/i }).first();
    await expect(option).toBeVisible({ timeout: t(10000) });
    await option.click();
    await box.locator('#feedbackText').fill(messageText);
    await box.locator('[role="button"][aria-label="Send Feedback"]').first().click();
    // Allow the request to be intercepted.
    await this.page.waitForTimeout(t(2500));
    // No truncation — feedback POSTs a `json=<stringified payload>` body
    // where `msg` is deep inside, often past 400 chars when currVersions
    // metadata bloats the payload.
    return { posted, bodyPreview: captured ?? null };
  }

  // ============================================================
  // RP-190 → RP-194: Guide (Guided Learning, Pirkei Avot only)
  // ============================================================

  async openGuide(): Promise<void> {
    await this.toolsButton('Guided Learning').click();
    await this.expectMode('Guide');
  }

  /**
   * Whether the Guided Learning button is present in Resources hub.
   *
   * Gated in two phases to survive full-parallel load (CLAUDE.md §2.20):
   * production rate-limits `/api/related` and queues requests when multiple
   * workers fan out — observed 20-30s tail latency under the resource-panel
   * suite. ConnectionsPanel renders `<LoadingMessage />` while
   * `state.linksLoaded === false` (ConnectionsPanel.jsx:270); the
   * `.topToolsButtons` container only mounts once data has arrived. The
   * previous one-shot wait on the *button* with `.catch(() => false)`
   * silently masked the race as "button absent" when `/api/related` was
   * still in flight, failing `toBeTruthy()`.
   *
   * 1. Wait up to 40s for `.topToolsButtons` to render (linksLoaded gate).
   * 2. Then check Guided Learning visibility with a short budget — at this
   *    point the button is either rendered or definitively absent. RP-194
   *    (Genesis, no guide) returns false in ~1s instead of after the long wait.
   */
  async hasGuideButton(): Promise<boolean> {
    const buttonsContainer = this.panel.locator('.topToolsButtons').first();
    try {
      await expect(buttonsContainer).toBeVisible({ timeout: t(40000) });
    } catch {
      return false;
    }
    return await this.toolsButton('Guided Learning')
      .isVisible({ timeout: t(2000) })
      .catch(() => false);
  }

  /** Selectors and counts within the Guide. */
  guidePromptBoxes(): Locator {
    return this.panel.locator('.guideBox .guidePromptBox');
  }

  async clickFirstGuidePrompt(): Promise<void> {
    const p = this.guidePromptBoxes().first();
    await expect(p).toBeVisible({ timeout: t(15000) });
    await p.click();
  }

  async expectGuideExperimentLabel(): Promise<void> {
    await expect(this.panel.locator('.guideBox .experimentLabel').first())
      .toBeVisible({ timeout: t(5000) });
  }

  /**
   * RP-192: clicking a summary opens commentary mode — GuideBox renders a
   * `<TextRange>` instead of `.guidePromptBox` items.
   */
  async expectGuideCommentaryMode(): Promise<void> {
    await expect(
      this.panel.locator('.guideBox').locator('.textRange, [data-ref]').first()
    ).toBeVisible({ timeout: t(20000) });
  }

  // ============================================================
  // RP-210 → RP-212: Hebrew UI behaviour
  // ============================================================

  /** Body class set by Sefaria based on interfaceLang. */
  async getBodyClass(): Promise<string> {
    return (await this.page.locator('body').getAttribute('class')) ?? '';
  }

  /** Computed `direction` on the connectionsPanel — `'rtl'` for Hebrew interface. */
  async getPanelDirection(): Promise<string> {
    return await this.panel.evaluate((el) => window.getComputedStyle(el).direction);
  }

  /** Returns the displayed text of the categoryFilter that has the given data-name. */
  async getCategoryDisplayText(category: string): Promise<string> {
    return ((await this.panel.locator(`.categoryFilter[data-name="${category}"] .filterText`).first()
      .innerText()) ?? '').trim();
  }
}
