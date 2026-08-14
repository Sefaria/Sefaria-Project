# Strapi specs (`e2e-tests/tests/`)

Playwright specs that drive `/api/strapi/graphql-cache` deterministically instead of depending on
live Strapi content. There are two ways to supply the payload, and both are in use:

| | Payload source | Reach for it when |
| --- | --- | --- |
| **Recorded** (`routeWithStrapiHarFixture`) | a committed `.har` captured from real Strapi | the question is "does Sefaria behave correctly against a payload Strapi really produced". Following the pattern the newsletter sign-up PR introduced. |
| **Synthetic** (`routeWithStrapiPayload`) | a payload built in code by the factory | the state is a permutation, an unpublishable field value, or a response Strapi would never send |

Recording came first, deliberately: fourteen real states were captured before any abstraction was
extracted, so the factory is shaped by observed variation rather than by a guess. The recordings
now do double duty — they are still the behavioural fixtures, and they are also the **schema the
factory is held to** by [`strapi-payload-contract.spec.js`](strapi-payload-contract.spec.js). See
[Synthetic payloads](#synthetic-payloads) for which to pick.

These specs intentionally sit **outside** the `PageManager` / `goToPageWithLang` conventions in
[`../CLAUDE.md`](../CLAUDE.md). The standard entry helpers call `installOverlaySuppression()`,
which short-circuits `/api/strapi/graphql-cache` with an empty payload and marks banners/modals as
already-seen — it suppresses the very content these specs assert on (CLAUDE.md §3, §22). So they
use a bare `page.goto` plus a Strapi route, keeping Strapi **on**.

## Files

| File | Role |
| --- | --- |
| [`../support/strapi-har-fixture.js`](../support/strapi-har-fixture.js) | `routeWithStrapiHarFixture(context, name)` — record/replay wrapper over `routeFromHAR`, matching `**/api/strapi/**`. |
| [`../support/strapi-payload-factory.js`](../support/strapi-payload-factory.js) | Builds a synthetic response body: `banner`/`modal`/`sidebarAd` document builders, `strapiPayload`, `targetCountries`, and the `daysFromNow`/`hoursFromNow` helpers measured from `SYNTHETIC_NOW`. Pure — no Playwright import. |
| [`../support/strapi-payload-fixture.js`](../support/strapi-payload-fixture.js) | `routeWithStrapiPayload(context, payload, {status, rawBody})` plus `expectStrapiServed` — fulfils the endpoint from a built payload, matching the URL glob alone. |
| [`strapi.fixtures.js`](strapi.fixtures.js) | The `SCENARIOS` map (one entry per recorded Strapi state) plus the setup helpers: `prepareStrapiPage`, `useInterfaceLanguage`, `advanceUntilVisible`, `advanceBy`, `waitForTimerArmed`. |
| [`strapi-payload-contract.spec.js`](strapi-payload-contract.spec.js) | Holds the factory's field set to what every committed recording actually contains — the guard that keeps synthetic payloads honest. Needs no server. |
| [`strapi-show-delay.spec.js`](strapi-show-delay.spec.js) | *(synthetic)* Each surface waits exactly its own `showDelay` — hidden a second before, visible a second after, with two surfaces on different delays. |
| [`strapi-selection-order.spec.js`](strapi-selection-order.spec.js) | *(synthetic)* Selection runs every viewer gate (locale, country, dismissal) and ranks eligible documents by specificity — Hebrew readers get their own document past English competitors, a dismissed winner falls through to the runner-up, a shorter window outranks a longer one, and identical documents tie to payload order. |
| [`strapi-excluded-paths.spec.js`](strapi-excluded-paths.spec.js) | *(synthetic)* A surface is withheld on the page its own button points at — including when it is the *other* locale's button URL that collides. |
| [`strapi-payload-resilience.spec.js`](strapi-payload-resilience.spec.js) | *(synthetic)* Empty, v4-shaped, 500 and non-JSON responses degrade to "no promotions" with the page intact. |
| [`strapi-modal.spec.js`](strapi-modal.spec.js) | A published modal reaches the client and renders. Asserts nothing about banners or sidebar ads. |
| [`strapi-modal-hebrew.spec.js`](strapi-modal-hebrew.spec.js) | Locale separation for modals: a Hebrew-only modal renders under Hebrew UI (header + button) and not under English UI. |
| [`strapi-modal-bilingual.spec.js`](strapi-modal-bilingual.spec.js) | Both locales published: each interface shows its own copy, plus the optional-header asymmetry. |
| [`strapi-banner-expired.spec.js`](strapi-banner-expired.spec.js) | An expired banner is delivered in the payload but not rendered — the client-side date gate. |
| [`strapi-banner-future.spec.js`](strapi-banner-future.spec.js) | A not-yet-started banner, same idea from the other side of the window. |
| [`strapi-banner-country-targeting.spec.js`](strapi-banner-country-targeting.spec.js) | Per-locale targeting on the banner call site: one viewer country for which the two locales disagree, plus each rule's own positive/negative. |
| [`strapi-modal-country-targeting.spec.js`](strapi-modal-country-targeting.spec.js) | `countriesToTarget` include-list gating, per locale — an English viewer outside the list is turned away while a Hebrew viewer in the same country is not. |
| [`strapi-banner.spec.js`](strapi-banner.spec.js) | A published banner renders; and dismissing it keeps it hidden across a reload. Asserts nothing about modals or sidebar ads. |
| [`strapi-banner-hebrew.spec.js`](strapi-banner-hebrew.spec.js) | Locale separation: a Hebrew-only banner renders under Hebrew UI (with its own per-locale button) and not under English UI. |
| [`strapi-banner-bilingual.spec.js`](strapi-banner-bilingual.spec.js) | Both locales published: each interface shows only its own copy and its own button URL. |
| [`strapi-sidebar-ad.spec.js`](strapi-sidebar-ad.spec.js) | Keyword targeting: an English ad shows on the prayer/beliefs topic categories and not on social-issues. |
| [`strapi-sidebar-ad-hebrew.spec.js`](strapi-sidebar-ad-hebrew.spec.js) | The same ad published only in Hebrew: keyword targeting under Hebrew UI, and absent under English UI. |
| [`strapi-sidebar-ad-date-states.spec.js`](strapi-sidebar-ad-date-states.spec.js) | Three ads — expired, active, future — all delivered, only the active one displayed. |
| [`strapi-sidebar-ad-bilingual.spec.js`](strapi-sidebar-ad-bilingual.spec.js) | Both locales published: exactly one ad renders per interface, carrying that locale's copy. |
| `../fixtures/strapi-*.har` | One self-contained recording per scenario (bodies embedded, no sidecars). |
| `*.template.js` | Early scaffolding from before any content was recorded, kept only for reference. Every state it anticipated is now covered by a real spec, so these are candidates for deletion. Not collected by any project. |

## Recorded scenarios

| Scenario | Recording | Contains |
| --- | --- | --- |
| `publishedModal` | `strapi-modal-published.har` | 1 English modal (`shavuot-2026-modal-example`), nothing else |
| `publishedModalHebrewOnly` | `strapi-modal-hebrew-only.har` | The same modal document with only its Hebrew locale published |
| `publishedModalBothLocales` | `strapi-modal-both-locales.har` | The same modal document with BOTH locales published; header authored in Hebrew only |
| `modalCountryTargeted` | `strapi-modal-country-targeted.har` | The same modal with per-locale targeting: en = include [GB], he = all |
| `bannerNotYetStarted` | `strapi-banner-future.har` | A banner starting after the pinned clock, `countryMode: all`; same pinned instant as `bannerExpired` |
| `bannerExpired` | `strapi-banner-expired.har` | A banner whose window ended before the pinned clock, alongside a still-active modal used as the control |
| `bannerCountryTargeted` | `strapi-banner-country-targeted.har` | The banner with per-locale targeting: en = exclude [US], he = include [IL]; pinned a day later so it has its own cache key |

| `publishedSidebarAd` | `strapi-sidebar-ad-published.har` | 1 English sidebar ad with `keywords: 'prayer, beliefs, !social-issues'` |
| `publishedSidebarAdHebrewOnly` | `strapi-sidebar-ad-hebrew-only.har` | The same ad document with only its Hebrew locale published |
| `sidebarAdDateStates` | `strapi-sidebar-ad-date-states.har` | Three English ads covering every date state at one pinned clock |
| `publishedSidebarAdBothLocales` | `strapi-sidebar-ad-both-locales.har` | The same ad document with BOTH locales published (two in-app ads, filtered at match time) |
| `publishedBanner` | `strapi-banner-published.har` | 1 English banner (`2026-purim-banner-2`), nothing else |
| `publishedBannerHebrewOnly` | `strapi-banner-hebrew-only.har` | The same banner document with only its Hebrew locale published |
| `publishedBannerBothLocales` | `strapi-banner-both-locales.har` | The same banner document with BOTH locales published (exercises the documentId merge) |

Per-scenario quirks worth knowing, because they shaped the assertions:

- **Modal (English row)**: `modalHeader` is `null`, so no `<h1 class="int-en">` renders — that spec
  asserts on body text. `countriesToTarget` is `null`, so the country gate always passes and
  timezone is irrelevant.
- **Modal (Hebrew row)**: by contrast it *does* have a `modalHeader`, so the `int-he` `<h1>`
  renders and is asserted. Same field, opposite nullability per locale on the same document.
- **Banner**: `bannerText` is markdown (`**MATCHING**` → `<strong>`), so the asserted substring
  deliberately avoids the bold span.
- **Hebrew-only banner**: the *same document* as `publishedBanner` with a different locale
  published, which is why one recording covers both directions of locale separation — the GraphQL
  query always asks for every locale, so the request is identical under either interface language
  and only the client-side `banner.locales.includes(...)` gate differs. Its button carries a
  **different campaign id** from the English row (`/give/468442/` vs `/give/451346/`), so
  `buttonURL` is genuinely per-locale rather than a shared link; the spec asserts the `int-he`
  anchor's href to lock that in. The component always renders both an `int-en` and an `int-he`
  anchor and lets CSS pick — target the locale-specific one, since the other is empty and hrefless
  when that locale is unpublished.

Strapi holds other content (Hebrew modals, a Hebrew sidebar ad) whose date windows fall outside
these scenarios' ±14-day fetch range, so the server never returns it. Verified against the live
endpoint before recording — worth re-checking whenever you record, since a recording captures
everything published *and in-window* at that moment.

### Three different render behaviours — assert accordingly

The parts of a banner/modal behave differently from one another, and conflating them yields
assertions that prove nothing:

| | Rendered by | In the DOM | How to assert |
| --- | --- | --- | --- |
| **Text** | `<InterfaceText>` — emits a **single** span for the active language (`Misc.jsx`) | only the active locale | `toContainText` / `not.toContainText` are meaningful |
| **Buttons** | both an `int-en` and an `int-he` anchor are hardcoded; CSS hides one | both locales, always | must use `toBeVisible` / `toBeHidden` — a text or count check matches the hidden anchor |
| **Modal header** | one `<h1>` per locale, gated on **truthiness only**, not on the active language | only locales that authored one | `toHaveCount(0)` = unauthored; `toBeHidden()` = authored but wrong locale |

The header row is the subtle one. `modalHeader` is optional, so an unauthored header is genuinely
**absent** from the DOM while the other locale's header is **present but CSS-hidden**.

Rather than hardcoding which locale happens to have one, the bilingual modal spec asserts the
*rule* — a header is displayed exactly when the response carried one for the active locale — and
branches on the descriptor:

```js
const { header } = byLocale[lang];
if (header) {
  await expect(modal.locator(`h1.${anchor}`)).toBeVisible();
  await expect(modal.locator(`h1.${anchor}`)).toHaveText(header);
} else {
  await expect(modal.locator('h1:visible')).toHaveCount(0);   // no header, from ANY locale
}
```

Re-recording with different content changes only the descriptor; the tests follow. The negative
branch checks for no *visible* header rather than the absence of one specific element, which is
deliberately stronger: it also fails if the other locale's header leaks past the CSS hiding it.
Verified by injecting `h1.int-he { display: block }` — the English case then fails while the Hebrew
case still passes.

`InterfaceText` also falls back across languages (`isHebrew ? (he || en) : (en || he)`), tagging the
result `enInHe` / `heInEn`. That is a *different* mechanism from the banner's locale gate, which
prevents rendering entirely — don't confuse the two when a locale is missing.

### `shouldShow()` excludes the page a button links to

Both banners and modals refuse to render on the pathname their own button points at:
`excludedPaths` starts as `/donate`, `/mobile`, `/app`, `/ways-to-give` and gains
`new URL(buttonURL).pathname` for each locale. When picking a path for a new scenario, check the
recorded `buttonURL` first — a collision silently suppresses the surface and any negative
assertion in that spec becomes vacuous.

Worth knowing when picking a path: **no page in this app ever has pathname `/`** — `GET /` returns
`302 → /texts`. So a `buttonURL` of a bare domain (pathname `/`) contributes an entry that can
never match, while one pointing at a real route would genuinely suppress the surface there.
Verified rather than assumed, after a test written on the wrong premise failed.

### Dates are checked twice, and only the second check is ours to test

| | Where | Condition |
| --- | --- | --- |
| Server filter | the GraphQL query | the item's *whole* window must fit inside now ± 14 days |
| Client check | `context.js` / `Promotions.jsx` | *now* must fall between the item's start and end |

An item can pass the first and fail the second — delivered, then declined. Each spec asserts both
halves: that the payload the page received really contains the banner, and that nothing renders.

The client check is a **conjunction of two comparisons**, and each scenario covers one of them:

```js
currentDate >= new Date(b.bannerStartDate) && currentDate <= new Date(b.bannerEndDate)
```

| scenario | window vs. the pinned clock | comparison exercised |
| --- | --- | --- |
| `bannerExpired` | ended before it | the second (`<= end`) |
| `bannerNotYetStarted` | starts after it | the first (`>= start`) |

Both pin the **same instant**, so the pair differs only in where the content sits relative to it.
They are not redundant: if the first comparison were inverted, every expired test would still pass.

**Sidebar ads get all three states in one recording**, because Promotions filters each ad
independently and renders every match, whereas `context.js` surfaces only the first date-active
banner/modal. `sidebarAdDateStates` holds an expired, an active and a future ad that are identical
apart from title and window — same `!everywhere` keywords, `showTo`, `debug` and locale — so the
date is the only thing that can separate them, and if the filter were ignored all three would
render. The active ad doubles as the positive control.

That is a *different implementation* of the same rule, so neither set of date tests covers the
other:

| surface | where | shape |
| --- | --- | --- |
| banner / modal | `context.js` | `.find()` — selects the first active item |
| sidebar ad | `Promotions.jsx` | `.filter()` — rejects each inactive ad |

Two design choices make that assertion mean something:

- **The viewer country is GB, not US.** The banner targets `exclude [US]`, which GB passes, so
  expiry is the *only* gate it fails. Under a US viewer it would fail two gates at once and its
  absence would prove nothing about dates.
- **The positive control is a real render**, not just "a response arrived": a co-published modal is
  still active at the pinned clock, and the test waits for it to appear. That one step proves the
  payload arrived, the clock advanced past `showDelay`, and rendering works.

Verified by pushing the recorded `bannerEndDate` past the pinned clock — the banner then renders and
the test fails.

### Choosing a viewer country that can actually detect the bug

Per-locale targeting is only observable through a viewer for whom the two locales **disagree**. The
banner scenario targets `en → exclude [US]` and `he → include [IL]`, which makes GB the
discriminating country: English shows the banner (GB is not excluded), Hebrew does not (GB is not
included). An IL or US viewer gets the same answer from both locales, so those cases cannot tell a
correct implementation from one that applies the English row to everything.

Verified by running the spec against the pre-fix code: of its four tests, **exactly one failed** —
the Hebrew half of the GB pair. Worth remembering when adding targeting scenarios: pick the viewer
country where the rules conflict, or the test proves nothing about localization.

### These specs complement the Jest tests, they do not repeat them

`static/js/sefaria/tests/` already covers the pure logic exhaustively — `strapiTargeting.test.js`
(every `countryMode`, empty/null lists), `countryCandidates.test.js` (how IP, timezone and locale
signals combine), `strapiLocalization.test.js` (the `documentId` grouping). 67 tests, all green.

What unit tests cannot reach is the **call site**: whether the component feeds those functions the
right object for the document actually on screen, once the payload has been fetched, merged and
gated. That is this suite's job — and it is how the per-locale targeting behaviour below surfaced,
since no unit test asserts which locale row supplies a shared field.

### Sidebar ads behave unlike banners and modals

Worth reading before extending that surface — four differences, each of which shapes a test:

| | Banners / modals | Sidebar ads |
| --- | --- | --- |
| Locale filtering | rows merged per `documentId`, component gates on `locales.includes(active)` | one in-app ad emitted **per locale**, filtered by `ad.trigger.interfaceLang === context.interfaceLang` |
| How many render | only the FIRST date-active one is surfaced by `context.js` | Promotions renders **all** matches |
| Delay | `showDelay` timer must elapse | none — renders as soon as the payload lands, so ad specs never advance the clock |
| Extra gating | date window, country, showTo, excluded paths | date window, showTo, `debug`, and **keyword overlap with the page** |

Because ads fan out per locale, a bilingual ad yields **two** in-app ads sharing one
`internalCampaignId` — which Promotions passes as the React `key`. A locale filter that stopped
discriminating would render two elements with a duplicate key, so the bilingual ad spec asserts
`toHaveCount(1)` rather than merely checking that the right title appears. And since only the
matching ad is rendered at all, the other locale's copy is genuinely absent from the DOM (unlike
banner buttons, where both anchors exist and CSS hides one).

