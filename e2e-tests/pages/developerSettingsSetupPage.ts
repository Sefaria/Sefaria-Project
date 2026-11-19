import { Locator, Page, Request, expect } from '@playwright/test';
import { DeveloperSettingsPage } from './developerSettingsPage';
import { t } from '../globals';

/** The server's daily limit on confirmation emails (powered_by/developer.py, CONFIRMATION_DAILY_LIMIT). */
export const DAILY_LINK_LIMIT = 5;

/** What the stand-in for POST /api/developer/confirmation answers. */
export type ConfirmationMock = 'sent' | 'daily-limit';

/** A live region: what a screen reader reads out when its text changes. */
const LIVE_REGION =
  '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], [role="timer"], [role="marquee"]';

/**
 * Developer Settings for the setup, confirmation email, sign-in, Hebrew and phone stories
 * (DS-SETUP-*, DS-EMAIL-*, DS-NAV-1, DS-HE-1, DS-PHONE-1, DS-A11Y-3).
 *
 * Confirmation emails are never really sent from here, except by sendRealConfirmation() (DS-SETUP-3):
 * mockConfirmation() answers the browser's POST /api/developer/confirmation the way the server would
 * (powered_by/developer_views.py confirmation_api, state_response; the 429 from developer_api).
 */
export class DeveloperSettingsSetupPage extends DeveloperSettingsPage {
  /** Sends the stand-in has answered (each one a "link sent"). */
  confirmationPosts = 0;

  constructor(page: Page, language: string) {
    super(page, language);
  }

  // --- Locators ----------------------------------------------------------------------------

  getStartedButton(): Locator {
    return this.root().locator('[data-agent-action="get-started"]');
  }

  sendButton(): Locator {
    return this.root().locator('[data-agent-action="send-confirmation"]');
  }

  resendButton(): Locator {
    return this.root().locator('[data-agent-action="resend-confirmation"]');
  }

  /** The welcome screen's numbered steps. */
  welcomeSteps(): Locator {
    return this.root().getByRole('list').first().getByRole('listitem');
  }

  // --- The network ---------------------------------------------------------------------------

  private origin(): string {
    return new URL(this.page.url()).origin;
  }

  private async csrf(): Promise<string> {
    const cookies = await this.page.context().cookies(this.origin());
    const token = cookies.find((c) => c.name === 'csrftoken')?.value;
    if (!token) throw new Error('No csrftoken cookie: open a Sefaria page before calling the developer API.');
    return token;
  }

  private async stateJson(): Promise<Record<string, unknown>> {
    const r = await this.page.request.get(`${this.origin()}/api/developer/state`);
    expect(r.status(), 'GET /api/developer/state').toBe(200);
    return r.json();
  }

