import { expect } from '@playwright/test';
import { LANGUAGES, t } from '../globals';

/**
 * Recorded Strapi scenarios + setup helpers for the Strapi Playwright specs.
 *
 * ONE SCENARIO PER REPRESENTATIVE STRAPI STATE.
 * Each entry below pairs a recorded .har with the clock it was recorded under and a description
 * of what that recording contains. A spec picks a scenario; it never hardcodes content.
 *
 * Adding a scenario:
 *   1. Publish the state in local Strapi (only that state — see "Isolate the state" below).
 *   2. Add an entry here with a new `har` name and the `pinnedNow` you want to record under.
 *   3. Write the spec against `SCENARIOS.<name>`.
 *   4. Record:  RECORD_HAR=1 ./node_modules/.bin/playwright test --project=chrome-strapi \
 *                 --workers=1 e2e-tests/tests/<your-spec>.spec.js
 *   5. Fill in `expected` from what you published, and commit the .har.
 *
 * Isolate the state: one GraphQL call returns banners + modals + sidebar ads together, so a
 * recording captures everything published at that moment. Keep unrelated content unpublished
 * while recording, or the fixture carries noise that later scenarios have to work around.
 *
 * WHY RECORDED RATHER THAN SYNTHESIZED (for now): we are deliberately collecting real recordings
 * across the different content patterns first. Once the variation is visible, the plan is to
 * extract a payload factory and drive most permutations synthetically (fulfilling the route from
 * generated JSON, with dates computed relative to now), keeping a recording or two as contract
 * fixtures. `routeWithStrapiHarFixture(context, scenario.har)` is the seam that swap happens at —
 * specs written against SCENARIOS should not need to change.
 */

/**
 * Why the clock is pinned per scenario:
 *   1. the client derives start_date/end_date from `new Date()` and sends them as query params,
 *      and routeFromHAR matches on the full URL — so record and replay must agree;
 *   2. context.js re-checks the date window client-side before surfacing a banner/modal, so the
 *      pinned moment has to sit inside the recorded content's active window.
 *
 * The clock is *installed* (see prepareStrapiPage), so timers are faked too and each surface's
 * showDelay only elapses when a test advances the clock.
 *
 * Changing a scenario's pinnedNow invalidates its recording.
 */
