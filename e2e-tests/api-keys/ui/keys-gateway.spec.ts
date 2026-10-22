import { test, expect, pageFetch } from '../fixtures';
import { findKey } from '../env';
import { readRegistry } from '../registry';
import { readAuthStatus } from '../session';
import { t } from '../../globals';
import {
  SITE_A, SITE_B, Probe, annotate, createKeyInUi, createProjectInUi, deleteProjectInUi, deleteProjectQuietly,
  isAllowed, isDenied, keyRow, openDeveloperSettings, poll, probeKey, probeSummary, readyMessage, revokeKeyInUi,
  saveWebsite, startKeyInUi, uniqueName, waitForDeveloperApi,
} from './keys-helpers';

/**
 * What a change made in the developer settings UI does at the gateway, and how fast. Each test
 * makes its own private project on the keys.setUp account and deletes it afterwards, so tests can
 * run in parallel. Timings are measured from the moment the browser receives the API answer.
 */

const PROPAGATION_MS = 1000;
/** The cauldron's Envoy fleet is shared by all of dev, so probes there are spaced further apart. */
const probeInterval = (target: { name: string }) => (target.name === 'cauldron' ? 100 : 25);

test.describe('keys x gateway', () => {
  test('A9a: a key revoked in the UI is refused with 401 api_key_invalid within 1 s (worst of 20)', async ({ account, gw, target }) => {
    test.setTimeout(t(600000));
    const { page } = await account('keys', 'setUp');
    const dev = await openDeveloperSettings(page);
    const name = uniqueName('E2E A9a');
    let projectId: string | undefined;
    const timings: { label: string; fromResponseMs?: number; fromClickMs?: number; registryMoved?: boolean }[] = [];
    try {
      projectId = await createProjectInUi(dev, name, SITE_A);
      for (let batch = 0; batch < 5; batch++) {
        const values = new Map<string, string>();
        for (let i = 1; i <= 4; i++) {
          const label = `A9a-${String(batch * 4 + i).padStart(2, '0')}`;
          const made = await pageFetch(page, `/api/developer/projects/${projectId}/keys`, { method: 'POST', body: { label } });
          expect(made.status, `create ${label}`).toBe(200);
          const project = made.json.projects.find((p: any) => p.id === projectId);
          values.set(label, project.keys.find((k: any) => k.id === made.json.keyId).value);
        }
        await page.reload({ waitUntil: 'domcontentloaded' });
        await dev.expandProject(name);
        const card = dev.projectCard(name);
        for (const [label, value] of values) {
          const ready = await poll(() => probeKey(gw, target, value), isAllowed, { timeoutMs: 10000, intervalMs: probeInterval(target) });
          expect(ready.elapsedMs, `${label} is accepted before the revoke: ${probeSummary(ready.last)}`).toBeDefined();

          const before = await readRegistry(target.name);
          const { clickedAt, respondedAt } = await revokeKeyInUi(dev, card, label);
          const denied = await poll(() => probeKey(gw, target, value), isDenied('api_key_invalid'), { startedAt: respondedAt, timeoutMs: 10000, intervalMs: probeInterval(target) });
          const after = before ? await readRegistry(target.name) : undefined;
          timings.push({
            label,
            fromResponseMs: denied.elapsedMs,
            fromClickMs: denied.elapsedMs === undefined ? undefined : denied.elapsedMs + (respondedAt - clickedAt),
            registryMoved: before && after ? after.version > before.version : undefined,
          });
          expect(denied.elapsedMs, `${label} still accepted 10 s after the revoke: ${probeSummary(denied.last)}`).toBeDefined();
          await expect(keyRow(card, label)).toHaveCount(0);
        }
      }
    } finally {
      annotate('A9a timings', JSON.stringify(timings));
      await deleteProjectQuietly(page, projectId);
    }
    const worst = Math.max(...timings.map(x => x.fromResponseMs ?? Infinity));
    annotate('A9a worst case', `${worst} ms from the API answer over ${timings.length} revocations`);
    expect(timings).toHaveLength(20);
    if (target.hasRegistry) {
      expect(timings.filter(x => x.registryMoved === false).map(x => x.label), 'registry version did not move').toEqual([]);
    }
    expect(worst, `worst revoke-to-401 time; all: ${JSON.stringify(timings)}`).toBeLessThanOrEqual(PROPAGATION_MS);
  });

  test('A9b: keys of a project deleted in the UI are refused with 401 within 1 s', async ({ account, gw, target }) => {
    test.setTimeout(t(180000));
    const { page } = await account('keys', 'setUp');
    const dev = await openDeveloperSettings(page);
    const name = uniqueName('E2E A9b');
    let projectId: string | undefined;
    try {
      projectId = await createProjectInUi(dev, name, SITE_A);
      const card = dev.projectCard(name);
      const keys = [await createKeyInUi(dev, card, 'A9b-1'), await createKeyInUi(dev, card, 'A9b-2')];
      for (const key of keys) {
        const ready = await poll(() => probeKey(gw, target, key.value), isAllowed, { timeoutMs: 10000, intervalMs: probeInterval(target) });
        expect(ready.elapsedMs, `${key.label} accepted before the delete: ${probeSummary(ready.last)}`).toBeDefined();
      }

      const { respondedAt } = await deleteProjectInUi(dev, card, name);
      const results = await Promise.all(keys.map(key =>
        poll(() => probeKey(gw, target, key.value), isDenied('api_key_invalid'), { startedAt: respondedAt, timeoutMs: 10000, intervalMs: probeInterval(target) })));
      annotate('A9b timings', JSON.stringify(results.map((r, i) => ({ label: keys[i].label, fromResponseMs: r.elapsedMs }))));
      await expect(dev.projectCard(name)).toHaveCount(0);
      results.forEach((r, i) => {
        expect(r.elapsedMs, `${keys[i].label} after the project delete: ${probeSummary(r.last)}`).toBeDefined();
        expect(r.elapsedMs!, `${keys[i].label} delete-to-401 time`).toBeLessThanOrEqual(PROPAGATION_MS);
      });
    } finally {
      await deleteProjectQuietly(page, projectId);
    }
  });

  test('A9c: a key created in the UI is accepted within 1 s of "Ready to use"', async ({ account, gw, target }) => {
    test.setTimeout(t(180000));
    const { page } = await account('keys', 'setUp');
    const dev = await openDeveloperSettings(page);
    const name = uniqueName('E2E A9c');
    let projectId: string | undefined;
    const timings: { label: string; afterReadyMs?: number; fromResponseMs?: number }[] = [];
    try {
      projectId = await createProjectInUi(dev, name, SITE_A);
      const card = dev.projectCard(name);
      for (const label of ['A9c-1', 'A9c-2', 'A9c-3']) {
        const created = await startKeyInUi(dev, card, label);
        const accepted = poll(() => probeKey(gw, target, created.value), isAllowed, { startedAt: created.respondedAt, timeoutMs: 15000, intervalMs: probeInterval(target) });
        await expect(readyMessage(card)).toHaveText('Ready to use. Copy it into your tool.', { timeout: t(20000) });
        const readyAt = Date.now();
        const result = await accepted;
        const acceptedAt = result.elapsedMs === undefined ? undefined : created.respondedAt + result.elapsedMs;
        timings.push({ label, fromResponseMs: result.elapsedMs, afterReadyMs: acceptedAt === undefined ? undefined : acceptedAt - readyAt });
        expect(result.elapsedMs, `${label} never accepted: ${probeSummary(result.last)}`).toBeDefined();
        expect(acceptedAt! - readyAt, `${label}: accepted this long after "Ready to use" (negative = before)`).toBeLessThanOrEqual(PROPAGATION_MS);
        await expect(readyMessage(card)).toHaveCount(0, { timeout: t(10000) });
      }
    } finally {
      annotate('A9c timings', JSON.stringify(timings));
      await deleteProjectQuietly(page, projectId);
    }
  });

  test('C4: the restriction follows the website; clearing it lifts the restriction and says so', async ({ account, gw, target }) => {
    test.setTimeout(t(180000));
    const { page } = await account('keys', 'setUp');
    const dev = await openDeveloperSettings(page);
    const name = uniqueName('E2E C4');
    const label = 'C4 key';
    let projectId: string | undefined;
    const timings: Record<string, number | undefined> = {};

    type Verdicts = { a: Probe; b: Probe; none: Probe };
    let keyValue = '';
    const verdicts = async (): Promise<Verdicts> => ({
      a: await probeKey(gw, target, keyValue, SITE_A),
      b: await probeKey(gw, target, keyValue, SITE_B),
      none: await probeKey(gw, target, keyValue),
    });
    const summary = (v: Verdicts) => `site-a: ${probeSummary(v.a)} | site-b: ${probeSummary(v.b)} | no origin: ${probeSummary(v.none)}`;
    const onlyFrom = (allowed: 'a' | 'b') => (v: Verdicts) =>
      isAllowed(v[allowed]) && isDenied('origin_not_allowed')(v[allowed === 'a' ? 'b' : 'a']) && isDenied('origin_not_allowed')(v.none);
    const anywhere = (v: Verdicts) => isAllowed(v.a) && isAllowed(v.b) && isAllowed(v.none);

    try {
      projectId = await createProjectInUi(dev, name, SITE_A);
      const card = dev.projectCard(name);
      keyValue = (await createKeyInUi(dev, card, label)).value;
      const unrestricted = await poll(verdicts, anywhere, { timeoutMs: 10000 });
      expect(unrestricted.elapsedMs, `new key works anywhere: ${summary(unrestricted.last)}`).toBeDefined();

      const toggle = dev.restrictionSwitch(card, label);
      const restricting = waitForDeveloperApi(dev.page, /\/api\/developer\/keys\/[^/]+$/);
      // The switch follows the server's answer, not the click, so check() would see no change.
      await toggle.click();
      expect((await restricting).status()).toBe(200);
      const restrictedAt = Date.now();
      await expect(toggle).toBeChecked();
      await expect(card.locator('.devPocRestrictionSummary code').last()).toHaveText(SITE_A);
      const toA = await poll(verdicts, onlyFrom('a'), { startedAt: restrictedAt, timeoutMs: 10000 });
      timings.restrict = toA.elapsedMs;
      expect(toA.elapsedMs, `restricted to site-a: ${summary(toA.last)}`).toBeDefined();

      const moved = await saveWebsite(dev, card, SITE_B);
      await expect(toggle).toBeChecked();
      await expect(card.locator('.devPocRestrictionSummary code').last()).toHaveText(SITE_B);
      const toB = await poll(verdicts, onlyFrom('b'), { startedAt: moved.respondedAt, timeoutMs: 10000 });
      timings.moveWebsite = toB.elapsedMs;
      expect(toB.elapsedMs, `restriction follows the website to site-b: ${summary(toB.last)}`).toBeDefined();

      const cleared = await saveWebsite(dev, card, '');
      await expect(page.locator('.devPocNotice[role="status"]').filter({ hasText: 'now works anywhere again' }))
        .toContainText(`${label} now works anywhere again, because the project no longer has a website.`);
      await expect(toggle).toHaveCount(0);
      await expect(keyRow(card, label).getByRole('button', { name: 'Add your website' })).toBeVisible();
      const free = await poll(verdicts, anywhere, { startedAt: cleared.respondedAt, timeoutMs: 10000 });
      timings.clearWebsite = free.elapsedMs;
      expect(free.elapsedMs, `clearing the website lifts the restriction: ${summary(free.last)}`).toBeDefined();

      for (const [step, ms] of Object.entries(timings)) {
        expect(ms!, `${step}: change-to-gateway time`).toBeLessThanOrEqual(PROPAGATION_MS);
      }
    } finally {
      annotate('C4 timings', JSON.stringify(timings));
      await deleteProjectQuietly(page, projectId);
    }
  });

  test('N-M6: deleting an account refuses its key with 401 api_key_invalid within 1 s', async ({ account, gw, target }) => {
    // Account deletion clears Mongo data first and revokes keys last; locally that takes minutes.
    test.setTimeout(t(900000));
    test.skip(target.name !== 'local', 'Deletes a seeded account; local stack only.');
    const status = readAuthStatus()?.accounts['account.toDelete'];
    test.skip(!status?.ok, 'account.toDelete has no session (deleted by an earlier run?): re-seed with --reset.');
    const value = findKey('account', 'toDelete').value;
    const before = await poll(() => probeKey(gw, target, value), isAllowed, { timeoutMs: 5000 });
    test.skip(before.elapsedMs === undefined && before.last.code === 'api_key_invalid',
      'The toDelete key is already refused (account deleted by an earlier run): re-seed with --reset.');
    expect(before.elapsedMs, `toDelete key accepted before the deletion: ${probeSummary(before.last)}`).toBeDefined();

    // There is no delete-account control in the settings UI on this branch; the page calls the
    // same endpoint the apps use, with its own session and CSRF token.
    const { page } = await account('account', 'toDelete');
    await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!(window as any).Sefaria?._uid, null, { timeout: t(30000) });
    const deleted = await pageFetch(page, '/api/account/delete', { method: 'DELETE' });
    const respondedAt = Date.now();
    expect(deleted.status, deleted.text.slice(0, 300)).toBe(200);
    expect(deleted.json).toEqual({ status: 'ok' });

    const refused = await poll(() => probeKey(gw, target, value), isDenied('api_key_invalid'), { startedAt: respondedAt, timeoutMs: 10000, intervalMs: probeInterval(target) });
    annotate('N-M6 timing', `${refused.elapsedMs} ms from the API answer`);
    expect(refused.elapsedMs, `key after the account deletion: ${probeSummary(refused.last)}`).toBeDefined();
    expect(refused.elapsedMs!).toBeLessThanOrEqual(PROPAGATION_MS);
  });
});
