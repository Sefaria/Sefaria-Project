import { Locator, Page, expect } from '@playwright/test';
import { DeveloperSettingsPage } from './developerSettingsPage';
import { t } from '../globals';

/** What a confirm window exposes to assistive tech, read through Chrome's accessibility tree. */
export type WindowA11y = {
  kind: string;
  title: string;
  body: string;
  name: string;
  description: string;
};

/** What the copy button and its live region did after a click (recorded in the page). */
export type CopyRecord = {
  /** ms from the click to the check icon appearing and going away (null if it didn't). */
  checkOn: number | null;
  checkOff: number | null;
  /** Every text the live region beside the button held. */
  announced: string[];
  /** Visible (larger than 1px) elements whose text included "Copied". */
  visibleCopied: string[];
  /** The check icon's stroke color while it showed. */
  checkColor: string | null;
};

/** Computed looks of a new key row, sampled each frame after it appears. */
export type RowSample = { t: number; values: string[] };

/**
 * The keys on the Developer Settings home page (DS-KEY-*, and the keyboard and screen reader
 * checks that use them, DS-A11Y-*). Extends the shared page object; locators and waits only.
 */
export class DeveloperSettingsKeysPage extends DeveloperSettingsPage {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // --- Locators --------------------------------------------------------------------------

  keyCode(projectName: string, keyLabel: string): Locator {
    return this.keyRow(projectName, keyLabel).locator('code');
  }

  /** A button in a key's row, named by its translation key, e.g. developer.home.key.copy.aria. */
  async keyButton(projectName: string, keyLabel: string, ariaKey: string): Promise<Locator> {
    const name = await this.str(ariaKey, { key_name: keyLabel });
    return this.keyRow(projectName, keyLabel).getByRole('button', { name, exact: true });
  }

  async limitSwitch(projectName: string, keyLabel: string): Promise<Locator> {
    const name = await this.str('developer.home.key.restrict.aria', { key_name: keyLabel });
    return this.project(projectName).getByRole('switch', { name, exact: true });
  }

  async addKeyButton(projectName: string): Promise<Locator> {
    return this.button(await this.str('developer.home.project.add_key.button'), this.project(projectName));
  }

  async editProjectButton(projectName: string): Promise<Locator> {
    return this.button(await this.str('developer.home.project.edit_details.button'), this.project(projectName));
  }

  async projectMenuButton(projectName: string): Promise<Locator> {
    const name = await this.str('developer.home.project_menu.open.aria', { project_name: projectName });
    return this.project(projectName).getByRole('button', { name, exact: true });
  }

  /** The ⋮ menu's options (role=button items) inside a project. */
  projectMenuItems(projectName: string): Locator {
    return this.project(projectName).locator('.dropdownLinks-menu .dropdownItem');
  }

  /** The confirm window on screen (delete windows are alertdialogs, the limit window a dialog). */
  confirmWindow(): Locator {
    return this.page.locator('[role="alertdialog"], [role="dialog"]');
  }

  keyNameField(): Locator {
    return this.page.locator('#devEKeyName');
  }

  keyNameError(): Locator {
    return this.page.locator('#devEKeyName-error');
  }

  limitSiteField(): Locator {
    return this.page.locator('#devELimitSite');
  }

  limitSiteHint(): Locator {
    return this.page.locator('#devELimitSite-hint');
  }

  /** The (?) beside "Limit to website" in a project's key table header. */
  async restrictTipButton(projectName: string): Promise<Locator> {
    const name = await this.str('developer.home.keys_table.restrict_tooltip.aria');
    return this.project(projectName).getByRole('button', { name, exact: true });
  }

  restrictTip(projectName: string): Locator {
    return this.project(projectName).getByRole('tooltip');
  }

  /** The back button of a full-screen step: "Projects and API keys", or the in-flow arrow. */
  async stepBackButton(): Promise<Locator> {
    const toProjects = await this.str('developer.common.projects_and_keys.header');
    return this.root().getByRole('button', { name: toProjects, exact: true });
  }

  // --- Actions ---------------------------------------------------------------------------

