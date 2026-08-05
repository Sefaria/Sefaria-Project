import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

/**
 * UHC — logged-out `user_history` cookie size.
 *
 * A logged-out user's reading history is kept in a cookie rather than the
 * database. The browser sends that cookie on every request, sharing one
 * ~8kB `Cookie:` header with sessionid, csrftoken, _ga and the rest; overrunning
 * it returns `400 Request Header Or Cookie Too Large` from nginx before Django
 * runs. `Sefaria._trimUserHistoryForCookie` caps the value at
 * `Sefaria.MAX_ANON_HISTORY_BYTES` before writing it.
 *
 * These tests must run logged OUT — `saveUserHistory` only touches the cookie
 * when `Sefaria._uid` is falsy; a logged-in user POSTs to /api/profile/sync
 * instead. Hence `goToPageWithLang`, not `goToPageWithUser`.
 */
test.describe('Library — logged-out user_history cookie', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);

    // A stale webpack bundle serves the pre-fix code and every assertion below
    // becomes meaningless, so fail loudly and specifically instead.
    expect(
      await pm.onUserHistoryCookie().isTrimmingCodeLoaded(),
      'Sefaria._trimUserHistoryForCookie missing — the target is serving a bundle without the cookie-trimming fix'
    ).toBe(true);
    expect(await pm.onUserHistoryCookie().isLoggedOut()).toBe(true);

    await pm.onUserHistoryCookie().clearHistoryCookie();
  });

  test('UHC-001: cookie stays between 2kB and 3kB after 40 history saves', async () => {
    // 40 sequential saves, each waiting on its own Sefaria.getRef round-trip.
    test.setTimeout(t(120000));

    await pm.onUserHistoryCookie().saveHistoryEntries(40);

    const bytes = await pm.onUserHistoryCookie().cookieBytes();
    const budget = await pm.onUserHistoryCookie().maxHistoryBytes();

    // Upper bound is the contract: the trim must never let the value exceed the
    // budget. Lower bound proves the cookie actually filled up — a trim bug that
    // dropped everything would also satisfy "under 3kB".
    expect(bytes).toBeLessThan(3000);
    expect(bytes).toBeLessThanOrEqual(budget);
    expect(bytes).toBeGreaterThan(2000);
  });

  test('UHC-002: cookie stops growing once the budget is reached', async () => {
    test.setTimeout(t(120000));

    await pm.onUserHistoryCookie().saveHistoryEntries(20);
    const bytesAfter20 = await pm.onUserHistoryCookie().cookieBytes();
    const countAfter20 = await pm.onUserHistoryCookie().cookieEntryCount();

    await pm.onUserHistoryCookie().saveHistoryEntries(20);
    const bytesAfter40 = await pm.onUserHistoryCookie().cookieBytes();
    const countAfter40 = await pm.onUserHistoryCookie().cookieEntryCount();

    // Saving twice as much must not store twice as much: the cookie is capped,
    // so entries are evicted rather than accumulated.
    expect(bytesAfter40).toBeLessThan(3000);
    expect(countAfter40).toBeLessThanOrEqual(countAfter20 + 1);
    expect(bytesAfter20).toBeGreaterThan(2000);
  });

  test('UHC-003: newest entries are kept and oldest are evicted', async () => {
    test.setTimeout(t(120000));

    await pm.onUserHistoryCookie().saveHistoryEntries(40);
    const refs = await pm.onUserHistoryCookie().cookieRefs();

    // saveHistoryEntries writes Genesis 1:1 .. Genesis 40:1 in order, so the
    // most recent save must be at the head and the first must be long gone.
    expect(refs[0]).toBe('Genesis 40:1');
    expect(refs).not.toContain('Genesis 1:1');
    expect(refs.length).toBeLessThan(40);
  });
});