export const SCENARIOS = {
  /**
   * A single published modal, English only, and nothing else published.
   *
   * Recorded payload:
   *   en_modals: 1      he_modals: 0
   *   en_banners: 0     he_banners: 0
   *   en_sidebarAds: 0  he_sidebarAds: 0
   *
   * pinnedNow (noon EDT 2026-08-04) yields ?start_date=2026-07-21&end_date=2026-08-18 and sits
   * inside the modal's 2026-08-04T04:45Z → 2026-08-11T03:45Z window.
   */
  publishedModal: {
    har: 'strapi-modal-published',
    pinnedNow: '2026-08-04T16:00:00.000Z',
    expected: {
      modal: {
        internalModalName: 'shavuot-2026-modal-example',
        locales: ['en'],
        // Seconds the component waits before rendering (setTimeout armed in a useEffect).
        showDelaySeconds: 1,
        startDate: '2026-08-04T04:45:00.000Z',
        endDate: '2026-08-11T03:45:00.000Z',
        // modalHeader is null on this record, so NO <h1 class="int-en"> renders — assert on the
        // body text instead. Quote-free substring on purpose (the source uses curly quotes).
        bodyText: 'One who learns from every person',
        buttonText: 'Donate Monthly',
        // shouldShow() excludes /donate, /mobile, /app, /ways-to-give plus the button's pathname.
        // This button points at donate.sefaria.org/campaign/779365/donate, so the library home
        // is unaffected.
        buttonURL: 'https://donate.sefaria.org/campaign/779365/donate?c_src=web',
        // countriesToTarget is null on this record → the country gate always passes, so the
        // browser timezone is irrelevant for this scenario.
        countriesToTarget: null,
      },
    },
  },

  /**
   * The SAME modal document as `publishedModal`, with only its Hebrew locale published.
   *
   * Recorded payload:
   *   he_modals: 1      en_modals: 0
   *   en_banners: 0     he_banners: 0
   *   en_sidebarAds: 0  he_sidebarAds: 0
   *
   * Strapi also holds three other Hebrew modals and a Hebrew sidebar ad, but their date windows
   * fall outside this scenario's ±14-day fetch range — verified against the live endpoint before
   * recording. That isolation matters more for modals than for banners: selection surfaces a
   * single winner (gates + ranking, strapiSelection.js), so another eligible in-window modal
   * could outrank and mask this one entirely.
   *
   * Note the contrast with the English row of the same document: this row HAS a modalHeader
   * ('Support Sefaria'), so an <h1 class="int-he"> renders and is asserted, whereas the English
   * row's header is null and renders nothing. Same field, opposite nullability per locale.
   */
  publishedModalHebrewOnly: {
    har: 'strapi-modal-hebrew-only',
    pinnedNow: '2026-08-04T16:00:00.000Z',
    /**
     * The library home. '/' 302-redirects here, so this is the same page without the extra hop —
     * `window.location.pathname` is '/texts' either way.
     *
     * Checked against shouldShow()'s excluded-paths list, which refuses to render a modal on the
     * page its own button links to: this modal's buttonURL contributes pathname '/give/451346',
     * which does not collide with '/texts'. Re-check this whenever the buttonURL changes — a
     * collision silently suppresses the modal and makes the negative test below vacuous.
     */
    pagePath: '/texts',
    expected: {
      modal: {
        internalModalName: 'shavuot-2026-modal-example',
        locales: ['he'],
        showDelaySeconds: 1,
        startDate: '2026-08-04T04:45:00.000Z',
        endDate: '2026-08-11T03:45:00.000Z',
        // Present on the Hebrew row (the English row's is null). The authored value happens to be
        // an English string — that is the content as published, not a mistake in the test.
        header: 'Support Sefaria',
        // Quote-free substring: the surrounding text uses Hebrew quotation marks (״ ׳).
        bodyText: 'בחרנו במשנה זו עבור תיק הבד של השנה',
        buttonText: 'תן עכשיו',
        buttonURL: 'https://donate.sefaria.org/give/451346#!/donation/checkout?c_src=web',
        countriesToTarget: null,
      },
    },
  },

  /**
   * The same modal document with BOTH locales published — the modal counterpart to
   * `publishedBannerBothLocales`, completing the surface × locale matrix.
   *
   * Recorded payload:
   *   en_modals: 1      he_modals: 1   (both rows share documentId pwhm4xcatmvsp7bxlvedeu4u)
   *   en_banners: 0     he_banners: 0
   *   en_sidebarAds: 0  he_sidebarAds: 0
   *
   * THE INTERESTING BIT: `modalHeader` is OPTIONAL, and here it is present in Hebrew
   * ('Support Sefaria') but null in English — the same optional field taking different presence
   * per locale on one document. Misc.jsx renders a header per locale gated on truthiness alone,
   * NOT on the active interface language:
   *     {modalHeader.en && <h1 className="int-en">…}
   *     {modalHeader.he && <h1 className="int-he">…}
   * so under English UI the int-en header is genuinely ABSENT from the DOM while the int-he one is
   * present-but-CSS-hidden. Assertions have to distinguish those two states.
   */
  publishedModalBothLocales: {
    har: 'strapi-modal-both-locales',
    pinnedNow: '2026-08-04T16:00:00.000Z',
    // Neither locale's buttonURL pathname ('/campaign/779365/donate', '/give/451346') collides
    // with this path, so shouldShow()'s excluded-paths list does not suppress the modal here.
    pagePath: '/texts',
    expected: {
      modal: {
        internalModalName: 'shavuot-2026-modal-example',
        locales: ['en', 'he'],
        showDelaySeconds: 1,
        startDate: '2026-08-04T04:45:00.000Z',
        endDate: '2026-08-11T03:45:00.000Z',
        countriesToTarget: null,
        // Keyed by LANGUAGES.* so a spec can loop over both interfaces.
        // `header: null` means that locale has no header authored — a supported content state,
        // not missing test data.
        byLocale: {
          english: {
            header: null,
            bodyText: 'One who learns from every person',
            buttonText: 'Donate Monthly',
            buttonURL: 'https://donate.sefaria.org/campaign/779365/donate?c_src=web',
          },
          hebrew: {
            header: 'Support Sefaria',
            bodyText: 'בחרנו במשנה זו עבור תיק הבד של השנה',
            buttonText: 'תן עכשיו',
            buttonURL: 'https://donate.sefaria.org/give/451346#!/donation/checkout?c_src=web',
          },
        },
      },
    },
  },

  /**
   * A single published sidebar ad, English only, with keyword targeting.
   *
   * Recorded payload:
   *   en_sidebarAds: 1  he_sidebarAds: 0
   *   en_modals: 1      he_modals: 1     ← the bilingual modal is also published
   *   en_banners: 0     he_banners: 0
   *
   * The modal rows are unavoidable noise (the live instance was in this state when the recording
   * was taken, and one call returns every surface) but harmless:
   * a modal only renders once its showDelay timer fires, and these specs never advance the clock —
   * sidebar ads have no delay of their own. Do not add advanceUntilVisible to a sidebar-ad test
   * without expecting the modal to appear over the page.
   *
   * KEYWORD TARGETING is what makes this surface different from banners and modals.
   * `keywords: 'prayer, beliefs, !social-issues'` is split by buildInAppAdsFromSidebarAds into
   * keywordTargets ['prayer', 'beliefs'] and excludeKeywordTargets ['social-issues'], and matched
   * in Promotions.jsx against `context.keywordTargets` — which ReaderApp.getUserContext derives
   * from the panel's topic/category, lowercased.
   *
   * The tests use the topic CATEGORY route (/topics/category/<slug>), not /topics/<slug>. The
   * latter is served by reader_views.topic_page, which 404s unless the topic is in the active
   * module's pool — and pool membership lives in Postgres (django_topics), whose tables are empty
   * on a stock local sandbox, so every individual topic page 404s there. The category route has no
   * such gate: it renders, contributes `initialNavigationTopicCategory` to keywordTargets (the
   * last fallback in getUserContext's chain), and its sidebar carries the ad via
   * NavSidebar's unconditional `{type: "Promo"}` module. Its main content is empty without pool
   * data, which does not affect the sidebar.
   *
   * Note the matcher is an OR: an ad shows when a keyword matches, OR when it has any exclusions
   * and none of them match. So this ad also shows on unrelated pages; 'social-issues' is the only
   * place it is actively suppressed. The tests cover the three topics that make that concrete.
   *
   * TWO ENVIRONMENT DEPENDENCIES, both from `debug: true` on this record:
   *   1. Promotions.showGivenDebugMode() hides a debug ad unless `context.isDebug`, which is the
   *      server's Django DEBUG setting (reader/views.py: "_debug": DEBUG). These tests therefore
   *      require a sandbox running with DEBUG=True. Locally that holds (local_settings.py).
   *   2. SidebarAd prefixes the button icon with STRAPI_INSTANCE when debug, so the <img> points
   *      at the Strapi host directly. That request is NOT matched by the `**\/api/strapi/**` HAR
   *      glob and does go to the network — the only non-hermetic request in this suite. It has no
   *      bearing on the assertions, which never touch the icon.
   */
  publishedSidebarAd: {
    har: 'strapi-sidebar-ad-published',
    pinnedNow: '2026-08-05T16:00:00.000Z',
    expected: {
      sidebarAd: {
        internalCampaignId: 'GCT Sidebar Social Issues Topic',
        locales: ['en'],
        // Active window; pinnedNow sits inside it. Promotions re-checks this client-side against
        // context.dt, which is derived from `new Date()` and so is pinned by the fake clock.
        startTime: '2026-08-02T06:00:00.000Z',
        endTime: '2026-08-10T06:00:00.000Z',
        title: 'Your Letter in the Torah',
        buttonText: 'Get Yours Free',
        buttonURL:
          'https://torah.sefaria.org?utm_source=site&utm_medium=sidebar&utm_campaign=socialissuestopic',
        showTo: 'all',
        debug: true,
        keywords: 'prayer, beliefs, !social-issues',
        // Topic-category slugs derived from `keywords`, used to drive the tests.
        // Path shape is /topics/category/<slug> — see the note above on why not /topics/<slug>.
        showsOnTopicCategories: ['prayer', 'beliefs'],
        hiddenOnTopicCategory: 'social-issues',
      },
    },
  },

  /**
   * The same sidebar-ad document with only its HEBREW locale published.
   *
   * Recorded payload:
   *   he_sidebarAds: 1  en_sidebarAds: 0
   *   en_modals: 1      he_modals: 1     ← the bilingual modal is still published (harmless; see
   *                                        the English sidebar-ad scenario for why)
   *   en_banners: 0     he_banners: 0
   *
   * SIDEBAR ADS FILTER BY LOCALE DIFFERENTLY FROM BANNERS AND MODALS. Those merge their per-locale
   * rows into one document and gate on `locales.includes(activeLocale)` inside the component. Ads
   * instead fan out: buildInAppAdsFromSidebarAds emits ONE in-app ad per published locale, each
   * carrying `trigger.interfaceLang` (LOCALE_TO_INTERFACE_LANG[locale]), and Promotions filters on
   * `ad.trigger.interfaceLang === context.interfaceLang`. Same user-visible outcome, different
   * mechanism — which is exactly why this surface needs its own locale coverage.
   *
   * Everything except the copy is unchanged from `publishedSidebarAd`: same documentId, same
   * keywords, same window, same debug flag. So the keyword behaviour can be re-verified under
   * Hebrew, and the English interface becomes a clean negative.
   */
  publishedSidebarAdHebrewOnly: {
    har: 'strapi-sidebar-ad-hebrew-only',
    pinnedNow: '2026-08-05T16:00:00.000Z',
    expected: {
      sidebarAd: {
        internalCampaignId: 'GCT Sidebar Social Issues Topic',
        locales: ['he'],
        startTime: '2026-08-02T06:00:00.000Z',
        endTime: '2026-08-10T06:00:00.000Z',
        title: 'האות שלך בתורה',
        buttonText: 'קבלו את שלכם בחינם',
        buttonURL:
          'https://torah.sefaria.org?utm_source=site&utm_medium=sidebar&utm_campaign=socialissuestopic',
        showTo: 'all',
        // Same as the English record: requires a sandbox running with DEBUG=True.
        debug: true,
        keywords: 'prayer, beliefs, !social-issues',
        showsOnTopicCategories: ['prayer', 'beliefs'],
        hiddenOnTopicCategory: 'social-issues',
      },
    },
  },

  /**
   * The same sidebar-ad document with BOTH locales published — completing the surface × locale
   * grid alongside the bilingual banner and modal scenarios.
   *
   * Recorded payload:
   *   en_sidebarAds: 1  he_sidebarAds: 1  (both rows share documentId lnc4yt9rfeklxbaynb8ef0j2)
   *   en_modals: 1      he_modals: 1      ← still published; harmless, the clock is never advanced
   *   en_banners: 0     he_banners: 0
   *
   * WHY THIS CASE IS DIFFERENT FROM THE BILINGUAL BANNER/MODAL. Those merge their two rows into
   * ONE document that the component then reads per locale. Ads fan out instead:
   * buildInAppAdsFromSidebarAds produces TWO in-app ads here, one per locale, and Promotions
   * filters them at match time on `trigger.interfaceLang`. Both ads carry the SAME
   * `internalCampaignId`, which Promotions uses as the React `key` — so if the locale filter ever
   * stopped discriminating, two elements with a duplicate key would render. Asserting that exactly
   * ONE ad renders is therefore the assertion that matters on this surface.
   *
   * Note also that both locales share an identical `buttonURL` here, whereas the bilingual banner
   * has a different donation campaign per locale. Whether a localized field actually differs is a
   * property of the content, not of the schema.
   */
  publishedSidebarAdBothLocales: {
    har: 'strapi-sidebar-ad-both-locales',
    pinnedNow: '2026-08-05T16:00:00.000Z',
    expected: {
      sidebarAd: {
        internalCampaignId: 'GCT Sidebar Social Issues Topic',
        locales: ['en', 'he'],
        startTime: '2026-08-02T06:00:00.000Z',
        endTime: '2026-08-10T06:00:00.000Z',
        showTo: 'all',
        debug: true,
        keywords: 'prayer, beliefs, !social-issues',
        showsOnTopicCategories: ['prayer', 'beliefs'],
        hiddenOnTopicCategory: 'social-issues',
        // Keyed by LANGUAGES.* so a spec can loop over both interfaces.
        byLocale: {
          english: {
            title: 'Your Letter in the Torah',
            buttonText: 'Get Yours Free',
          },
          hebrew: {
            title: 'האות שלך בתורה',
            buttonText: 'קבלו את שלכם בחינם',
          },
        },
      },
    },
  },

  /**
   * The same modal document, both locales published, with DIFFERENT country targeting per locale:
   *   en row → countryMode 'include', countries [GB]
   *   he row → countryMode 'all'
   *
   * Recorded payload:
   *   en_modals: 1      he_modals: 1   (both rows share documentId pwhm4xcatmvsp7bxlvedeu4u)
   *   en_sidebarAds: 1  he_sidebarAds: 1  ← the bilingual ad is still published; it renders in the
   *                                         sidebar and is irrelevant to modal assertions
   *   en_banners: 0     he_banners: 0
   *
   * WHY THIS SCENARIO IS INTERESTING BEYOND TARGETING ITSELF.
   * `countriesToTarget` is NOT in LOCALIZED_FIELDS.modal, so groupByDocumentId treats it as a
   * shared field and takes it from `rows[0]` — and rows are ordered by SUPPORTED_LOCALES, so that
   * is always the English row. strapiLocalization.js states the assumption outright: "Non-text
   * fields (dates, targeting, showTo, ...) are identical across locale rows of the same document,
   * so any row can supply them." Strapi does not enforce that, as this content demonstrates.
   * See the spec for what the app actually does with it.
   *
   * DRIVE COUNTRY WITH THE `cf-ipcountry` HEADER, NOT `timezoneId`.
   * candidateCountries() unions three signals — IP country, timezone and navigator.language — and
   * the IP one always wins in practice because the middleware falls back to PINNED_IPCOUNTRY
   * (set to "GB" in local_settings.py) whenever the header is absent, so every local viewer looks
   * British by default. Sending `cf-ipcountry` overrides that per test.
   *
   * Varying `timezoneId` instead would be actively harmful here: the client derives
   * start_date/end_date by converting to LOCAL midnight, so a different timezone yields a
   * different query string and the recorded HAR stops matching. Keeping the config's
   * America/New_York default lets ONE recording serve every country case.
   */
  modalCountryTargeted: {
    har: 'strapi-modal-country-targeted',
    pinnedNow: '2026-08-04T16:00:00.000Z',
    pagePath: '/texts',
    viewerCountries: {
      // Matches the English row's include-list.
      matching: 'GB',
      // Does not match it.
      nonMatching: 'US',
    },
    expected: {
      modal: {
        internalModalName: 'shavuot-2026-modal-example',
        locales: ['en', 'he'],
        showDelaySeconds: 1,
        startDate: '2026-08-04T04:45:00.000Z',
        endDate: '2026-08-11T03:45:00.000Z',
        countriesToTargetByLocale: {
          english: { countryMode: 'include', countries: ['GB'] },
          hebrew: { countryMode: 'all', countries: [] },
        },
        byLocale: {
          english: { header: null, bodyText: 'One who learns from every person' },
          hebrew: { header: 'Support Sefaria', bodyText: 'בחרנו במשנה זו עבור תיק הבד של השנה' },
        },
      },
    },
  },

  /**
   * The banner document, both locales published, with DIFFERENT country targeting per locale:
   *   en row → countryMode 'exclude', countries [US]
   *   he row → countryMode 'include', countries [IL]
   *
   * Recorded payload (this window is NOT isolated):
   *   en_banners: 1     he_banners: 1   ← under test
   *   en_modals: 1      he_modals: 1    ← also renders once the clock advances; harmless, since
   *   en_sidebarAds: 1  he_sidebarAds: 1   the assertions only look at #bannerMessage and
   *                                        Playwright's visibility check ignores occlusion.
   *
   * WHY THIS SCENARIO EXISTS. `Banner.shouldShow()` is a SEPARATE call site from the modal's, and
   * both were changed when countriesToTarget became a localized field. `modalCountryTargeted`
   * covers the modal path; this covers the banner one, and additionally exercises `exclude` mode,
   * which the modal scenario does not.
   *
   * THE DISCRIMINATING VIEWER IS IL. The two locales disagree for that viewer — English hides
   * because the America/New_York timezone makes US a plausible country, while Hebrew shows because
   * the IP-country header makes IL plausible. Under the pre-fix code, where the English row's
   * targeting governed every locale, BOTH interfaces would have hidden the banner. A viewer for
   * whom the locales happen to agree could not tell the two implementations apart.
   *
   * INCLUDE AND EXCLUDE ARE MIRRORS OVER THE PLAUSIBLE-COUNTRY SET. Any intersection with an
   * include-list admits the viewer; any intersection with an exclude-list withholds them. Thus the
   * IL viewer's candidates {il, us} are enough both to pass include [IL] and fail exclude [US].
   *
   * pinnedNow is deliberately a DAY LATER than the other banner scenarios (2026-08-06 rather than
   * 08-05), giving this fixture its own request URL and its own key in the date-keyed Django cache.
   */
  bannerCountryTargeted: {
    har: 'strapi-banner-country-targeted',
    pinnedNow: '2026-08-06T16:00:00.000Z',
    /** Sent as the `cf-ipcountry` header; see the spec for why that, and not `timezoneId`. */
    viewerCountries: {
      // The locales disagree for this viewer: English hides, Hebrew shows.
      discriminating: 'IL',
      // On the English exclude-list.
      englishExcluded: 'US',
    },
    expected: {
      banner: {
        internalBannerName: '2026-purim-banner-2',
        locales: ['en', 'he'],
        showDelaySeconds: 1,
        startDate: '2026-08-04T04:00:00.000Z',
        endDate: '2026-08-08T17:00:00.000Z',
        countriesToTargetByLocale: {
          english: { countryMode: 'exclude', countries: ['US'] },
          hebrew: { countryMode: 'include', countries: ['IL'] },
        },
        byLocale: {
          english: { bodyText: 'Celebrate the joy of Jewish learning with a matched gift today' },
          hebrew: { bodyText: 'חגגו את שמחת הלימוד היהודי עם מתנה תואמת עוד היום' },
        },
      },
    },
  },

  /**
   * An EXPIRED banner: delivered by the server, but past its end date so it must not render.
   *
   * Recorded payload:
   *   en_banners: 1   window 2026-08-01 → 2026-08-03  ← EXPIRED at pinnedNow, under test
   *   en_modals: 1    window 2026-08-04 → 2026-08-11  ← still ACTIVE, used as the positive control
   *   he_modals: 1    same window
   *   en/he_sidebarAds: 1 each, window 2026-08-02 → 2026-08-10, also active
   *
   * TWO DATE CHECKS, AND THIS EXERCISES THE SECOND ONE. The GraphQL query only asks for content
   * whose whole window fits inside now ± 14 days, so an item can be delivered and still be out of
   * date: here the banner's window sits comfortably inside the fetch range but ended three days
   * before the pinned clock. context.js then re-checks `currentDate` against each item's own window
   * before surfacing it. That client-side rejection is what had never been covered — every other
   * scenario pins a clock inside its content's window, so the date gate always said yes.
   *
   * VIEWER COUNTRY IS GB ON PURPOSE. The banner targets `exclude [US]`, which GB passes, so the
   * expiry is the ONLY gate it fails. A US viewer would fail both the date and the country check,
   * and the test could not attribute the absence to either.
   *
   * The still-active modal in the same payload is the positive control: if it renders, the payload
   * arrived, the clock advanced past showDelay, and rendering works — so the banner's absence is
   * about its dates and nothing else.
   *
   * pinnedNow is a day later again (2026-08-07), giving this fixture its own request URL and its
   * own key in the date-keyed Django cache.
   */
  bannerExpired: {
    har: 'strapi-banner-expired',
    pinnedNow: '2026-08-07T16:00:00.000Z',
    // Passes the banner's exclude-list, so expiry is the only reason it can be withheld.
    viewerCountry: 'GB',
    expected: {
      banner: {
        internalBannerName: '2026-purim-banner-2',
        locales: ['en'],
        showDelaySeconds: 1,
        startDate: '2026-08-01T04:00:00.000Z',
        endDate: '2026-08-03T17:00:00.000Z',
        countriesToTarget: { countryMode: 'exclude', countries: ['US'] },
      },
      // Co-published and still active at pinnedNow — the control, not a subject of assertions
      // beyond "it rendered".
      activeModal: {
        internalModalName: 'shavuot-2026-modal-example',
        startDate: '2026-08-04T04:45:00.000Z',
        endDate: '2026-08-11T03:45:00.000Z',
      },
    },
  },

  /**
   * A FUTURE-DATED banner: delivered by the server, but its start date has not arrived, so it must
   * not render. The mirror image of `bannerExpired`, and deliberately pinned to the SAME moment —
   * one window ends before that instant, the other begins after it.
   *
   * Recorded payload:
   *   en_banners: 1   window 2026-08-08 → 2026-08-10  ← NOT YET STARTED at pinnedNow, under test
   *   en_modals: 1    window 2026-08-04 → 2026-08-11  ← still ACTIVE, the positive control
   *   he_modals: 1    same window
   *   en/he_sidebarAds: 1 each, also active
   *
   * WHY IT IS WORTH A SEPARATE SCENARIO FROM `bannerExpired`. context.js selects a banner with
   *     currentDate >= new Date(b.bannerStartDate) && currentDate <= new Date(b.bannerEndDate)
   * — two comparisons. The expired scenario only exercises the second. If the first were inverted,
   * every expired test would still pass; only a not-yet-started item catches it.
   *
   * TARGETING IS `all` HERE, unlike the expired banner's `exclude [US]`. That means country cannot
   * be the reason this banner is withheld, so the start date is the only candidate — no viewer
   * country reasoning required for the subject of the test. (The `cf-ipcountry` header the spec
   * sends is for the CONTROL modal, which include-targets GB; see the spec.)
   */
  bannerNotYetStarted: {
    har: 'strapi-banner-future',
    // Same instant as bannerExpired on purpose: the pair differs only in where the content's
    // window sits relative to it.
    pinnedNow: '2026-08-07T16:00:00.000Z',
    // Set only so the co-published control modal (include [GB]) stays eligible. The banner under
    // test targets `all`, so this has no bearing on it.
    viewerCountry: 'GB',
    expected: {
      banner: {
        internalBannerName: '2026-purim-banner-2',
        locales: ['en'],
        showDelaySeconds: 1,
        startDate: '2026-08-08T04:00:00.000Z',
        endDate: '2026-08-10T17:00:00.000Z',
        countriesToTarget: { countryMode: 'all' },
      },
      activeModal: {
        internalModalName: 'shavuot-2026-modal-example',
        startDate: '2026-08-04T04:45:00.000Z',
        endDate: '2026-08-11T03:45:00.000Z',
      },
    },
  },

  /**
   * THREE sidebar ads covering every date state in ONE recording: expired, active, future.
   *
   * Recorded payload (English rows, all three delivered):
   *   'Expired Ad'  2026-08-01 → 2026-08-03   ended before pinnedNow
   *   'Active Ad'   2026-08-06 → 2026-08-10   contains pinnedNow      ← the only one that renders
   *   'Future Ad'   2026-08-12 → 2026-08-14   starts after pinnedNow
   *
   * WHY ADS ARE THE RIGHT SURFACE FOR THIS. Promotions filters each ad independently and renders
   * every match, so all three date states coexist in one payload and one page load — whereas
   * selection surfaces only a single winning banner/modal, which is why those needed a
   * recording each. It is also a genuinely different implementation of the same rule:
   *   banner/modal → strapiSelection.js `isDateActive` — an out-of-window doc is never eligible
   *   sidebar ad   → Promotions  `.filter()` — rejects each inactive ad
   *
   * EVERY OTHER GATE IS NEUTRALISED so the date is the only differentiator:
   *   - identical `keywords: '!everywhere'` — an exclude-only rule, so the matcher's second clause
   *     is true on any page lacking that keyword and all three are eligible everywhere;
   *   - identical showTo ('all'), debug (true), and locale (en);
   *   - distinct titles, which is how the test tells them apart — nothing else about them differs,
   *     and internalCampaignId never reaches the DOM.
   * If the date filter were ignored, all three would render.
   *
   * No clock advance is needed or wanted: sidebar ads have no showDelay, so they render as soon as
   * the payload lands — which also keeps the co-published modal invisible.
   *
   * Requires a sandbox with DEBUG=True, since all three carry `debug: true`.
   */
  sidebarAdDateStates: {
    har: 'strapi-sidebar-ad-date-states',
    pinnedNow: '2026-08-08T16:00:00.000Z',
    pagePath: '/',
    expected: {
      // Keyed by the rendered <h3>, which is the only distinguishing text.
      ads: {
        expired: { title: 'Expired Ad', startTime: '2026-08-01T06:00:00.000Z', endTime: '2026-08-03T06:00:00.000Z' },
        active: { title: 'Active Ad', startTime: '2026-08-06T06:00:00.000Z', endTime: '2026-08-10T06:00:00.000Z' },
        future: { title: 'Future Ad', startTime: '2026-08-12T06:00:00.000Z', endTime: '2026-08-14T06:00:00.000Z' },
      },
    },
  },

  /**
   * A single published banner, English only, and nothing else in the fetched window.
   *
   * Recorded payload:
   *   en_banners: 1     he_banners: 0
   *   en_modals: 0      he_modals: 0
   *   en_sidebarAds: 0  he_sidebarAds: 0
   *
   * Other content does exist in Strapi (Hebrew modals and a Hebrew sidebar ad), but its date
   * windows fall outside this scenario's ±14-day fetch range, so the server never returns it —
   * verified against the live endpoint before recording.
   *
   * pinnedNow (noon EDT 2026-08-05) yields ?start_date=2026-07-22&end_date=2026-08-19 and sits
   * inside the banner's 2026-08-04T04:00Z → 2026-08-08T17:00Z window.
   */
  publishedBanner: {
    har: 'strapi-banner-published',
    pinnedNow: '2026-08-05T16:00:00.000Z',
    expected: {
      banner: {
        internalBannerName: '2026-purim-banner-2',
        locales: ['en'],
        // Seconds the component waits before rendering (setTimeout armed in a useEffect).
        showDelaySeconds: 1,
        startDate: '2026-08-04T04:00:00.000Z',
        endDate: '2026-08-08T17:00:00.000Z',
        // bannerText is markdown ("**MATCHING**" renders as <strong>), so this substring is
        // chosen to avoid the bold span and match the rendered textContent.
        bodyText: 'Celebrate the joy of Jewish learning with a matched gift today',
        buttonText: 'Double My Donation',
        // Only /give/451346/ is added to shouldShow()'s excluded paths (alongside /donate,
        // /mobile, /app, /ways-to-give), so the library home is unaffected.
        buttonURL: 'https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=web',
        backgroundColor: '#004E5F',
        countriesToTarget: null,
      },
    },
  },

  /**
   * The SAME banner document as `publishedBanner`, but with only its Hebrew locale published.
   * This is the behavior this branch exists for: single-locale content now reaches the client on
   * its own, instead of being discoverable only when an English version exists.
   *
   * Recorded payload:
   *   he_banners: 1     en_banners: 0
   *   en_modals: 0      he_modals: 0
   *   en_sidebarAds: 0  he_sidebarAds: 0
   *
   * Because `locales` is ['he'], one recording covers BOTH directions of locale separation:
   * the banner renders under Hebrew UI and must not render under English UI. The GraphQL query
   * always asks for every locale, so the request is identical either way and the same HAR serves
   * both tests.
   *
   * pinnedNow is the same moment as `publishedBanner` — the document's date window is unchanged
   * (2026-08-04T04:00Z → 2026-08-08T17:00Z); only which locale is published differs.
   */
  publishedBannerHebrewOnly: {
    har: 'strapi-banner-hebrew-only',
    pinnedNow: '2026-08-05T16:00:00.000Z',
    expected: {
      banner: {
        internalBannerName: '2026-purim-banner-2',
        locales: ['he'],
        showDelaySeconds: 1,
        startDate: '2026-08-04T04:00:00.000Z',
        endDate: '2026-08-08T17:00:00.000Z',
        // Hebrew bannerText is markdown too ("**משווה**" → <strong>), so this substring avoids
        // the bold span.
        bodyText: 'חגגו את שמחת הלימוד היהודי עם מתנה תואמת עוד היום',
        // The Hebrew locale has its own button — and note the campaign id differs from the English
        // row's (468442 vs 451346), so the URL is genuinely per-locale rather than shared. Its
        // pathname (/give/468442/) is what shouldShow() adds to the excluded-paths list.
        buttonText: 'הכפל את התרומה שלי',
        buttonURL: 'https://donate.sefaria.org/give/468442/#!/donation/checkout?c_src=web',
        backgroundColor: '#004E5F',
        countriesToTarget: null,
      },
    },
  },

  /**
   * The same banner document again, with BOTH locales published simultaneously.
   *
   * Recorded payload:
   *   en_banners: 1     he_banners: 1   (both rows share documentId iv7m6otlx0wm8r42808nypl0)
   *   en_modals: 0      he_modals: 0
   *   en_sidebarAds: 0  he_sidebarAds: 0
   *
   * This is the scenario that exercises the merge path the branch is built around: two per-locale
   * rows arrive separately and `groupByDocumentId` (strapiLocalization.js) folds them into ONE
   * document with `locales: ['en', 'he']` and a `byLocale` map, which `buildInterfaceTextDoc` then
   * reshapes into the {en, he} objects the components consume. Non-localized fields (dates,
   * showDelay, showTo, background, targeting) are identical on both rows and taken from the first.
   *
   * pinnedNow and the date window are unchanged from the other two banner scenarios; only which
   * locales are published differs.
   */
  publishedBannerBothLocales: {
    har: 'strapi-banner-both-locales',
    pinnedNow: '2026-08-05T16:00:00.000Z',
    expected: {
      banner: {
        internalBannerName: '2026-purim-banner-2',
        locales: ['en', 'he'],
        showDelaySeconds: 1,
        startDate: '2026-08-04T04:00:00.000Z',
        endDate: '2026-08-08T17:00:00.000Z',
        backgroundColor: '#004E5F',
        countriesToTarget: null,
        // Keyed by LANGUAGES.* so a spec can loop over both interfaces. Every one of these three
        // fields is localized (LOCALIZED_FIELDS.banner) and genuinely differs per locale — note
        // the two button URLs point at different campaign ids.
        byLocale: {
          english: {
            bodyText: 'Celebrate the joy of Jewish learning with a matched gift today',
            buttonText: 'Double My Donation',
            buttonURL: 'https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=web',
          },
          hebrew: {
            bodyText: 'חגגו את שמחת הלימוד היהודי עם מתנה תואמת עוד היום',
            buttonText: 'הכפל את התרומה שלי',
            buttonURL: 'https://donate.sefaria.org/give/468442/#!/donation/checkout?c_src=web',
          },
        },
      },
    },
  },
};

