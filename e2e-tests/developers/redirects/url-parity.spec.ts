import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang } from '../../utils';
import { LANGUAGES } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { developersUrl } from '../../pages/developers/developersCommon';
import fs from 'fs';
import path from 'path';

// URL parity with live (PLAN §6.4). live-urls.json was recorded once from live developers.sefaria.org
// (GET, redirects not followed) by build_live_urls.py. The portal must answer every entry with the
// recorded status and, for a redirect, the recorded Location, except the entries of its `deviations`
// table, which answer as that table says (each has its reason). The pytest twin is
// devportal/tests/url_parity_test.py.

type Entry = { path: string; sources: string[]; status: number; location: string | null };
type Deviation = { status: number; location?: string | null; locationEndsWith?: string; reason: string };

const liveUrls = JSON.parse(fs.readFileSync(path.join(__dirname, 'live-urls.json'), 'utf8'));
const ENTRIES = liveUrls.entries as Entry[];
const DEVIATIONS = liveUrls.deviations as Record<string, Deviation>;
const PORTAL_ORIGIN = new URL(developersUrl('/')).origin;

/** A Location as a comparable string: same-host targets as path + query, others as absolute URLs. */
function normalizeLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const url = new URL(location, `${PORTAL_ORIGIN}/`);
  return url.origin === PORTAL_ORIGIN ? `${url.pathname}${url.search}` : url.toString();
}

function expectation(entry: Entry) {
  const deviation = DEVIATIONS[entry.path];
  if (!deviation) return { status: entry.status, location: normalizeLocation(entry.location), endsWith: null };
  return {
    status: deviation.status,
    location: deviation.locationEndsWith ? null : normalizeLocation(deviation.location),
    endsWith: deviation.locationEndsWith ?? null,
  };
}

const GROUPS: { id: string; source: string; title: string }[] = [
  { id: 'DEV-RDR-002', source: 'sitemap', title: 'the 129 sitemap URLs answer as on live' },
  { id: 'DEV-RDR-003', source: 'llms', title: 'the llms.txt page URLs answer as on live' },
  { id: 'DEV-RDR-004', source: 'md-variant', title: 'the .md variant of every page answers as on live' },
  { id: 'DEV-RDR-005', source: 'machine', title: 'the machine and agent endpoints answer as on live' },
  { id: 'DEV-RDR-006', source: 'atlas-redirects', title: 'the redirect and legacy URL table answers as on live' },
  {
    id: 'DEV-RDR-007',
    source: 'static-llms',
    title: "the developers URLs in the main site's llms.txt answer as on live",
  },
  { id: 'DEV-RDR-008', source: 'hidden', title: 'hidden pages answer at their URLs as on live' },
  { id: 'DEV-RDR-009', source: 'variants', title: 'trailing-slash and /v1.0 variants answer as on live' },
];

test.describe('Developers Redirects, English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, developersUrl('/'), LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
  });

  async function assertParity(entries: Entry[]) {
    expect(entries.length).toBeGreaterThan(0);
    const copyPage = pm.onDevelopersCopyPage();
    for (const entry of entries) {
      const want = expectation(entry);
      const got = await copyPage.httpGet(entry.path);
      const location = normalizeLocation(got.headers['location']);
      expect.soft(got.status, `${entry.path} status (Location ${location})`).toBe(want.status);
      if (want.endsWith) {
        expect
          .soft(location ? new URL(location, `${PORTAL_ORIGIN}/`).pathname : '', `${entry.path} Location`)
          .toMatch(new RegExp(`${want.endsWith.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
      } else {
        expect.soft(location, `${entry.path} Location`).toBe(want.location);
      }
    }
  }

  test(
    'DEV-RDR-001: /docs, /reference, /docs/getting-started and /v1.0/docs/welcome redirect as specified',
    { tag: ['@sanity', '@pr'] },
    async () => {
      const core = ['/docs', '/reference', '/docs/getting-started', '/v1.0/docs/welcome'];
      const entries = ENTRIES.filter((entry) => core.includes(entry.path));
      expect(entries).toHaveLength(core.length);
      await assertParity(entries);
    }
  );

  for (const group of GROUPS) {
    test(`${group.id}: ${group.title}`, async () => {
      test.slow();
      await assertParity(ENTRIES.filter((entry) => entry.sources.includes(group.source)));
    });
  }
});