  /**
   * Answers the browser's POST /api/developer/confirmation in place of the server, so no email goes out
   * (staging allows 5 a day per account, one a minute):
   * - 'sent': 200 with the account's real state plus the send time, as state_response() returns after a send.
   * - 'daily-limit': 429 with the server's daily-limit message and a Retry-After, as developer_api() returns.
   * The fake clock is paused as the answer goes back, so the 60-second countdown moves only with tick().
   */
  async mockConfirmation(mode: ConfirmationMock): Promise<void> {
    await this.page.clock.install();
    await this.page.route(
      (url) => url.pathname === '/api/developer/confirmation',
      async (route, request: Request) => {
        if (request.method() !== 'POST') return route.continue();
        const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
        if (mode === 'daily-limit') {
          return route.fulfill({
            status: 429,
            contentType: 'application/json',
            headers: { ...headers, 'Retry-After': String(6 * 60 * 60) },
            body: JSON.stringify({
              error: `You've asked for ${DAILY_LINK_LIMIT} links today. Try again tomorrow, or contact hello@sefaria.org.`,
            }),
          });
        }
        const state = await this.stateJson();
        this.confirmationPosts += 1;
        // The page's own clock: the countdown and the "link is live" check both read it.
        const now = await this.page.evaluate(() => Date.now());
        await this.page.clock.pauseAt(now + 500);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({ ...state, confirmationSentAt: new Date(now).toISOString().replace('Z', '+00:00') }),
        });
      }
    );
  }

  /** Moves the page's paused clock on. */
  async tick(ms: number): Promise<void> {
    await this.page.clock.runFor(ms);
  }

  /**
   * Really emails the account a confirmation link through the developer API, unless a link sent in the
   * last 3 days is still out. Waits out the one-a-minute limit if a link went out moments ago.
   * Returns whether an email was sent.
   */
  async ensureLiveConfirmationLink(onWait: (ms: number) => void): Promise<boolean> {
    const state = await this.stateJson();
    const sentAt = state.confirmationSentAt as string | null;
    if (sentAt && Date.now() - Date.parse(sentAt) < 3 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000) return false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await this.page.request.post(`${this.origin()}/api/developer/confirmation`, {
        headers: { 'X-CSRFToken': await this.csrf(), Referer: this.origin() + DeveloperSettingsPage.PATH },
      });
      if (r.status() === 200) return true;
      const body = await r.text();
      if (r.status() === 429 && !/today/.test(body) && attempt === 0) {
        const wait = (Number(r.headers()['retry-after'] ?? 60) + 1) * 1000;
        onWait(wait);
        await this.page.waitForTimeout(wait); // the server's one-a-minute limit: real time, by design
        continue;
      }
      const why =
        r.status() === 500 && /ConnectionRefused|SMTP/i.test(body)
          ? ' (the server could not send the email: no mail server)'
          : '';
      throw new Error(`POST /api/developer/confirmation: ${r.status()}${why} ${body.slice(0, 200)}`);
    }
    return true;
  }

  // --- Actions -------------------------------------------------------------------------------

  async clickGetStarted(): Promise<void> {
    await expect(this.getStartedButton()).toBeVisible({ timeout: t(15000) });
    await this.getStartedButton().click();
  }

  async clickSend(): Promise<void> {
    await expect(this.sendButton()).toBeVisible({ timeout: t(15000) });
    await this.sendButton().click();
  }

  // --- Assertions: setup and the confirmation email ------------------------------------------

  async expectWelcomeSteps(keys: string[]): Promise<void> {
    // Each item is its number (in a circle) and then the step's name.
    const items: RegExp[] = [];
    for (const [i, key] of keys.entries()) {
      const name = (await this.str(key)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      items.push(new RegExp(`^${i + 1}\\s*${name}$`));
    }
    await expect(this.welcomeSteps()).toHaveText(items, { timeout: t(15000) });
  }

  async expectOneButton(name: string): Promise<void> {
    await expect(this.root().getByRole('button', { name, exact: true })).toHaveCount(1, { timeout: t(15000) });
    await expect(this.getStartedButton()).toHaveCount(1);
    await expect(this.getStartedButton()).toHaveAccessibleName(name);
  }

  async expectResendWaiting(seconds: number): Promise<void> {
    await expect(this.resendButton()).toBeDisabled();
    await expect(this.resendButton()).toHaveText(
      await this.str('developer.common.resend_wait.button', { wait: seconds })
    );
  }

  async expectResendReady(): Promise<void> {
    await expect(this.resendButton()).toBeEnabled();
    await expect(this.resendButton()).toHaveText(await this.str('developer.common.resend.button'));
  }

  /** No back arrow, "Back to settings" or other way to the step before. */
  async expectNoWayBack(): Promise<void> {
    await expect(this.stepTitle()).toBeVisible();
    for (const key of [
      'developer.common.back_to_settings.button',
      'developer.frame.step_back.aria',
      'developer.common.projects_and_keys.header',
    ]) {
      await expect(this.root().getByRole('button', { name: await this.str(key) })).toHaveCount(0);
    }
    await expect(this.root().locator('.devE-back, .devE-stepBack, .devE-ghostBtn, img[src*="arrow-left"]')).toHaveCount(
      0
    );
  }

  /** The error line for `text`, under `button`. */
  async expectErrorUnder(button: Locator, text: string): Promise<void> {
    const error = this.root().getByRole('alert').filter({ hasText: text });
    await expect(error).toHaveText(text, { timeout: t(15000) });
    await expect(error).not.toContainText('{');
    const b = (await button.boundingBox())!;
    const e = (await error.boundingBox())!;
    expect(e.y, 'the error sits under the button').toBeGreaterThanOrEqual(b.y + b.height - 1);
  }

  // --- Assertions: screen readers ------------------------------------------------------------

  /** The text of every live region on the page. */
  async liveRegionTexts(): Promise<string[]> {
    return this.page.evaluate(
      (sel) =>
        Array.from(document.querySelectorAll(sel)).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()),
      LIVE_REGION
    );
  }

  /** Whether `locator` is, or is inside, a live region. */
  async inLiveRegion(locator: Locator): Promise<boolean> {
    return locator.evaluate((el, sel) => !!el.closest(sel), LIVE_REGION);
  }

  // --- Sign-in -------------------------------------------------------------------------------

  async expectLoginNotice(header: string): Promise<void> {
    await expect(this.page).toHaveURL(/\/login\?next=%2Fsettings%2Fdeveloper|\/login\?next=\/settings\/developer/, {
      timeout: t(15000),
    });
    await expect(this.page.getByText(header, { exact: true })).toBeVisible({ timeout: t(15000) });
  }

  async expectInDeveloperSettings(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`^https?://[^/]+${DeveloperSettingsPage.PATH}/?([?#]|$)`), {
      timeout: t(20000),
    });
    await expect(this.root()).toBeVisible({ timeout: t(20000) });
  }

  /** From the login page, the card's "Sign up" link, then the email sign-up form. */
  async openEmailSignupFromLogin(): Promise<void> {
    await this.page
      .locator('main, #content, body')
      .first()
      .getByRole('link', { name: /^sign up$/i })
      .last()
      .click();
    await expect(this.page).toHaveURL(/\/register/, { timeout: t(15000) });
  }

  /** Where the sign-up form sends a new account: the page's ?next=. */
  signupDestination(): string | null {
    const u = new URL(this.page.url());
    return u.pathname === '/register' ? u.searchParams.get('next') : null;
  }

  // --- Hebrew ----------------------------------------------------------------------------------

  /** The open window, if any, else the Developer Settings content. */
  private screen(): Locator {
    return this.page.getByRole('alertdialog').or(this.page.getByRole('dialog')).or(this.root()).first();
  }

  /**
   * Every developer.* string has a Hebrew value, and the screen shows no raw key, no {placeholder} and no
   * Developer Settings copy in English (multi-word English strings that differ from their Hebrew).
   */
  async expectHebrewStrings(where: string): Promise<void> {
    const text =
      (await this.root().innerText()) + '\n' + (await this.page.getByRole('alertdialog').allInnerTexts()).join('\n');
    const found = await this.page.evaluate((shown) => {
      const maps = (window as any).Sefaria._i18nInterfaceStrings;
      const strip = (s: string) =>
        String(s)
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      const keys = Object.keys(maps.en).filter((k) => k.startsWith('developer.'));
      const missing = keys.filter((k) => !maps.he[k] || !String(maps.he[k]).trim());
      const flat = shown.replace(/\s+/g, ' ');
      const english = keys.filter((k) => {
        const en = strip(maps.en[k]);
        const he = strip(maps.he[k] || '');
        return (
          !/\.url$/.test(k) &&
          !/[{}]/.test(en) &&
          en.split(' ').length >= 2 &&
          en !== he &&
          !he.includes(en) &&
          flat.includes(en)
        );
      });
      const raw = flat.match(/\bdeveloper\.[a-z0-9_]+\.[a-z0-9_.]+/g) || [];
      const placeholders = flat.match(/\{[a-z_]+\}/g) || [];
      return { missing, english: english.map((k) => `${k}: ${strip(maps.en[k])}`), raw, placeholders };
    }, text);
    expect(found.missing, 'developer strings with no Hebrew value').toEqual([]);
    expect(found.raw, `raw key names on ${where}`).toEqual([]);
    expect(found.placeholders, `unfilled {placeholders} on ${where}`).toEqual([]);
    expect(found.english, `English copy on ${where}`).toEqual([]);
  }

  /**
   * Every block of text on the screen is right-aligned: its text-align resolves to the right, whatever the
   * direction of its own words (an English project or key name, dir=auto, is still aligned right).
   */
  async expectRightAligned(where: string): Promise<void> {
    const wrong = await this.screen().evaluate((root) => {
      const out: string[] = [];
      const seen = new Set<Element>();
      const blocky = /^(block|list-item|table-cell|inline-block|flow-root)$/;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent || !node.textContent.trim()) continue;
        let el = node.parentElement;
        if (!el || el.closest('button, [role="button"], a, input, select, textarea, .sr-only, [aria-hidden="true"]'))
          continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || !el.checkVisibility()) continue;
        while (el && !blocky.test(getComputedStyle(el).display)) el = el.parentElement;
        if (!el || seen.has(el)) continue;
        seen.add(el);
        const cs = getComputedStyle(el);
        // Text that fills its line has nowhere to be aligned to.
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const room = box.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - text.width;
        if (room < 4) continue;
        const a = cs.textAlign;
        const right =
          a === 'right' ||
          a === '-webkit-right' ||
          (a === 'start' && cs.direction === 'rtl') ||
          (a === 'end' && cs.direction === 'ltr');
        if (!right)
          out.push(
            `${el.tagName.toLowerCase()}.${el.className} (${a}, ${cs.direction}): ${(el.textContent || '').trim().slice(0, 40)}`
          );
      }
      return out;
    });
    expect(wrong, `text not right-aligned on ${where}`).toEqual([]);
  }

  /** The text of `locator` ends at its block's right edge. */
  async expectTextAtRight(locator: Locator): Promise<void> {
    const gap = await locator.evaluate((el) => {
      let block: HTMLElement | null = el as HTMLElement;
      while (block && !/^(block|list-item|table-cell|flex|grid)$/.test(getComputedStyle(block).display))
        block = block.parentElement;
      const range = document.createRange();
      range.selectNodeContents(el);
      const text = range.getBoundingClientRect();
      const box = block!.getBoundingClientRect();
      const cs = getComputedStyle(block!);
      return box.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth) - text.right;
    });
    expect(Math.abs(gap), 'distance from the text to the right edge').toBeLessThanOrEqual(2);
  }

  /** Each back arrow on the screen is drawn mirrored, so it points right. */
  async expectBackArrowsPointRight(): Promise<void> {
    const arrows = this.root().locator(
      '.devE-back img, .devE-stepBack .devE-arrow, .devE-ghostBtn svg, img[src*="arrow-left"]'
    );
    await expect(arrows.first()).toBeVisible({ timeout: t(15000) });
    const directions = await arrows.evaluateAll((els) =>
      els
        .filter((el) => (el as HTMLElement).getBoundingClientRect().width > 0)
        .map((el) => {
          // The icons are left-pointing arrows: a mirrored one (negative x scale, here or above) points right.
          let sign = 1;
          for (let e: Element | null = el; e; e = e.parentElement) {
            const tr = getComputedStyle(e).transform;
            if (tr && tr !== 'none') sign *= Math.sign(new DOMMatrixReadOnly(tr).a) || 1;
          }
          return sign < 0 ? 'right' : 'left';
        })
    );
    expect(directions.length, 'back arrows on the screen').toBeGreaterThan(0);
    expect(directions).toEqual(directions.map(() => 'right'));
  }

  /** In the open window's list of key names, each bullet is on the right. */
  async expectListBulletsRight(): Promise<void> {
    const items = this.page.getByRole('alertdialog').getByRole('listitem');
    await expect(items.first()).toBeVisible({ timeout: t(15000) });
    const sides = await items.evaluateAll((els) =>
      els.map((li) => {
        const cs = getComputedStyle(li);
        const list = getComputedStyle(li.parentElement!);
        const hasBullet = cs.display === 'list-item' && cs.listStyleType !== 'none';
        // An outside bullet sits on the start side of its item, in the item's direction, in the list's padding.
        const side = cs.direction === 'rtl' ? 'right' : 'left';
        const room = parseFloat(side === 'right' ? list.paddingRight : list.paddingLeft);
        return hasBullet && room > 0 ? side : `no bullet room (${cs.listStyleType}, ${side} ${room}px)`;
      })
    );
    expect(sides).toEqual(sides.map(() => 'right'));
  }

  /** The "Signed in as" box: the email in its own left-to-right run, "(" just left of it and ")" just right. */
  async expectSignedInEmail(email: string): Promise<void> {
    const label = await this.str('developer.common.signed_in_as.note');
    const box = this.root().locator('p').filter({ hasText: label });
    await expect(box).toBeVisible({ timeout: t(15000) });
    const text = (await box.innerText()).replace(/\s+/g, ' ');
    expect(text.split('(').length - 1, 'opening parentheses').toBe(1);
    expect(text.split(')').length - 1, 'closing parentheses').toBe(1);
    const layout = await box.evaluate((p, address) => {
      // Every character of the box's text, with the text node and offset it is drawn from.
      const chars: { node: Text; at: number }[] = [];
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        for (let i = 0; i < n.data.length; i++) chars.push({ node: n, at: i });
      }
      const s = chars.map((c) => c.node.data[c.at]).join('');
      const rect = (i: number) => {
        const r = document.createRange();
        r.setStart(chars[i].node, chars[i].at);
        r.setEnd(chars[i].node, chars[i].at + 1);
        return r.getBoundingClientRect();
      };
      const at = s.indexOf(address);
      if (at < 0) return null;
      const open = s.lastIndexOf('(', at);
      const close = s.indexOf(')', at + address.length);
      if (open < 0 || close < 0) return { text: s };
      const first = rect(at);
      const last = rect(at + address.length - 1);
      return {
        direction: getComputedStyle(chars[at].node.parentElement!).direction,
        emailLtr: first.left < last.left,
        openLeft: rect(open).right <= first.left + 1,
        closeRight: rect(close).left >= last.right - 1,
      };
    }, email);
    expect(layout, 'the email in the "Signed in as" box').not.toBeNull();
    expect(layout).toMatchObject({ direction: 'ltr', emailLtr: true, openLeft: true, closeRight: true });
  }

  // --- Phones ----------------------------------------------------------------------------------

  /** Visible controls (in `within`) smaller than 44 x 44, leaving out links inside a sentence. */
  async smallTapTargets(within = '.devPocPage'): Promise<string[]> {
    return this.page.evaluate((selector) => {
      const root = document.querySelector(selector)!;
      const controls = root.querySelectorAll(
        'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="switch"], [role="checkbox"], [role="link"], [tabindex]:not([tabindex="-1"])'
      );
      const out: string[] = [];
      for (const el of Array.from(controls) as HTMLElement[]) {
        // A visually hidden input is tapped through its label.
        let target: HTMLElement = el;
        if (el instanceof HTMLInputElement) {
          const label = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
          const r = el.getBoundingClientRect();
          if (label && (r.width < 2 || r.height < 2 || getComputedStyle(el).opacity === '0'))
            target = label as HTMLElement;
        }
        const r = target.getBoundingClientRect();
        if (!r.width || !r.height || !target.checkVisibility({ checkVisibilityCSS: true } as any)) continue;
        // Visually hidden (screen-reader only), here or in a clipped ancestor.
        let hidden = false;
        for (let e: HTMLElement | null = target; e && !hidden; e = e.parentElement) {
          const cs = getComputedStyle(e);
          const box = e.getBoundingClientRect();
          hidden =
            cs.clip === 'rect(0px, 0px, 0px, 0px)' ||
            /inset\(50%\)/.test(cs.clipPath) ||
            (box.width <= 1 && box.height <= 1 && cs.overflow === 'hidden');
        }
        if (hidden) continue;
        if (el.tagName === 'A' || el.classList.contains('devE-inlineLink')) {
          // Inside a sentence: its block has words of its own besides the links.
          let block: HTMLElement | null = el.parentElement;
          while (block && /^inline/.test(getComputedStyle(block).display)) block = block.parentElement;
          if (block) {
            const clone = block.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('a, button, .sr-only').forEach((c) => c.remove());
            if ((clone.textContent || '').trim()) continue;
          }
        }
        if (r.width < 44 - 0.5 || r.height < 44 - 0.5) {
          const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || '')
            .trim()
            .slice(0, 30);
          out.push(`${el.tagName.toLowerCase()} "${name}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      return out;
    }, within);
  }

  /** Each key in `labels` is its own box, its Created line above its Limit row. */
  async expectKeyCards(projectName: string, labels: string[]): Promise<void> {
    const created = await this.str('developer.home.keys_table.created.label');
    const limit = await this.str('developer.home.keys_table.restrict.label');
    const boxes = [];
    for (const label of labels) {
      const row = this.keyRow(projectName, label);
      await expect(row).toBeVisible({ timeout: t(15000) });
      const look = await row.evaluate((el) => {
        const cs = getComputedStyle(el);
        const edge = ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat((cs as any)[`border${s}Width`]) > 0);
        return {
          display: cs.display,
          framed: edge || cs.boxShadow !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)',
        };
      });
      expect(look.display, `key ${label} is laid out as a box, not a table row`).not.toBe('table-row');
      expect(look.framed, `key ${label} has an edge of its own`).toBe(true);
      const c = (await row.locator(`td[data-l="${created}"]`).boundingBox())!;
      const l = (await row.locator(`td[data-l="${limit}"]`).boundingBox())!;
      expect(c, `key ${label}'s Created`).not.toBeNull();
      expect(l.y, `key ${label}: Created above the Limit row`).toBeGreaterThanOrEqual(c.y + c.height - 1);
      boxes.push((await row.boundingBox())!);
    }
    boxes.sort((a, b) => a.y - b.y);
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].y, 'key boxes do not overlap').toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height - 1);
    }
  }

  /** The header's links are hidden; a "Resources" section under the projects has them. */
  async expectResourcesAtBottom(header: string): Promise<void> {
    const resources = this.root().getByRole('region', { name: header, exact: true });
    await expect(resources).toBeVisible({ timeout: t(15000) });
    await expect(resources.getByRole('heading', { name: header })).toBeVisible();
    const docs = await this.str('developer.common.docs.link');
    await expect(resources.getByRole('link', { name: new RegExp(docs) })).toBeVisible();
    await expect(
      this.root()
        .locator('.devPocPageHeader')
        .getByRole('link', { name: new RegExp(docs) })
    ).toBeHidden();
    // Below every other part of Developer Settings.
    const above = await resources.evaluate((res) => {
      const root = res.closest('.devPocPage')!;
      const top = res.getBoundingClientRect().top;
      return Array.from(root.children)
        .filter((el) => el !== res && el.getBoundingClientRect().height > 0)
        .map((el) => el.getBoundingClientRect().bottom - top);
    });
    expect(Math.max(...above), 'Resources comes after the rest of the page').toBeLessThanOrEqual(1);
  }

  /** Hovering and tapping `button` opens no tooltip; the reason shows as text under it. */
  async expectReasonUnder(button: Locator, reason: string): Promise<void> {
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled, so it can still be pointed at and tapped.
    await button.hover({ force: true });
    await button.tap({ force: true });
    await expect(this.page.getByRole('tooltip')).toHaveCount(0);
    await expect(this.root().locator('.devE-tip:visible')).toHaveCount(0);
    const id = await button.getAttribute('aria-describedby');
    expect(id, 'the button points to its reason').toBeTruthy();
    const note = this.root().locator(`[id="${id}"]`);
    await expect(note).toBeVisible();
    await expect(note).toHaveText(reason);
    const b = (await button.boundingBox())!;
    const n = (await note.boundingBox())!;
    expect(n.y, 'the reason sits under the button').toBeGreaterThanOrEqual(b.y + b.height - 1);
  }

  /** The open confirm window: 16px from each side of the screen, its buttons full width, one per row. */
  async expectPhoneConfirmWindow(): Promise<void> {
    const dialog = this.page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: t(15000) });
    const frame = await dialog.evaluate((stage) => {
      const box = (stage.querySelector('section') || stage) as HTMLElement;
      const r = box.getBoundingClientRect();
      const cs = getComputedStyle(box);
      const inner = { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight) };
      const buttons = Array.from(box.querySelectorAll('button'))
        .filter((b) => b.getBoundingClientRect().width > 0)
        .map((b) => {
          const br = b.getBoundingClientRect();
          return { left: br.left, right: br.right, top: br.top, bottom: br.bottom };
        });
      return { left: r.left, right: window.innerWidth - r.right, inner, buttons };
    });
    expect(Math.round(frame.left), 'space left of the window').toBe(16);
    expect(Math.round(frame.right), 'space right of the window').toBe(16);
    expect(frame.buttons.length, 'buttons in the window').toBeGreaterThan(1);
    const sorted = [...frame.buttons].sort((a, b) => a.top - b.top);
    sorted.forEach((b, i) => {
      expect(Math.abs(b.left - frame.inner.left), `button ${i + 1} starts at the window's edge`).toBeLessThanOrEqual(1);
      expect(Math.abs(b.right - frame.inner.right), `button ${i + 1} ends at the window's edge`).toBeLessThanOrEqual(1);
      if (i) expect(b.top, `button ${i + 1} is under button ${i}`).toBeGreaterThanOrEqual(sorted[i - 1].bottom - 1);
    });
  }
}