// Live count of Strapi responses delivered to a page, keyed per page. Used to prove a payload
// actually arrived — so a "surface did not render" assertion can't pass vacuously.
const strapiHits = new WeakMap();

/**
 * Prepare a page for a scenario. Call BEFORE the first navigation:
 *  - install a fake clock at the scenario's recorded moment;
 *  - start counting Strapi responses;
 *  - accept the cookie notice so it cannot overlap the surface under test.
 *
 * We use `clock.install()` rather than `clock.setFixedTime()`. Both pin Date/Date.now (which is
 * what keeps the derived start_date/end_date query params matching the recording), but install()
 * ALSO fakes timers. Each banner/modal arms a `setTimeout(showDelay * 1000)` before it renders, so
 * with real timers that render raced wall-clock time: fine for "does it appear", useless for
 * "is it still hidden before the delay", and unreliable for asserting something never appears.
 *
 * ⚠️ `install()` ALONE IS NOT ENOUGH — it fakes the timers but leaves the clock RUNNING in step
 * with real time. Measured: ~2949ms of app time elapses over 3s of real time under install(), and
 * 0ms under pauseAt(). So a surface can appear while a test merely waits, with no advance at all.
 * That is invisible to "does it eventually appear" and "is it still absent after a big jump" — the
 * shapes every recorded scenario uses — but it silently defeats a showDelay BOUNDARY assertion,
 * which is how it was found: "visible after the delay" passed without the advance meant to cause
 * it. `pauseAt` is what actually makes app time move only when a test moves it.
 */
