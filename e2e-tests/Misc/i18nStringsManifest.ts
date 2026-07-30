/**
 * Manifest for Misc/i18n-keyed-strings.spec.ts.
 *
 * Each entry is one page sweep: navigate to `path` (relative to the module
 * base URL), wait for `anchor` (an element that only exists once the page's
 * content has loaded), then assert that the localized value of every keyed
 * string ID in `expectedIds` (plus the header set) is rendered — as visible
 * text or as an aria-label/alt/title/placeholder attribute — and that no raw
 * keyed ID leaked into the page.
 *
 * IDs and their English/Hebrew values live in
 * static/js/sefaria/i18n/interface/{en,he}.json — the manifest stores only IDs, so
 * translator edits in Weblate never break these tests.
 *
 * Every ID listed here was verified in component source to render
 * unconditionally on page load for the given entry (anonymous user unless
 * `auth` is set). Where a keyed ID supplies only the Hebrew half of an
 * <InterfaceText text={{en: "literal", he: Sefaria._("id")}}> pair, asserting
 * it in English still works because the codemod kept English output identical
 * to the en.json value.
 *
 * Coverage notes — what is deliberately NOT asserted:
 *  - Strings that render only after interaction: dropdown-menu interiors
 *    (dropdown_menu.*, header.more_from_sefaria, ...), the reader
 *    display-settings menu (font_size_button.*, layout_buttons.*,
 *    source_translations_buttons.*), editors and modals (editor.*,
 *    collections_widget.*, sheet_modals.*, publish_menu.*, ...).
 *  - Moderator/admin-only surfaces (book_page edit form, updates_panel form,
 *    categorize_sheets.*, category_editor.*, topic_editor.*, sefaria.admin).
 *  - Overlays the harness suppresses by design (site_wide_banner.*,
 *    promotions.*, topics_launch_banner.*).
 *  - Error and empty-state strings ("There was an error...", "There are no
 *    public collections yet.", no_notifications_*, ...), and strings gated on
 *    per-account data (notifications_panel notification rows, user_profile.*
 *    — the own-profile URL depends on the test account's slug).
 * The leak check still protects every string on every page swept: if the
 * Sefaria._() router breaks, raw IDs appear in the DOM and the sweep fails.
 */

export interface StringsPageSpec {
  /** Short name used in the test title. */
  name: string;
  /** URL path appended to the module base URL (may include a query). */
  path: string;
  /** Hebrew-run path override (e.g. a Hebrew search query). */
  pathHe?: string;
  /** Which module's base URL to use. Defaults to the Library module. */
  module?: 'library' | 'voices';
  /** CSS selector proving the page's content has loaded. */
  anchor: string;
  /** Keyed ID whose localized value must appear in document.title (getPageTitle coverage).
   *  Use only IDs not runtime-overridden by site settings. */
  titleIncludesId?: string;
  /** Keyed string IDs (keys of the i18n interface maps) that must be rendered. */
  expectedIds: string[];
  /** Header IDs asserted alongside expectedIds. Defaults to the anonymous
   *  Library header set (or the logged-in set when `auth` is set). */
  headerIds?: string[];
  /** Requires a logged-in session. English-only: the shared storage state is
   *  anonymous on the Hebrew (.org.il) domain (see e2e-tests/CLAUDE.md §4). */
  auth?: 'user';
}

/** Anonymous desktop Library header (Header.jsx + HeaderAutocomplete.jsx). */
export const ANONYMOUS_HEADER_IDS = [
  'header.donate',                          // visible text link
  'common.sign_up',                         // visible SignUpButton (anonymous, Library only)
  'header.help',                            // aria-label on HelpButton
  'misc.toggle_interface_language_menu',    // aria-label (anonymous only)
  'header.library',                         // aria-label on ModuleSwitcher button
  'header.account_menu',                    // aria-label on logged-out dropdown
  'header_autocomplete.site_search',        // aria-label on search form
  'common.search',                          // search input placeholder
  'common.search_for_texts_or_keywords_here', // aria-label + title on search input
];

