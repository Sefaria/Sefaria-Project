# Story test status: Library Assistant Q4, scope `@scope-general`

Run against **production** (`SANDBOX_URL=https://www.sefaria.org`, `SANDBOX_URL_IL=https://www.sefaria.org.il`), 2026-10-13,
projects `chrome-assistant-stories` (desktop 1280×800) and `chrome-assistant-stories-phone` (393×852, touch), `--retries=0`.
`@scope-mobile` and `@scope-anon` scenarios are not covered here.

Classes: **black-box** (needs nothing but the feature), **needs-seam** (also needs a testability seam listed below),
**manual**, **blocked**. "Pass" means the behaviour already exists today.

| ID | Class | Result on the current site (first failure) | Seams needed |
|---|---|---|---|
| LA-A11Y-1 Reduced motion | needs-seam | `@fail`: no answer-ready dot appears, so there is nothing that could bounce. Later steps need the login prompt (SeamMissing) | dot test id; free-answer-limit seam; Ask copy keys |
| LA-RTL-1 Hebrew layout | needs-seam | `@fail`: CopyKeyMissing `assistant.floating_button.label` (he). Today's Hebrew trigger does sit bottom-left. "Announcements are in Hebrew" checks what was announced at the earlier answer-ready moment; that record is kept across the reload the login-prompt step does. So it never needs a new answer after the free-answer limit | chatbot catalog; dot test id; free-answer-limit seam |
| LA-NOTE-1 Answer while closed (desktop) | needs-seam | `@fail`: the answer lands but no red dot appears | dot test id; keys `assistant.header.response_ready_announcement`, `assistant.header.open_ready_response` |
| LA-NOTE-1 (phone) | needs-seam | `@fail`: there's no assistant at 393px, so the question can't be asked | as above |
| LA-NOTE-2 Look and timing | needs-seam | `@fail`: no dot (Given) | dot test id |
| LA-NOTE-3 Opening clears it (desktop + phone) | needs-seam | `@fail`: no dot on desktop; no assistant on the phone | dot test id |
| LA-NOTE-4 Relabelled button gets the dot | needs-seam | `@fail`: CopyKeyMissing `assistant.floating_button.search_label` | chatbot catalog; dot test id |
| LA-NOTE-5 Reduced motion | needs-seam | `@fail`: no dot | dot test id |
| LA-BTN-1 Everyone sees Ask (4 rows, desktop + phone) | needs-seam | `@fail`: logged-out rows have no Ask button. Logged-in desktop rows: the button exists, then CopyKeyMissing `assistant.floating_button.label`. Phone: no assistant | chatbot catalog |
| LA-BTN-2 Assistant off | needs-seam | `@fail`: SeamMissing (no assistant-off account). Control once it exists: the same signed-in check as LA-ENTRY-8 | `PLAYWRIGHT_LA_OFF_USER_*` |
| LA-BTN-3 Not on login / sign-up | black-box | `@fail`: the positive control fails. The same logged-out visitor sees no Ask button on a library page, so absence on /login and /register would prove nothing (logged-out visitors get no assistant yet) | |
| LA-BTN-4 Look | black-box | `@fail`: button is 50px tall, not 56px | |
| LA-BTN-5 Hover / press | black-box | `@fail`: hover background is rgb(24,52,93), not #653259 | |
| LA-BTN-7 Keyboard focus | black-box | **pass**. Keyboard focus adds an outline the resting button doesn't have (focused vs unfocused styles compared), and Enter opens | |
| LA-BTN-8 Position (EN right, HE left) | black-box | **pass** (24px / 24px, both rows) | |
| LA-COOKIE-4 Wide windows | black-box | **pass** (banner is a bottom corner card; button stays 24px from the bottom) | |
| LA-ENTRY-2 Header pill (1280, 900) | black-box | `@fail`: no header pill in either row. The 900px row now loads at 900px from the start | |
| LA-ENTRY-3 Pill by keyboard | black-box | `@fail`: no header pill | |
| LA-ENTRY-4 Pill only in Library | black-box | `@fail`: the positive control fails. The same visitor sees no pill on a library page, so absence on Voices would prove nothing. Once the control passes, Voices is watched continuously for at least as long as the pill took to appear on the library page | |
| LA-ENTRY-5 Pill look | black-box | `@fail`: no header pill | |
| LA-ENTRY-8 Assistant off (desktop + phone) | needs-seam | `@fail`: SeamMissing. Control once the account exists: the page shows a signed-in visitor (the header's profile picture, or a Log out link in the phone menu) | `PLAYWRIGHT_LA_OFF_USER_*` |
| LA-NULL-1 Assistant-on copy (4 rows, desktop + phone) | black-box | `@fail`: the empty-results block still shows the Browse button | |
| LA-NULL-2 Assistant-off copy (4 rows) | needs-seam | `@fail`: SeamMissing | `PLAYWRIGHT_LA_OFF_USER_*` |
| LA-NULL-3 No flash of the wrong version | needs-seam | `@fail`: for the assistant-on visitor, today's assistant-off copy and Browse button render. The reverse check (an assistant-off visitor never sees the assistant copy) is written and then fails with SeamMissing | `PLAYWRIGHT_LA_OFF_USER_*` |
| LA-NULL-5 Ask becomes the search action (desktop + phone) | needs-seam | `@fail`: CopyKeyMissing `assistant.floating_button.search_label` on desktop; no assistant on the phone | chatbot catalog |
| LA-NULL-6 Clicking asks about the search | needs-seam | `@fail`: CopyKeyMissing `search_label` (Given) | chatbot catalog |
| LA-NULL-7 Signed in: new chat | black-box | `@fail`: clicking the button on an empty search sends no question. The history clause requires the title that only the fake server sends, and requires that the history list was fetched | |
| LA-NULL-13 Once per search | needs-seam | `@fail`: clicking the button sends no question (Given) | chatbot catalog (label steps) |
| LA-NULL-14 Results bring back Ask | needs-seam | `@fail`: CopyKeyMissing `search_label` (Given) | chatbot catalog |
| LA-NULL-15 Hebrew | needs-seam | `@fail`: CopyKeyMissing `search_label` (he). Clause 2 is written against the wrapper key `assistant.floating_button.search_question` (he) | chatbot catalog; wrapper key |
| LA-OPEN-1 row 1 (logged out, 1280) | black-box | `@fail`: logged-out visitors get no assistant | |
| LA-OPEN-1 row 2 (logged in, 1280) | black-box | **pass** | |
| LA-OPEN-1 row 3 (logged out, 768) | black-box | `@fail`: no assistant. The page now loads at 768px from the start | |
| LA-OPEN-2 Closed stays closed | black-box | **pass**. On another page, and with a fake clock +25h in a new tab, the panel stays hidden for a 2s window after the Ask button appears (sampled continuously). Cookies that would have expired within the 25h are dropped before the return | |
| LA-OPEN-3 Open stays open | black-box | **pass**. Isolated from first-visit default-open: the visitor closes the assistant, a new page stays closed, the visitor reopens it with Ask, then the next page is still open | |
| LA-CHAT-1 Chat that has to load (desktop + phone) | needs-seam | `@fail`: chat A stays on screen while B is loading. Phone: no assistant | loader test id; key `assistant.messages.loadingHistory` |
| LA-CHAT-2 Chat opened earlier | black-box | **pass**. B shows from the browser while the server holds it. "No loader" is sampled every frame from the switch until B shows, but is **vacuous until the loader test id exists** | loader test id (for the "no loader" half) |

No general-scope scenario is `@manual` or blocked.

## Notes on the binding (support/)

- **Ask button** = the button in `<lc-chatbot>` whose accessible name starts with "Open Library Assistant" (Hebrew: "פתיחת עוזר הספרייה"). That is today's trigger pill. **Header pill** = a button or link named by `header.library_assistant` inside the site banner (the banner that holds the search combobox).
- **Fake chat server** (`support/chatStub.ts`) now also fakes the history list and saved-chat endpoints (`/api/history/conversations[/<id>]`, shapes observed on production). It can hold answers (`holdAnswers` / `releaseAnswers`) and individual chats (`holdChat` / `releaseChat`). No real chat data is read or written.
- **Motion** is read with the Web Animations API (`getAnimations()` on the page and the shadow root), sampled every frame while a recorder runs. CSS animations, CSS transitions and WAAPI are all visible this way.
- **Window size, reduced motion and cookie-banner state are set before the first real page loads.** The visitor enters through `/robots.txt` on the same host, so the suite's entry helpers still do their cookie and overlay setup. Only then does the visitor navigate to the page under test.
- **Absence checks** ("no Ask button", "no pill") never sleep blindly. Each has a control:
  - LA-BTN-3 and LA-ENTRY-4: the same visitor's library page shows the thing. The other page is then watched for at least as long as it took to appear.
  - LA-BTN-2 and LA-ENTRY-8: the page shows the visitor signed in, and the page reaches load and network quiet.

  In every case the absence is sampled continuously over a window, rather than read once.
- **Expected copy lives in the locked layer**: key names and the English question wrapper are in `steps/_expected.ts`. `support/copy.ts` only looks keys up.
- **Focus rings** are compared against the element's resting styles, so a resting drop shadow doesn't count.
- **Searches** go through the header search box, or the hamburger menu's search box on phones, so the page isn't reloaded and the relabel motion can be watched. A reloading search makes the motion steps fail with that reason (LA-NULL-5, and the relabel half of LA-A11Y-1).
- **Phones:** today the assistant doesn't mount below about 843px, so every `@phone` general scenario is red because the assistant is missing.

## Seam missing vs assertion written

Every needs-seam step has its assertion written. The seam is reached through `support/`, and the step goes green once the seam lands, with no steps amendment.

| Seam (where it throws) | Steps whose assertions are written behind it |
|---|---|
| Assistant-off account (`fixtures.ts`, SeamMissing) | LA-BTN-2, LA-ENTRY-8, LA-NULL-2, and the second half of LA-NULL-3 |
| "Needs login" response (`chatStub.refuseAsNeedingLogin`, SeamMissing) | LA-A11Y-1 "login prompt appears without moving" (no vertical movement inside the assistant while the prompt appears); LA-RTL-1 login-prompt texts and button in Hebrew |
| Chatbot catalog keys (`copy.ts`, CopyKeyMissing) | Ask/search labels, announcements, accessible name, loader announcement, login-prompt copy |
| Question-wrapper key `assistant.floating_button.search_question` (named in `steps/_expected.ts`; CopyKeyMissing in Hebrew; English falls back to the spec text) | LA-NULL-15 clause 2 |
| Test ids `la-answer-ready-dot`, `la-messages-loader` (`assistant.ts`) | LA-NOTE-*, LA-RTL-1 dot, LA-CHAT-1 loader, LA-CHAT-2 no-loader |

## Known limits

These were reviewed and left as they are; listed so Product can see them.
- **Tolerances:**
  - Positions and sizes: ±1px.
  - The dot's corner position: ±14px from the corner point.
  - "Centered" loader: ±2px.
  - Durations: ±20ms (bounce 600, ping, width growth 200), ±10ms (loader 800).
  - Font sizes: ±0.5px.
  - "Near the bottom corner" (LA-BTN-1, LA-RTL-1): within 40px of the edges.
  - "Just before the search box": a gap of 0 to 64px, on the same row ±10px.
  - "At once" (LA-CHAT-1/2): 500ms.
  - "Almost at once" (LA-NULL-6): 2s from click to question.
- **LA-NULL-1 / LA-NULL-2 "buttons":** a link or button inside a sentence (`<p>`) is not counted as a page button. That excludes "Report a bug" and "contact us".
- **LA-NULL-14:** "leaves the search page" is a full page load of `/texts`, not an in-app navigation.
- **Absence windows** are at least 3s (longer if the positive control took longer to mount). Network quiet is waited for up to 10s and not required, because some pages never go quiet.

## Testability requirements

1. **Assistant-off account**: `PLAYWRIGHT_LA_OFF_USER_EMAIL` / `_PASSWORD` (LA-BTN-2, LA-ENTRY-8, LA-NULL-2).
2. **Chatbot copy reachable by `copy()`**, in English and Hebrew: `assistant.floating_button.label`, `assistant.floating_button.search_label`, `assistant.header.response_ready_announcement`, `assistant.header.open_ready_response`, `assistant.messages.loadingHistory`, `assistant.anon.limit_reached`, `assistant.anon.login_button`. Either add them to Sefaria's interface catalog or export the chatbot's svelte-i18n catalog somewhere `support/copy.ts` can read.
3. **Translation key for the no-results question wrapper**, English and Hebrew, expected as `assistant.floating_button.search_question` with `{query}`. It is named in `steps/_expected.ts`, so a different final key name is a steps amendment. Used by LA-NULL-6 and LA-NULL-15.
4. **Test ids** (or rebind `support/assistant.ts`): `data-testid="la-answer-ready-dot"` on the answer-ready dot, and `data-testid="la-messages-loader"` on the chat loader.
5. **Free-answer limit seam**: the chat server's "needs login" response shape, so `ChatStub.refuseAsNeedingLogin()` can send it (or a test knob for the limit). Needed by LA-A11Y-1 and LA-RTL-1, and by the anon scope. The steps reach the prompt by dropping this tab's session cookie only, which leaves the account's server session alone.
6. **Animate with CSS animations, transitions or WAAPI**, not per-frame JavaScript style writes, so durations and keyframes can be read. The bounce is expected as a transform animation that runs twice (0.6s each). The ping is expected as an opacity-to-0 animation on the dot.
7. Keep the Ask button's accessible name starting with "Open Library Assistant", or update the `askButton` locator.

## Questions for Product

1. **LA-OPEN-1 has mixed results**: one row passes today and two don't. A status tag can only sit on an Examples block, so the one table was split into three blocks. The rows and their wording are unchanged, but this is more than a tags-only diff, so it needs approval as a test amendment (`test-amendment` label).
2. **LA-NOTE-2**: is the 2px white ring inside or outside the 12px circle? The test accepts a 12px fill with the ring drawn as a border, box-shadow or outline. Is "start side" top-left in English and top-right in Hebrew, as LA-RTL-1 implies?
3. **LA-NOTE-1/2, "bounces twice"**: is that two runs of one 0.6s bounce, as the test assumes, or a single 1.2s animation?
4. **LA-BTN-3**: signed-in visitors are redirected away from /login and /register, so the test uses a logged-out visitor. Today that passes trivially, because logged-out visitors get no assistant anywhere. Is that the intent?
5. **LA-NULL-1**: the test treats the inline caption links ("Report a bug", "contact us") as text links, not buttons. Is that right?
6. **LA-A11Y-1** is `@desktop`, but the cookie-banner move happens only on narrow windows. The test narrows the window to 393px for that step. Is that OK?
7. **LA-BTN-1 / LA-BTN-4, "four-point star"**: automation can check that an 18px icon is there, not its shape.
8. **LA-CHAT-1, "centered in the chat area"**: the test reads this as the messages region, with ±2px. Is that right?
9. **LA-NULL-6**: the question wrapper ends in "…". Is the ellipsis literal text the assistant receives, or is the spec's quote truncated? The test sends and expects it literally.