export async function prepareStrapiPage(page, scenario) {
  if (!scenario?.pinnedNow) {
    throw new Error('prepareStrapiPage requires a scenario from SCENARIOS (missing pinnedNow).');
  }
  await page.clock.install({ time: new Date(scenario.pinnedNow) });
  await page.clock.pauseAt(new Date(scenario.pinnedNow));

  // Record every timer the page arms, so a test can wait for the showDelay timer to EXIST before
  // moving the clock past it. Registered after clock.install() on purpose: init scripts run in
  // registration order, so this wraps the CLOCK'S faked setTimeout rather than the native one it
  // replaced — wrap the native one and the recorded delays would be of timers the clock no longer
  // drives. See waitForTimerArmed.
  await page.addInitScript(() => {
    window.__armedTimerDelays = [];
    const realSetTimeout = window.setTimeout;
    window.setTimeout = function instrumentedSetTimeout(handler, delay, ...args) {
      window.__armedTimerDelays.push(delay);
      return realSetTimeout.call(this, handler, delay, ...args);
    };
  });

  const counter = { count: 0 };
  strapiHits.set(page, counter);
  page.on('response', (response) => {
    if (response.url().includes('/api/strapi/')) counter.count += 1;
  });

  await page.addInitScript(() => {
    document.cookie = 'cookiesNotificationAccepted=1; path=/; max-age=31536000';
  });
}