/** Header IDs that also render for a logged-in user (no anonymous-only ones). */
export const LOGGED_IN_HEADER_IDS = [
  'header.donate',
  'header.help',
  'header.library',
  'header_autocomplete.site_search',
  'common.search',
  'common.search_for_texts_or_keywords_here',
];

export const STRING_PAGES: StringsPageSpec[] = [
  {
    name: 'Texts home',
    path: '/texts',
    anchor: '.readerNavMenu',
    titleIncludesId: 'sefaria.sefaria_a_living_library_of_jewish_texts',
    expectedIds: [
      'texts_page.browse_the_library',
      'common.topics',                            // desktop header nav link
      'nav_sidebar.sidebar_navigation',           // aria-label on <NavSidebar>
      'common.weekly_torah_portion',              // LearningSchedules module
      'common.book_icon',                         // alt on calendar links
      'resources_module.resources',               // Resources module title
      'nav_sidebar.icon',                         // alt on Resources icon links
    ],
  },
  {
    name: 'Calendars',
    path: '/calendars',
    anchor: '.readerNavMenu',
    expectedIds: [
      'common.weekly_torah_portion',
      'calendars_page.daily_learning',
      'calendars_page.weekly_learning',
      'common.book_icon',
      // StayConnected module
      'nav_sidebar.get_updates_on_new_texts_learning_resources_features',
      'nav_sidebar.sefaria_on_facebook',
      'nav_sidebar.sefaria_on_instagram',
      'nav_sidebar.sefaria_on_youtube',
      // SupportSefaria module
      'nav_sidebar.sefaria_is_an_open_source_nonprofit_project_support',
      'common.donation_icon',
      'nav_sidebar.make_a_donation',
      'nav_sidebar.sidebar_navigation',
    ],
  },
  {
    name: 'Topics landing',
    path: '/topics',
    anchor: '.topicLandingPanel',
    titleIncludesId: 'common.topics',
    // topic_landing_search.explore_all_topics is deliberately absent: it is in
    // the SSR HTML but removed on client hydration at desktop width (mobile-only).
    expectedIds: [
      'topics_page.explore_by_topic',             // page title
      'topic_landing_seasonal.explore_the_jewish_calendar',
      // TopicLandingParasha (always rendered)
      'common.this_week_s_torah_portion',
      'topic_landing_parasha.learn_more_about',
      'common.read_the_portion',
      'topic_landing_parasha.browse_all_torah_portions',
      // TopicLandingSeasonal (loads async; a seasonal topic always exists)
      'common.on_the_jewish_calendar',
      // Newsletter signup form
      'common.first_name',
      'common.last_name',
      'common.email_address',
    ],
  },
  {
    // The all-topics browser (TopicPageAll.jsx) lives at /topics/all/<letter>
    // (urls_shared.py:52); bare /topics/all resolves as a topic whose slug is
    // "all" and renders a regular TopicPage instead.
    name: 'All topics',
    path: '/topics/all/a',
    pathHe: `/topics/all/${encodeURIComponent('א')}`,
    anchor: '.TOCCardsWrapper',
    expectedIds: [
      'topic_page_all.all_topics',
      'topic_page_all.search_topics',             // alt on search icon
      'topic_page_all.search_topics_2',           // placeholder
      // GetTheApp module
      'nav_sidebar.access_the_jewish_library_anywhere_and_anytime_with',
      'nav_sidebar.sefaria_mobile_app',
      'nav_sidebar.sefaria_app_on_ios',
      'nav_sidebar.sefaria_app_on_android',
      // SupportSefaria module
      'nav_sidebar.sefaria_is_an_open_source_nonprofit_project_support',
      'nav_sidebar.make_a_donation',
      'nav_sidebar.sidebar_navigation',
    ],
  },
  {
    name: 'Author topic page (Rashi)',
    path: '/topics/rashi',
    anchor: '.topicPanel',
    expectedIds: [
      'topic_page.works_on_sefaria',              // author-topic tab title
    ],
  },
  {
    name: 'Book TOC (Genesis)',
    path: '/Genesis',
    anchor: '.bookPage.fullBookPage',
    expectedIds: [
      'book_page.start_reading',                  // anonymous default (no reading history)
      'common.contents',                          // tab title
      'book_page.versions',                       // tab title (full book TOC only)
      // DownloadVersions module
      'nav_sidebar.download',
      'download_versions.select_version',         // aria-label
      'download_versions.select_format',          // aria-label
      'nav_sidebar.sidebar_navigation',
    ],
  },
  {
    name: 'Reader (Genesis 1)',
    path: '/Genesis.1',
    anchor: '.segment',
    expectedIds: [
      'reader_app.skip_to_main_content',          // skip link (sr-only, still in innerText)
      'common.text_display_options',              // aria-label on display-settings button
      'misc.toggle_reader_menu_display_settings', // alt on display-settings icon
    ],
  },
  {
    // The query is Hebrew in both interface languages: the interface strings
    // under test are unaffected by the query term, and Hebrew text is indexed
    // in every environment while local dev sandboxes often index no English.
    name: 'Search results',
    path: `/search?q=${encodeURIComponent('אהבה')}`,
    anchor: '.result.textResult',
    expectedIds: [
      'search_page.results',                      // renders once totalResults > 0
      'common.options',                           // TextSearchFilters (desktop sidebar)
      'search_filters.exact_matches_only',
    ],
  },
  {
    name: 'Voices home',
    path: '/',
    module: 'voices',
    anchor: '.sheetsHomepage',
    titleIncludesId: 'header.voices_on_sefaria',
    // The Voices header differs from the Library header (no SignUpButton etc.)
    // and was not source-verified — assert only page strings here.
    headerIds: [],
    expectedIds: [
      'sheets_home_page.community_powered_jewish_learning',
      'sheets_home_page.share_discover_join_the_conversation',
      'sheets_home_page.explore_user_created_content_by_topic',
      'nav_sidebar.sidebar_navigation',
    ],
  },
  {
    name: 'Public collections',
    path: '/collections',
    // /collections is a Voices-module route (the Library domain only redirects
    // to it, and a local Library server 404s it). The Voices header differs
    // from the Library header — skip header IDs.
    module: 'voices',
    anchor: '.readerNavMenu',
    headerIds: [],
    expectedIds: [
      'common.collections',
      'common.collection_logo',                   // alt, once collection listings load
      'nav_sidebar.create_a_collection',          // AboutCollections module title
      'nav_sidebar.get_updates_on_new_texts_learning_resources_features', // StayConnected
      'nav_sidebar.sidebar_navigation',
    ],
  },
  {
    name: 'Updates',
    path: '/updates',
    anchor: '.notificationsList',
    expectedIds: [
      'updates_panel.updates',
    ],
  },
  {
    // The saved/history page is /saved (urls_shared.py:33) — /texts/saved
    // silently redirects to /texts.
    name: 'Saved & History',
    path: '/saved',
    anchor: '.navTitle',
    auth: 'user',
    expectedIds: [
      'common.saved',                             // tab (alt + visible text)
      'common.history',                           // tab (alt + visible text)
      'user_history_panel.notes',                 // tab, Library module only
      // GetTheApp + SupportSefaria modules
      'nav_sidebar.sefaria_mobile_app',
      'nav_sidebar.make_a_donation',
      'nav_sidebar.sidebar_navigation',
    ],
  },
  {
    name: 'Notifications',
    path: '/notifications',
    anchor: '.notificationsHeaderBox',
    auth: 'user',
    expectedIds: [
      'common.notifications',
      'notifications_panel.notification_icon',    // alt on title icon
      'nav_sidebar.get_updates_on_new_texts_learning_resources_features', // StayConnected
      'nav_sidebar.sidebar_navigation',
    ],
  },
];