Keyword matching is an OR: an ad shows when a keyword matches, *or* when it declares exclusions and
none of them match. So an ad keyed `'prayer, beliefs, !social-issues'` also appears on unrelated
pages — `social-issues` is the only place it is actively suppressed.

The ad specs use `/topics/category/<slug>`, not `/topics/<slug>`: the latter 404s unless the topic
is in the active module's pool, and that pool lives in Postgres (`django_topics`), whose tables are
empty on a stock local sandbox. The category route has no such gate; its main content is empty
without pool data, but the sidebar — which is what hosts the ad — renders regardless.

Both ad scenarios carry `debug: true`, so **they require a sandbox running with `DEBUG=True`**
(`showGivenDebugMode` hides debug ads otherwise). That also makes the button icon load from the
Strapi host directly, the one request in this suite that is not served from a HAR.

## What is covered

Every gate each surface applies, so a new scenario can be checked against this before being written.

| gate | modal | banner | sidebar ad |
| --- | --- | --- | --- |
| locale: en-only / he-only / both | ✓ ✓ ✓ | ✓ ✓ ✓ | ✓ ✓ ✓ |
| country targeting | ✓ `include`, per locale | ✓ `exclude`, per locale | n/a — no field on this type |
| keyword targeting | n/a | n/a | ✓ matching + excluded topic |
| date window: expired / future | — | ✓ ✓ (`context.js` selection) | ✓ ✓ (`Promotions` filtering) |
| dismissal persists across reload | — | ✓ | n/a — no dismiss control |
| `showDelay` boundary | ✓ *(synthetic)* | ✓ *(synthetic)* | n/a — no delay on this type |
| selection among several in-window | ✓ *(synthetic; locale gate + ranking)* | ✓ *(synthetic; locale + country gates, dismissal fallthrough, window ranking)* | n/a — all matches render |
| `excludedPaths`, incl. cross-locale | ✓ *(synthetic)* | — (same code path as the modal) | n/a |
| malformed / failed response | ✓ *(synthetic)* | ✓ *(synthetic)* | ✓ *(synthetic)* |

