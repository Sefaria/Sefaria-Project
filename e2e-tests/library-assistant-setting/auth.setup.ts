import fs from 'fs';
import path from 'path';
import { test as setup } from '@playwright/test';
import { accounts, authFile, logIn, suppressOverlays } from './harness';

/**
 * One login per seeded account, before any worker starts, into a storage-state file the
 * workers only ever read. Same model as the main suite's `global-setup.ts`, expressed as a
 * Playwright setup project so the spec project can declare a dependency on it.
 */
setup('log in every seeded cohort account', async ({ browser }) => {
  setup.setTimeout(120000);

  const dir = path.join(__dirname, '.auth');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  for (const a of accounts()) {
    const context = await browser.newContext();
    await suppressOverlays(context);
    const page = await context.newPage();
    await logIn(page, a.email, a.password);
    await context.storageState({ path: authFile(a.key) });
    await context.close();
  }
});