/** How many Strapi responses this page has received so far (HAR-served responses included). */
export function strapiResponseCount(page) {
  return strapiHits.get(page)?.count ?? 0;
}

/**
 * Resolve once the page has received another Strapi response beyond `previousCount`.
 *
 * ⚠️ This proves the PAYLOAD ARRIVED. It does NOT prove the surface's showDelay timer is armed —
 * see the warning on advanceBy below before using it to gate a timing assertion.
 */
export async function waitForStrapiResponse(page, previousCount = 0) {
  await expect
    .poll(() => strapiResponseCount(page), {
      message: 'Expected the page to receive a Strapi payload',
      timeout: t(15000),
    })
    .toBeGreaterThan(previousCount);
}

/**
 * Advance the fake clock until `locator` is visible.
 *
 * Stepping rather than one big jump: the surface's showDelay timer is only armed once the Strapi
 * payload has been applied by React, and that happens asynchronously after navigation. A single
 * fastForward issued before the timer exists would advance past nothing and the surface would
 * never appear. Stepping converges regardless of when the timer is armed.
 *
 * For timing assertions ("hidden before the delay, visible after"), use advanceBy instead — it
 * moves a known amount so you can straddle the boundary deliberately.
 */
export async function advanceUntilVisible(page, locator, { stepMs = 500 } = {}) {
  await expect(async () => {
    await page.clock.fastForward(stepMs);
    await expect(locator).toBeVisible({ timeout: t(500) });
  }).toPass({ timeout: t(20000) });
}