Deliberately **not** covered, with reasons:

- **More country modes or edge cases at this layer.** `matchesCountryTarget` has ~28 exhaustive Jest
  cases; integration owns the wiring, not the predicate. Two country cases per call site is the
  budget — a synthetic country matrix would be cheap to write and would still be duplication.
- **Logged-in visitor states** (`showTo: logged_in_only`, sustainer, returning-visitor). Needs an
  authenticated profile; every scenario so far runs logged out. The factory removes the *payload*
  obstacle, so this is now only an auth-fixture problem.
- **Mobile viewport.** `shouldDeployOnMobile` exists on the payload and is never asserted.
- **Analytics.** Impression and interaction events fire through `gtag`/`sa_event`; see the note in
  the interaction section for why a naive stub does not capture them.

### Selection behavior (formerly the "known gap")

This suite once carried `test.fail()` markers for one defect: gating was applied *after*
selection. `context.js` picked a single winner on the date window alone (`.find()`), then
`Misc.jsx` gated that one document with no fallback to the runner-up — so a Hebrew reader saw
**nothing at all** while any English-only document shared the window (`groupByDocumentId`
flattens every `en` row before every `he` row, so order was never a workaround).

The sc-45891 fix moved every viewer gate into selection itself
(`static/js/sefaria/strapiSelection.js`, shared with `shouldShow()`): date window, locale,
country, audience (`showTo` + user-kind flags), and dismissal all run *before* the list is
collapsed, so an ineligible document is skipped in favor of one the viewer can see. Among several
eligible documents the most specific wins, tier by tier:

