import fs from 'fs';
import { test as setup } from '@playwright/test';
import {
  AUTH_DIR, AUTH_STATUS_FILE, accountKey, authFile, baseURLFor, loadManifest, maskSecrets, readPassword,
  resolveTarget, workersFor,
} from './env';
import { AuthStatus, logIn, prepareContext } from './session';

/**
 * Logs in every manifest account once and writes one storage state per account. A failed login is
 * recorded rather than fatal, so one broken account does not block every other suite; the
 * account fixture reports the recorded reason to any test that asks for that account.
 */
setup('log in every seeded api-keys account', async ({ browser }, testInfo) => {
  const target = resolveTarget();
  const manifest = loadManifest();
  const baseURL = baseURLFor(target);

  if (testInfo.config.workers > workersFor(target)) {
    throw new Error(
      `${testInfo.config.workers} workers requested; the ${target} target allows at most ${workersFor(target)}. ` +
      `The cauldron's Envoy fleet is shared by all of dev.`
    );
  }

  setup.setTimeout(Math.max(120000, manifest.accounts.length * 45000));
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const password = readPassword();
  const status: AuthStatus = {};
  const lang = (role: string) => (/hebrew/i.test(role) ? 'hebrew' : 'english') as 'hebrew' | 'english';

  for (const account of manifest.accounts) {
    const key = accountKey(account);
    if (account.suite === 'stack') continue;
    const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: target === 'cauldron' });
    try {
      await prepareContext(context, baseURL, 'english');
      const page = await context.newPage();
      await logIn(page, baseURL, account.email, password, account.id);
      const state = await context.storageState();
      state.cookies = state.cookies.map(c => (c.name === 'interfaceLang' ? { ...c, value: lang(account.role) } : c));
      fs.writeFileSync(authFile(account.suite, account.role), JSON.stringify(state, null, 2));
      status[key] = { ok: true, at: new Date().toISOString() };
    } catch (e: any) {
      const reason = maskSecrets(String(e?.message || e).split('\n')[0]);
      status[key] = { ok: false, reason, at: new Date().toISOString() };
      testInfo.annotations.push({ type: 'login-failed', description: `${key}: ${reason}` });
    } finally {
      await context.close();
    }
  }

  fs.writeFileSync(AUTH_STATUS_FILE, JSON.stringify(status, null, 2));
  const ok = Object.values(status).filter(s => s.ok).length;
  const failed = Object.entries(status).filter(([, s]) => !s.ok).map(([k]) => k);
  console.log(`[apikeys-setup] ${target} ${manifest.runId}: ${ok} logged in, ${failed.length} failed${failed.length ? ` (${failed.join(', ')})` : ''}`);
  if (ok === 0 && manifest.accounts.some(a => a.suite !== 'stack')) {
    throw new Error('No seeded account could log in. Check the stack is up and the password file matches the seed.');
  }
});