/**
 * Advance the fake clock by a known amount.
 *
 * ⚠️ READ BEFORE WRITING A showDelay BOUNDARY TEST ("hidden before the delay, visible after").
 *
 * The showDelay timer is armed several async hops AFTER the Strapi response arrives: the app must
 * await response.json(), run the .then() that sets React state, and re-render so the component's
 * useEffect calls setTimeout. waitForStrapiResponse only covers the first of those hops.
 *
 * advanceUntilVisible is immune — it keeps stepping, so whenever the timer arms a later step fires
 * it. advanceBy is NOT, and it fails in the dangerous direction: if the timer is not yet armed, the
 * advance moves past nothing, so a "still hidden" assertion passes VACUOUSLY — it would pass even
 * if showDelay were broken — and the following "now visible" assertion flakes.
 *
 * ALWAYS PRECEDE A BOUNDARY ASSERTION WITH waitForTimerArmed (below). Waiting for the timer itself
 * removes the race at its source; waiting for the Strapi response does not.
 */
export async function advanceBy(page, ms) {
  await page.clock.fastForward(ms);
}

/**
 * Resolve once the page has armed a timer of exactly `delayMs`.
 *
 * This is what makes a showDelay boundary assertion trustworthy. The surface's
 * `setTimeout(showDelay * 1000)` is armed several async hops after the Strapi response lands — the
 * app must await response.json(), run the .then() that sets React state, and re-render so the
 * component's useEffect schedules it. Advance the clock before that and the "still hidden"
 * assertion passes without exercising anything at all.
 *
 * Timers are captured by the init script in prepareStrapiPage, which wraps the faked setTimeout.
 *
 * ⚠️ MATCHES ON THE DELAY VALUE, so pick a showDelay no other timer on the page is likely to use.
 * A 1-second delay is a popular round number in third-party code; something like 7 seconds is
 * effectively unambiguous, and the synthetic factory lets a spec choose freely.
 */