1. country include-list naming the viewer > untargeted;
2. restricted audience > everyone;
3. locale-exclusive > bilingual;
4. shorter date window > longer;
5. earlier start date > later (equal-length overlaps expire in start order, so the earlier one
   is the more urgent — the viewer will still see the later one after it ends);
6. payload order (stable) breaks remaining ties.

Two tier orderings were examined and deliberately ratified (2026-08-13), each pinned by its own
unit + e2e tests: **exclusivity beats urgency** (a locale-exclusive weekly outranks a bilingual
daily for its reader) and **country targeting beats urgency** (an include-targeted monthly
outranks an untargeted daily for a viewer both may address).

Two consequences worth knowing when writing tests here: a **dismissed** document is ineligible, so
the runner-up wins the next load (dismissal keys are kept for every document still in the payload
and dropped for vanished ones); and the **path guard** (`/donate` etc. + the button's own page)
stays display-only, so the winner is page-independent and nothing is shown on excluded pages
rather than a lower-ranked rival. The former `test.fail` markers are now ordinary passing tests in
`strapi-selection-order.spec.js`, each still paired with its controls.

## The levers

- **Locale** → `useInterfaceLanguage(page, LANGUAGES.HE)` before the first navigation, then
  `expectInterfaceLanguage(page, …)` to confirm it applied. Sets the `interfaceLang` cookie on the
  context, matching the newsletter suite's Hebrew tests. Deliberately *not* `/interface/<lang>`:
  that route can redirect to a different domain for Hebrew and navigate off the local sandbox. The
  cookie must be a real context cookie rather than `document.cookie` in an init script, because the
  server picks the language while rendering.
- **Country** → the `cf-ipcountry` request header, via
  `test.use({ extraHTTPHeaders: { 'cf-ipcountry': 'US' } })`. `candidateCountries()` unions three
  signals — IP country, timezone and `navigator.language` — but the IP one dominates locally,
  because the middleware falls back to `PINNED_IPCOUNTRY` (`"GB"` in `local_settings.py`) whenever
  the header is absent. Every local viewer therefore looks British by default, and **`timezoneId`
  alone cannot produce a negative case**.
  Do *not* vary `timezoneId` to change country: the client converts to LOCAL midnight when deriving
  `start_date`/`end_date`, so a different timezone changes the query string and the recorded HAR
  stops matching. Holding the config default lets one recording serve every country case.
- **Date / determinism** → `prepareStrapiPage` installs a fake clock at `scenario.pinnedNow` before
  the first navigation.

Each scenario's `pinnedNow` is load-bearing and satisfies three constraints at once:

1. the server-side filter window contains the recorded content's whole active window;
2. the client-side re-check (`now` between start and end) passes;
3. the derived query string is byte-identical to the recording, so `routeFromHAR` matches on URL.

Change it and that scenario's recording no longer matches.

### Time is under test control

`prepareStrapiPage` uses `clock.install()`, not `clock.setFixedTime()`. Both pin `Date`/`Date.now`
(which is what keeps the query params matching), but `install()` **also fakes timers**. That
matters because every banner and modal arms a `setTimeout(showDelay * 1000)` before it renders:

| | Real timers (`setFixedTime`) | Fake timers (`install` + `pauseAt`) |
| --- | --- | --- |
| "does it appear?" | works, but waits real seconds | works, instantly |
| "still hidden before the delay?" | not expressible | straightforward |
| "never appears" | a wall-clock guess | app time only moves when you move it |

> ⚠️ **`install()` on its own is not enough — it leaves the clock RUNNING in step with real time.**
> Measured: ~2949ms of app time elapses over 3s of real time under `install()`, and 0ms once
> `pauseAt()` is added. `prepareStrapiPage` therefore calls both.
>
> This was wrong here for a while and cost nothing, because every recorded scenario asserts only
> "does it eventually appear" or "is it still absent after a big jump" — both indifferent to extra
> time passing. It silently defeats a **boundary** assertion, which is how it was caught: a
> "visible after the delay" assertion passed without the advance that was supposed to cause it.
> The lesson generalises — a clock helper that is good enough for eventually-assertions can still
> be wrong, and only a boundary test will tell you.

Two helpers drive it:

- `advanceUntilVisible(page, locator)` — steps the clock until the surface appears. Stepping rather
  than one big jump because the `showDelay` timer is only armed once React has applied the Strapi
  payload, which happens asynchronously after navigation; a single early `fastForward` would
  advance past nothing and the surface would never appear.
- `advanceBy(page, ms)` — moves a known amount, for deliberately straddling the delay boundary.

**Negative assertions need a positive control.** "The surface is not visible" can pass because the
feature works, because no payload arrived, or because time never advanced. The persistence test in
`strapi-banner.spec.js` guards all three: it asserts the banner *does* render first, waits for the
reloaded page to receive another Strapi payload (`waitForStrapiResponse`), and only then advances
past the delay and asserts absence. Verified by mutation — clearing the dismissal key before the
reload makes the banner reappear and the test fail.

### ⚠️ `showDelay` boundary tests — use `waitForTimerArmed`

There is a gap between "the Strapi response arrived" and "the `showDelay` timer is armed", and
`waitForStrapiResponse` only closes the first half of it. After the response event fires the app
still has to:

1. `await response.json()` — another microtask;
2. run the `.then()` that calls `setStrapiData` / `setBanner` / `setModal`;
3. re-render, so the component's `useEffect([strapi.banner])` runs `shouldShow()` and *finally*
   calls `setTimeout(showDelay * 1000)`.

`advanceUntilVisible` is immune because it keeps stepping until the surface appears — whenever the
timer arms, a later step fires it. **A boundary test using `advanceBy` is not immune**, and it fails
in the dangerous direction:

```js
await waitForStrapiResponse(page);
await advanceBy(page, 500);            // if the timer is not armed YET, this advances past nothing
await expect(banner).toBeHidden();     // ✅ passes — but would also pass if showDelay were broken
await advanceBy(page, 600);            // timer armed at t=500 still needs a full 1000ms
await expect(banner).toBeVisible();    // ❌ flakes
```

The "still hidden" half passes **vacuously**, which is exactly the assertion you were trying to
make meaningful.

**The fix: wait for the timer itself, not for the response.** `prepareStrapiPage` instruments
`setTimeout` in an init script registered *after* `page.clock.install()` — init scripts run in
registration order, and `install()` registers its own, so this wraps the **faked** `setTimeout`
rather than the native one it replaced. `waitForTimerArmed(page, delayMs)` then polls until a timer
of that exact delay exists:

```js
await waitForTimerArmed(page, SHOW_DELAY_SECONDS * 1000);   // now advanceBy is meaningful
await advanceBy(page, (SHOW_DELAY_SECONDS - 1) * 1000);
await expect(banner).toHaveCount(0);
await advanceBy(page, 2000);
await expect(banner).toBeVisible();
```

Two things worth knowing:

- **It doubles as a gate check.** The `useEffect` only arms the timer when `shouldShow()` returns
  true, so a timer of that delay existing also proves locale, country, `showTo` and `excludedPaths`
  all passed. Conversely, in a test where the surface is *expected* to be withheld no timer is ever
  armed — don't wait for one there, or you will wait out the timeout.
- **It matches on the delay value**, and pages arm plenty of timers of their own. Pick a `showDelay`
  nothing else is likely to use — `strapi-show-delay.spec.js` uses 7s and 11s. A round 1s risks
  matching a third-party timer and resolving before the surface's own timer exists, which puts the
  vacuous pass straight back.

Worked example: [`strapi-show-delay.spec.js`](strapi-show-delay.spec.js). Mutation-verified in both
directions — asserting "hidden" after the boundary fails, and asserting "visible" without crossing
it fails.

## Scenarios

`strapi.fixtures.js` holds one entry per representative Strapi state — a recorded `.har`, the
`pinnedNow` it was recorded under, and a description of what it contains. Specs read
`SCENARIOS.<name>`; they never hardcode content.

To add a state:

1. Publish it in local Strapi — **and only it**. One GraphQL call returns banners, modals and
   sidebar ads together, so a recording captures everything published at that moment. Leave
   unrelated content unpublished or the fixture carries noise later scenarios work around.
2. Add a `SCENARIOS` entry with a new `har` name and a `pinnedNow` inside the content's window.
3. Write the spec against that scenario.
4. Record (below), fill in `expected`, commit the single `.har`.

Recordings are `updateContent: 'embed'` + `updateMode: 'minimal'`, so each scenario is **one
self-contained file** — no SHA-named sidecars to forget, and the payload is readable in review and
diffable. That last property matters: these recordings are the raw material for the payload
factory we intend to extract once the range of content patterns is visible (see below).

## Recording

Requires the local Django server **and** a Strapi instance configured (`STRAPI_LOCATION` /
`STRAPI_PORT` in `sefaria/local_settings.py`, which makes `STRAPI_INSTANCE` truthy in
`templates/base.html`; without it the client never fires the fetch).

```bash
RECORD_HAR=1 ./node_modules/.bin/playwright test --project=chrome-strapi --workers=1 \
  e2e-tests/tests/strapi-modal.spec.js
```

`update: true` rewrites the HAR on every context close, so record **one spec at a time** rather
than the whole suite.

> ⚠️ **The Django cache is keyed on the date range only.**
> `sefaria/views.py` builds `strapi_graphql_{SCHEMA_VERSION}_{start_date}_{end_date}` — **the
> GraphQL query body is not part of the key**. The cache exists to spare Strapi excessive API
> calls, and Strapi flushes it by webhook whenever content changes, so *content* edits are picked
> up immediately and re-recording after publishing something is safe.
>
> The residual trap is a **query change without a content change**: add a field to the query in
> `context.js`, re-record under the same `pinnedNow`, and you are handed the previous payload
> shaped by the old query — no webhook fires, because nothing was published. Move `pinnedNow` to a
> different day (which changes the key) or flush the cache by hand.
>
> Giving each new scenario its own `pinnedNow` sidesteps this for free, and is why
> `bannerCountryTargeted` sits a day after the other banner scenarios.

> ⚠️ **Re-recording a spec whose content is no longer published will silently overwrite its fixture
> with an empty payload.** The *live instance* is in one state at any given moment, but the
> committed recordings span several. (Strapi is perfectly capable of publishing many entries at
> once — `strapi-sidebar-ad-date-states.har` holds three — the constraint is temporal, not a limit
> on what can be published.) Only ever record the spec whose state is currently published, which is
> why `strapi-banner-hebrew.spec.js` is a separate file from `strapi-banner.spec.js` rather than
> another `describe` inside it.

## Synthetic payloads

Recording every permutation by hand does not scale. Multi-item states are perfectly *recordable* —
they are just unaffordable: each combination of order × locale × targeting × date state is another
hand-authored publishing session, and since the live instance holds one state at a time,
re-recording an older scenario later means reconstructing the state it was captured under. Two
further classes are out of reach entirely: field values no editor would author (a `buttonURL` whose
pathname collides with the page under test) and responses Strapi will never send (malformed JSON,
HTTP 500, a v4-shaped body).

So [`strapi-payload-factory.js`](../support/strapi-payload-factory.js) builds the response body in
code and [`routeWithStrapiPayload`](../support/strapi-payload-fixture.js) fulfils the endpoint from
it. Synthetic routes match the **URL glob alone**, which also sidesteps the standing HAR tax: since
`routeFromHAR` matches on the POST body, adding one field to the GraphQL query in `context.js`
invalidates all fourteen recordings at once.

```js
const strapi = await routeWithStrapiPayload(
  context,
  strapiPayload({
    modals: [
      modal({
        window: { start: daysFromNow(-1), end: daysFromNow(1) },
        shared: { showDelay: 7, countriesToTarget: targetCountries('include', ['GB']) },
        locales: { en: { modalText: 'English copy' }, he: { modalText: 'עותק עברי' } },
      }),
    ],
  }),
);
await prepareStrapiPage(page, { pinnedNow: SYNTHETIC_NOW });
// ... and expectStrapiServed(strapi) in afterEach
```

Three things to know before using it:

- **A locale block may carry *any* field, not just localized ones.** Localized fields differ per
  locale naturally; setting a *non-localized* field inside a locale block emits rows that
  **disagree**, which is how the `rows[0]`-wins merge bug class stays testable.
- **`expectStrapiServed` is not optional.** It catches the mirror image of the HAR suite's
  stale-fixture guard: here the payload always matches, so the danger is that no request happens at
  all (`STRAPI_INSTANCE` unset, or the standard entry helpers suppressing the endpoint), which
  would make every absence assertion pass while testing nothing.
- **Row order within each alias is the order documents are passed** — a documented guarantee, since
  `context.js` selects with `.find()` and order decides the winner.

### Which to reach for

| Use | For |
| --- | --- |
| **Recorded** | the response *shape* (a real payload, really produced), and locale/targeting/date behaviour on content an editor plausibly publishes |
| **Synthetic** | permutations (several items, specific order), unpublishable field values, error and malformed responses, and precise timing |

Keep at least one recording per content type committed — the contract spec's coverage guard fails
if a content type is never exercised, because the field-set check would then go quietly vacuous.

### What the recordings have taught us about the shape

These are the constraints the factory supports, each observed in a real recording rather than
assumed. They are the factory's specification — `FIELD_DEFAULTS` and the `locales`/`shared` split
exist to satisfy them:

- **A localized field may hold the same value in every locale, or different values.** The bilingual
  banner points each locale at a *different* donation campaign (`/give/468442/` vs `/give/451346/`);
  the bilingual sidebar ad uses an *identical* `buttonURL` in both. Sameness is a property of the
  content, not the schema — so the factory must let each locale's value be set independently and
  must not derive one locale from another.
- **Localized fields are not only text.** `buttonURL` is localized too, so "translate the strings"
  is the wrong mental model.
- **Every localized field is independently nullable, per locale.** `modalHeader` is authored in
  Hebrew and null in English on one document; a sidebar ad's `buttonText`/`buttonURL` were null in
  Hebrew before being filled in. Absence in one locale says nothing about the other.
- **A document may have one locale row or two.** Fields outside `LOCALIZED_FIELDS` (`showDelay`,
  `showTo`, background, the start/end dates for all three surfaces, and a sidebar ad's
  `internalCampaignId` and `keywords`) are assumed identical across rows — `groupByDocumentId`
  takes them from `rows[0]`, always the English row. Anything an editor can vary per locale must be
  listed in `LOCALIZED_FIELDS`, or the first row silently wins. `countriesToTarget` was moved there
  for exactly that reason, after this suite caught the Hebrew value being dropped. The factory can
  emit rows whose shared fields disagree — put the field in a `locales` block rather than `shared` —
  so that class of bug stays testable.

  As of now `LOCALIZED_FIELDS` is exactly: banner `bannerText`, `buttonText`, `buttonURL`,
  `countriesToTarget`; modal the same plus `modalHeader`, `modalText`; sidebar ad `title`,
  `bodyText`, `buttonText`, `buttonURL`. Four sidebar-ad fields were once added here on the
  strength of API divergence and then reverted — see the warning below, and check
  `static/js/sefaria/strapiLocalization.js` rather than trusting any prose, including this.

  To find candidates: pull the wide window, group the `en_*`/`he_*` rows by `documentId`, and diff
  every field that is *not* in `LOCALIZED_FIELDS`.

  > ⚠️ **A field differing between locales is NOT evidence that it is localizable.** Strapi
  > propagates an edit to a non-localized field into the other locale's *draft*, but that locale's
  > *published* row keeps its old value until it is re-published — so a stale publish produces
  > exactly the same signal. Compare `publishedAt` across the two rows before concluding anything:
  > if they differ, suspect timing, not schema. **The CMS field configuration is the only authority
  > on what is localizable — ask before changing `LOCALIZED_FIELDS`.** This was learned the hard
  > way: four sidebar-ad fields were added on the strength of API divergence and then reverted once
  > the timestamps showed the Hebrew row was a day stale.
- **The three surfaces consume locale differently** — merge-and-gate for banners/modals, fan-out
  per locale for sidebar ads (see the table above). A factory that emits the raw per-locale rows,
  as the endpoint does, stays correct for all three; one that models "a document with translations"
  would bake in the banner/modal view and misrepresent ads.

## Running (replay)

```bash
./node_modules/.bin/playwright test --project=chrome-strapi
```

Replay still needs the Django server running — it serves the page HTML and every other Sefaria
API. Only `/api/strapi/**` is intercepted.

## Hermetic with respect to Strapi

**These specs never call the live Strapi backend in replay mode.** The recorded payload *is* the
test input: it encodes a representative content state, and the spec asserts how Sefaria's frontend
and Django layer behave given that state. Consulting live Strapi would change what is under test
and make results depend on whatever happens to be published that day.

There are exactly two modes, with no silent third one:

| Mode | Strapi traffic |
| --- | --- |
| Replay (default), request matches the HAR | Served from the fixture |
| Replay, request **misses** the HAR | **Blocked** (aborted) + reported — never forwarded |
| `.har` file missing | Throws immediately, telling you to record |
| `RECORD_HAR=1` | Passes through to the real backend, by design |

Whether the Django cache layer talks to Strapi correctly is a *separate* concern, covered by
VCR.py-style tests on the Python side rather than by these browser specs.

Proof it holds: unpublish the modal in Strapi and re-run — the spec still passes, because it is
asserting on the recording, not on live content.

### Stale-fixture guard

A blocked request on its own would surface only as a generic "element not visible", which is
indistinguishable from the feature genuinely being broken. So `routeWithStrapiHarFixture`
registers a guard route *before* `routeFromHAR` (Playwright evaluates routes most-recently-added
first, so `routeFromHAR` gets first refusal and the guard only sees requests it declined). The
guard records the unmatched URL and aborts it; `expectStrapiServedFromHar(har)` in `afterEach`
then fails with an explicit message naming the URL and the likely cause:

```
Error: Strapi request(s) did not match the HAR fixture and were BLOCKED (these specs never call
live Strapi), so the page received no Strapi data:
  - http://localhost:8000/api/strapi/graphql-cache?start_date=2026-07-22&end_date=2026-08-19
  * the GraphQL query in static/js/context.js changed (a field added or removed) …
  * the scenario's pinnedNow changed …
  * the spec is pointing at a different scenario than the one that was recorded.
```

The first cause is the likeliest: `routeFromHAR` matches on the POST body as well as the URL, so
adding or removing a field in the `context.js` GraphQL query invalidates **every** scenario at
once. That cost is one of the main reasons to move most permutations onto a payload factory,
which matches on the URL glob alone. Clock drift is a non-issue — each scenario pins a constant.

The guard is inert while recording. Bootstrapping a new spec against a real backend is done by
running it in record mode — the only supported way to reach live Strapi.

### Verifying the *content* is coming from the HAR

The guard proves the request was *matched*. To additionally confirm the recorded bytes are what
the page renders, patch a sentinel into the recorded response body and re-run — the test must
**fail**, showing the sentinel:

```bash
python3 - <<'PY'
import json
p='e2e-tests/fixtures/1a355a73ae00f52c32c7e07f6c48727f305159a8.json'
d=json.load(open(p)); d['data']['en_modals'][0]['modalText']='SENTINEL'
open(p,'w').write(json.dumps(d,separators=(',',':')))
PY
```

Restore the file afterwards (`git checkout` it).
