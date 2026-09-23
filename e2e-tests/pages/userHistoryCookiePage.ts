import { Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { t } from '../globals';

/**
 * Drives the logged-out reading-history cookie (`user_history`).
 *
 * For a logged-out user, reading history has nowhere to live server-side, so
 * `Sefaria.saveUserHistory` (static/js/sefaria/sefaria.js) writes it to a cookie
 * instead. `Sefaria._trimUserHistoryForCookie` bounds that cookie to
 * `Sefaria.MAX_ANON_HISTORY_BYTES` so it can't push the request's combined
 * `Cookie:` header past what nginx accepts.
 *
 * This page object has no locators: the behavior under test is JS + cookie
 * state, with no DOM surface of its own. It still lives here rather than in the
 * spec so the browser-context plumbing stays out of the test body (CLAUDE.md §5).
 */
export class UserHistoryCookiePage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  /** True once the trimming code is present — guards against a stale bundle. */
  async isTrimmingCodeLoaded(): Promise<boolean> {
    return this.page.evaluate(
      () => typeof (window as any).Sefaria?._trimUserHistoryForCookie === 'function'
    );
  }

  /** The budget the app compiled with, so assertions track the source constant. */
  async maxHistoryBytes(): Promise<number> {
    return this.page.evaluate(() => (window as any).Sefaria.MAX_ANON_HISTORY_BYTES);
  }

  /** True when this page is running as a logged-out user. */
  async isLoggedOut(): Promise<boolean> {
    return this.page.evaluate(() => !(window as any).Sefaria._uid);
  }

  /**
   * Length of the raw `user_history` cookie value, in bytes.
   *
   * Read straight off `document.cookie`, which returns the value still
   * URL-encoded — the same form the browser transmits and the same form
   * `_trimUserHistoryForCookie` budgets against. Decoding first would
   * undercount, since Hebrew in `he_ref` expands ~6x once encoded.
   */
  async cookieBytes(): Promise<number> {
    return this.page.evaluate(() => {
      const raw = document.cookie.split('; ')
        .find(c => c.startsWith('user_history='))?.slice('user_history='.length);
      return raw ? raw.length : 0;
    });
  }

  /** Number of history entries currently held in the cookie. */
  async cookieEntryCount(): Promise<number> {
    return this.page.evaluate(() => {
      const raw = document.cookie.split('; ')
        .find(c => c.startsWith('user_history='))?.slice('user_history='.length);
      return raw ? JSON.parse(decodeURIComponent(raw)).length : 0;
    });
  }

  /** The `ref` of every entry in the cookie, newest first. */
  async cookieRefs(): Promise<string[]> {
    return this.page.evaluate(() => {
      const raw = document.cookie.split('; ')
        .find(c => c.startsWith('user_history='))?.slice('user_history='.length);
      return raw ? JSON.parse(decodeURIComponent(raw)).map((h: any) => h.ref) : [];
    });
  }

  /**
   * Save `count` history entries through the real `saveUserHistory` path.
   *
   * Saves are serialized deliberately. `saveUserHistory` is fire-and-forget: it
   * kicks off an async `Sefaria.getRef` lookup for the Hebrew ref and only reads
   * and rewrites the cookie once that resolves. Firing them concurrently would
   * let two writes read the same cookie and clobber each other, so each save
   * waits until its own ref surfaces at the head of the cookie before the next
   * one starts. That is a data dependency, not a sleep — no fixed delay is used
   * to "wait for state".
   */
  async saveHistoryEntries(count: number, timeoutPerEntry = t(15000)): Promise<void> {
    await this.page.evaluate(async ({ count, timeoutPerEntry }) => {
      const Sefaria = (window as any).Sefaria;

      const headRef = (): string | undefined => {
        const raw = document.cookie.split('; ')
          .find(c => c.startsWith('user_history='))?.slice('user_history='.length);
        if (!raw) { return undefined; }
        try { return JSON.parse(decodeURIComponent(raw))[0]?.ref; } catch { return undefined; }
      };

      for (let i = 1; i <= count; i++) {
        const ref = `Genesis ${i}:1`;
        Sefaria.saveUserHistory({ ref, book: 'Genesis', versions: {} });

        const deadline = Date.now() + timeoutPerEntry;
        while (headRef() !== ref) {
          if (Date.now() > deadline) {
            throw new Error(`Timed out waiting for "${ref}" to reach the user_history cookie`);
          }
          await new Promise(r => setTimeout(r, 25));
        }
      }
    }, { count, timeoutPerEntry });
  }

  /** Remove the cookie so a test starts from a known-empty state. */
  async clearHistoryCookie(): Promise<void> {
    await this.page.evaluate(() => {
      document.cookie = 'user_history=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      (window as any).Sefaria.userHistory = { loaded: false, items: [] };
    });
  }
}