export async function waitForTimerArmed(page, delayMs) {
  await expect
    .poll(() => page.evaluate(() => window.__armedTimerDelays ?? []), {
      message: `Expected the page to arm a ${delayMs}ms timer (the surface's showDelay)`,
      timeout: t(15000),
    })
    .toContain(delayMs);
}

/**
 * Choose the interface language. Call BEFORE the first navigation.
 *
 * Same approach as the newsletter suite's Hebrew tests: set the `interfaceLang` cookie on the
 * context. Deliberately NOT `/interface/<lang>` — that route
 * (reader_views.interface_language_redirect) can redirect to a *different domain* for Hebrew and
 * navigate away from the local sandbox. The middleware reads this cookie as one of its language
 * signals (sefaria/system/middleware.py), and `needs_domain_switch` is explicitly guarded against
 * redirect loops in local settings, so the cookie alone is enough and stays on localhost.
 *
 * It must be a real context cookie, not `document.cookie` in an init script: the server picks the
 * language while rendering, so the cookie has to be present on the *request*.
 */
export async function useInterfaceLanguage(page, lang /* LANGUAGES.EN | LANGUAGES.HE */) {
  await page.context().addCookies([
    {
      name: 'interfaceLang',
      value: lang,
      url: process.env.SANDBOX_URL || 'http://127.0.0.1:8000',
    },
  ]);
}

/**
 * Assert the page actually rendered in the expected interface language.
 *
 * Worth doing explicitly: if the cookie silently failed to apply, a "hidden in the other language"
 * assertion would pass for entirely the wrong reason.
 */
export async function expectInterfaceLanguage(page, lang) {
  const bodyClass = lang === LANGUAGES.HE ? 'interface-hebrew' : 'interface-english';
  await expect(page.locator('body')).toHaveClass(new RegExp(bodyClass), { timeout: t(15000) });
}