  /** Lets the page read and write the clipboard (Copy key). */
  async allowClipboard(): Promise<void> {
    await this.page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(this.page.url()).origin });
  }

  async clipboardText(): Promise<string> {
    return this.page.evaluate(() => navigator.clipboard.readText());
  }

  /**
   * Watches a key's copy button and its live region from now on: when the check icon comes and
   * goes, what the live region says, and whether any visible element shows "Copied".
   */
  async watchCopy(projectName: string, keyLabel: string, copiedText: string): Promise<void> {
    const button = await this.keyButton(projectName, keyLabel, 'developer.home.key.copy.aria');
    await button.evaluate((btn: Element, copied: string) => {
      const w = window as any;
      const rec = {
        start: 0,
        checkOn: null,
        checkOff: null,
        announced: [],
        visibleCopied: [],
        checkColor: null,
      } as any;
      w.__dsCopy = rec;
      const cell = btn.closest('td')!;
      const live = cell.querySelector('[aria-live]');
      const isCheck = () => !!btn.querySelector('path[d="m12 15 2 2 4-4"]');
      const look = () => {
        const now = performance.now() - rec.start;
        if (isCheck() && rec.checkOn === null) {
          rec.checkOn = now;
          const svg = btn.querySelector('svg');
          rec.checkColor = svg ? getComputedStyle(svg).color : null;
        }
        if (!isCheck() && rec.checkOn !== null && rec.checkOff === null) rec.checkOff = now;
        const said = live ? (live.textContent || '').trim() : '';
        if (said && rec.announced[rec.announced.length - 1] !== said) rec.announced.push(said);
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!(n.textContent || '').includes(copied)) continue;
          const el = n.parentElement!;
          // Hidden if it, or any box around it, is invisible, clipped away or 1px wide (sr-only).
          let hidden = false;
          for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
            const s = getComputedStyle(a);
            const r = a.getBoundingClientRect();
            const clipped = s.clip === 'rect(0px, 0px, 0px, 0px)' || (s.clipPath && s.clipPath !== 'none');
            const tiny = (r.width <= 1 || r.height <= 1) && s.overflow !== 'visible';
            if (s.display === 'none' || s.visibility === 'hidden' || clipped || tiny) {
              hidden = true;
              break;
            }
          }
          if (!hidden) rec.visibleCopied.push((el.outerHTML || '').slice(0, 200));
        }
      };
      new MutationObserver(look).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
      w.__dsCopyStart = () => {
        rec.start = performance.now();
      };
    }, copiedText);
  }

  async clickCopy(projectName: string, keyLabel: string): Promise<void> {
    const button = await this.keyButton(projectName, keyLabel, 'developer.home.key.copy.aria');
    await this.page.evaluate(() => (window as any).__dsCopyStart());
    await button.click();
  }

  /** What the copy watcher has seen; waits until the check icon has gone away (or the timeout). */
  async copyRecord(waitForOff = true): Promise<CopyRecord> {
    if (waitForOff) {
      await expect
        .poll(() => this.page.evaluate(() => (window as any).__dsCopy?.checkOff ?? null), { timeout: t(15000) })
        .not.toBeNull();
    }
    return this.page.evaluate(() => {
      const r = (window as any).__dsCopy;
      return {
        checkOn: r.checkOn,
        checkOff: r.checkOff,
        announced: r.announced,
        visibleCopied: r.visibleCopied,
        checkColor: r.checkColor,
      };
    });
  }

  /** The copy button currently shows the plain copy icon (not the check). */
  async expectPlainCopyIcon(projectName: string, keyLabel: string): Promise<void> {
    const button = await this.keyButton(projectName, keyLabel, 'developer.home.key.copy.aria');
    await expect(button.locator('svg')).toHaveCount(1);
    await expect(button.locator('path[d="m12 15 2 2 4-4"]')).toHaveCount(0);
  }

  /** Turns a switch on by clicking it (the checkbox sits under its painted label). */
  async clickSwitch(sw: Locator): Promise<void> {
    await sw.scrollIntoViewIfNeeded();
    const id = await sw.getAttribute('id');
    await this.page.locator(`label[for="${id}"]`).click();
  }

  /** The key's id, read from its switch (devERes-<id>). */
  async keyIdFromRow(projectName: string, keyLabel: string): Promise<string> {
    const id = await this.keyRow(projectName, keyLabel).locator('input[role="switch"]').getAttribute('id');
    if (!id) throw new Error(`No switch in ${keyLabel}'s row`);
    return id.replace(/^devERes-/, '');
  }

  /** The status of asking the developer API for a key's value (404 once the key is deleted). */
  async keyValueStatus(keyId: string): Promise<number> {
    const origin = new URL(this.page.url()).origin;
    const cookies = await this.page.context().cookies(origin);
    const csrf = cookies.find((c) => c.name === 'csrftoken')?.value ?? '';
    const r = await this.page.request.post(`${origin}/api/developer/keys/${keyId}/value`, {
      headers: { 'X-CSRFToken': csrf, Referer: origin + DeveloperSettingsPage.PATH },
    });
    return r.status();
  }

  /** No toast, alert or status message on the page. */
  async expectNoMessage(): Promise<void> {
    await expect(this.page.locator('.devE-toast')).toHaveCount(0);
    // The page keeps empty live regions for announcements; a message is one with text in it.
    await expect(this.root().getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
    await expect(this.root().getByRole('status').filter({ hasText: /\S/ })).toHaveCount(0);
  }

  /**
   * Samples the computed look of the row whose first cell is `label`, every frame for `ms` from
   * the moment it appears, and the same for a reference row. Call before the row is created.
   */
  async sampleNewRow(label: string, referenceLabel: string, ms = 2500): Promise<void> {
    await this.page.evaluate(
      ([label, ref, ms]) => {
        const w = window as any;
        w.__dsRow = { done: false, samples: [], refSamples: [] };
        const props = [
          'backgroundColor',
          'color',
          'boxShadow',
          'outlineStyle',
          'outlineColor',
          'animationName',
          'opacity',
        ];
        const rowOf = (name: string) =>
          Array.from(document.querySelectorAll('.devPocPage tr')).find(
            (tr) => (tr.querySelector('td .devE-keyNameText')?.textContent || '').trim() === name
          ) as HTMLElement | undefined;
        const lookOf = (tr: HTMLElement) => {
          const els = [tr, ...Array.from(tr.querySelectorAll('td'))] as HTMLElement[];
          return els.map((el) => {
            const s = getComputedStyle(el) as any;
            return props.map((p) => `${p}=${s[p]}`).join(';');
          });
        };
        let start = 0;
        const tick = () => {
          const row = rowOf(label);
          if (row) {
            if (!start) start = performance.now();
            w.__dsRow.samples.push({ t: performance.now() - start, values: lookOf(row) });
            const refRow = rowOf(ref);
            if (refRow) w.__dsRow.refSamples.push({ t: performance.now() - start, values: lookOf(refRow) });
            if (performance.now() - start > ms) {
              w.__dsRow.done = true;
              return;
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      [label, referenceLabel, ms] as [string, string, number]
    );
  }

  async rowSamples(): Promise<{ samples: RowSample[]; refSamples: RowSample[] }> {
    await expect
      .poll(() => this.page.evaluate(() => (window as any).__dsRow?.done ?? false), { timeout: t(15000) })
      .toBe(true);
    return this.page.evaluate(() => ({
      samples: (window as any).__dsRow.samples,
      refSamples: (window as any).__dsRow.refSamples,
    }));
  }

  /** Width of the project's header content box (Add key spans it on phones). */
  async projectHeadContentWidth(projectName: string): Promise<number> {
    return this.project(projectName)
      .locator('.devE-projHead')
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
      });
  }

  /** The element at a locator's center is the locator's element (nothing covers it). */
  async hitsItself(target: Locator): Promise<boolean> {
    return target.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    });
  }

  /**
   * Opens the page with a full load and records, from the first frame on, whether each project's
   * website link is there and where the Add key buttons sit relative to their project.
   */
  async openWatchingLayout(): Promise<void> {
    await this.page.addInitScript(() => {
      const w = window as any;
      if (!location.pathname.startsWith('/settings/developer')) return;
      w.__dsLayout = [];
      const start = performance.now();
      const tick = () => {
        const projects = Array.from(document.querySelectorAll('.devPocPage .devE-project'));
        if (projects.length) {
          w.__dsLayout.push({
            t: performance.now() - start,
            projects: projects.map((p) => {
              const btn = p.querySelector('[data-agent-action="new-key"]') as HTMLElement | null;
              const link = p.querySelector('.devE-projInfo .devE-siteLink') as HTMLElement | null;
              const linkShown = !!link && link.getBoundingClientRect().height > 0;
              return {
                name: (p.querySelector('h3 bdi')?.textContent || '').trim(),
                addKeyTop: btn ? btn.getBoundingClientRect().top - p.getBoundingClientRect().top : null,
                linkShown,
              };
            }),
          });
        }
        if (performance.now() - start < 4000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await this.open();
    await this.page.waitForFunction(
      () => {
        const l = (window as any).__dsLayout;
        return l && l.length && l[l.length - 1].t > 3000;
      },
      undefined,
      { timeout: t(15000) }
    );
  }

  async layoutSamples(): Promise<
    { t: number; projects: { name: string; addKeyTop: number | null; linkShown: boolean }[] }[]
  > {
    return this.page.evaluate(() => (window as any).__dsLayout ?? []);
  }

  /**
   * What a confirm window exposes to screen readers: its accessible name and description from
   * Chrome's accessibility tree, beside its visible title and body text (the window's text
   * without its heading, buttons and form fields).
   */
  async readWindow(kind: string): Promise<WindowA11y> {
    const win = this.confirmWindow();
    await expect(win).toHaveCount(1, { timeout: t(10000) });
    const { title, body } = await win.evaluate((el) => {
      const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
      const heading = el.querySelector('h1, h2, h3, h4, [role="heading"]');
      const copy = el.cloneNode(true) as HTMLElement;
      copy
        .querySelectorAll('h1, h2, h3, h4, [role="heading"], button, .sefaria-input, .devE-deleteActions')
        .forEach((n) => n.remove());
      // Blocks read as separate phrases, as in the accessible description.
      copy.querySelectorAll('p, li, ul, ol, div, br').forEach((n) => {
        n.before(' ');
        n.after(' ');
      });
      return { title: clean(heading?.textContent || ''), body: clean(copy.textContent || '') };
    });
    const client = await this.page.context().newCDPSession(this.page);
    try {
      const { root } = await client.send('DOM.getDocument', { depth: 0 });
      const { nodeId } = await client.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: '[role="alertdialog"], [role="dialog"]',
      });
      const { nodes } = await client.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
      const node = nodes[0] as any;
      const clean = (s: unknown) =>
        String(s ?? '')
          .replace(/\s+/g, ' ')
          .trim();
      return { kind, title, body, name: clean(node?.name?.value), description: clean(node?.description?.value) };
    } finally {
      await client.detach();
    }
  }
}
