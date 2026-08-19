/**
 * REFERENCE TEMPLATE — not used by any spec, not collected by any Playwright project
 * (the chrome-strapi project only matches /strapi-.*\.spec\.js/).
 *
 * This is the original, generic version of `strapi.fixtures.js`, kept because its instructions
 * describe the FULL three-axis setup (locale separation + country targeting + date states) with
 * `TODO` slots to fill in. The live `strapi.fixtures.js` has since been narrowed to the content
 * actually published in the local Strapi instance (a single English modal).
 *
 * Use this file as the starting point when you publish more content (banners, sidebar ads,
 * country-targeted or expired items) and want to re-record a richer fixture.
 *
 * ---------------------------------------------------------------------------------------------
 *
 * Shared descriptor + setup helpers for the Strapi Playwright specs.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The Strapi specs replay a recorded HAR (see support/strapi-har-fixture.js). The HAR is
 * captured from *your own* local Strapi content, so the specs cannot hardcode banner/modal/ad
 * copy — they assert against the descriptor below, which you fill in to match what you record.
 * Keep the recorded Strapi content and this descriptor in sync; that is the only manual step.
 *
 * HOW TO USE
 * ----------
 * 1. In your local Strapi, author content that exercises the three axes (see EXPECTED).
 * 2. Record the fixture (one HAR captures banners + modals + sidebar ads in a single call):
 *      RECORD_HAR=1 SANDBOX_URL=http://localhost:8000 \
 *        ./node_modules/.bin/playwright test --project=chrome-strapi --workers=1 \
 *        e2e-tests/tests/strapi-localization.spec.js
 * 3. Fill in the fields marked `TODO` below with the exact values you authored.
 * 4. Commit e2e-tests/fixtures/strapi-content.har and this file. CI replays with no backend.
 */

// The single HAR that backs every Strapi spec (banners, modals, sidebar ads all come from the
// one /api/strapi/graphql-cache call, so one fixture covers them all).
export const STRAPI_HAR = 'strapi-content';

/**
 * The clock is pinned so that (a) the start_date/end_date query params the client computes from
 * `new Date()` are identical to the recorded request every run (so routeFromHAR matches), and
 * (b) the recorded content is inside its active date window. Set PINNED_NOW to a moment that sat
 * comfortably inside every recorded item's [startDate, endDate] window at record time.
 *
 * NOTE: the client sends start_date = (PINNED_NOW - 14d), end_date = (PINNED_NOW + 14d). Record
 * and replay must therefore use the SAME PINNED_NOW. Choose a fixed calendar date, not `Date.now()`.
 */
export const PINNED_NOW = '2026-07-15T12:00:00.000Z'; // TODO: set to a date inside your content's window

// A moment AFTER every recorded item's endDate — used by the date-window ("expired") assertions.
export const PINNED_EXPIRED = '2027-01-01T12:00:00.000Z'; // TODO: set to a date past your content's window

/**
 * Describe the content you recorded. Presence/absence assertions key off `internalName`-independent
 * DOM (banners/modals expose no internal name in the DOM), so the discriminator is the visible
 * header/title text you author per locale. Use text unique enough to assert on.
 */
export const EXPECTED = {
  // A banner whose content exists ONLY in Hebrew (locales: ["he"]).
  // Shows under Hebrew UI, absent under English UI. This is the headline behavior of this
  // branch: before the localization change Hebrew-only content could not flow through at all;
  // now it reaches the client and renders under Hebrew UI only.
  //
  // Keep this the ONLY banner active at PINNED_NOW. context.js surfaces just the first
  // date-active banner (locale is filtered later, inside the Banner component), so a second
  // banner with an overlapping window would mask this one. To also cover the English-only
  // direction for a banner, give that banner a separate date window and pin the clock to it.
  hebrewOnlyBanner: {
    heText: 'TODO: exact Hebrew banner text you authored',
  },
  // A modal targeted at a specific country set, used by the targeting spec.
  // e.g. countryMode INCLUDE with countries: [US]. Shows for a US viewer, hidden for a non-US viewer.
  usTargetedModal: {
    // The modal header renders in <h1 class="int-en"> / <h1 class="int-he">.
    enHeader: 'TODO: exact English modal header you authored',
    // Timezone that should MATCH the target (a US zone for an INCLUDE-US modal).
    matchingTimezone: 'America/New_York',
    // Timezone that should NOT match (a non-US zone for an INCLUDE-US modal).
    nonMatchingTimezone: 'Asia/Jerusalem',
  },
  // A sidebar ad with content ONLY in Hebrew, plus one ONLY in English.
  // Sidebar ads ALSO gate on keyword overlap with the page, so record the ad's `keywords`
  // to include a term present on `adPagePath`, and set that here.
  sidebarAds: {
    // A relative path whose AdContext keywordTargets include `keyword` below.
    // A generic text page works if your ad keyword is broad (e.g. a category term).
    adPagePath: '/', // TODO: a page whose keywords match your recorded ad
    hebrewOnly: {
      heTitle: 'TODO: exact Hebrew sidebar-ad <h3> title you authored',
    },
    englishOnly: {
      enTitle: 'TODO: exact English sidebar-ad <h3> title you authored',
    },
  },

  // Two English sidebar ads on the SAME page/keywords for the date-window ("date states") spec:
  //  - active:  startTime <= PINNED_NOW <= endTime           → renders
  //  - expired: window entirely BEFORE PINNED_NOW, but still  → does NOT render (client date gate)
  //    within the server's ±14-day fetch range (endTime >= PINNED_NOW - 14d), so the server
  //    returns it and we prove the client hides it, rather than it simply never being fetched.
  datedAds: {
    pagePath: '/', // TODO: usually the same as sidebarAds.adPagePath
    active: {
      enTitle: 'TODO: exact English title of an ad active at PINNED_NOW',
    },
    expired: {
      enTitle: 'TODO: exact English title of an ad whose window ended before PINNED_NOW',
    },
  },
};

/**
 * Prepare a fresh context for a Strapi spec:
 *  - accept the cookie notice (otherwise it can overlap the banner region),
 *  - pin the clock so the HAR request URL is deterministic and content is in-window.
 * Call BEFORE page.goto. `context` must be the test's BrowserContext (for routeFromHAR).
 */
export async function prepareStrapiPage(page, { now = PINNED_NOW } = {}) {
  await page.clock.setFixedTime(new Date(now));
  await page.addInitScript(() => {
    document.cookie = 'cookiesNotificationAccepted=1; path=/; max-age=31536000';
  });
}

/**
 * Switch the interface language via the app's own endpoint, which sets the interface cookie
 * and redirects. Works on the .org sandbox without needing the separate .org.il (Hebrew) domain.
 * If your setup drives Hebrew via MODULE_URLS.HE instead, swap this for a goto to that base URL.
 */
export async function setInterfaceLanguage(page, lang /* 'english' | 'hebrew' */) {
  await page.goto(`/interface/${lang}`, { waitUntil: 'load' });
}
