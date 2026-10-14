# Traceability: Library Assistant Q4, `@scope-general`

Fresh-context review by the `story-fidelity-reviewer` agent, 2026-10-14, round 3 (final before Product sign-off).
Earlier rounds: round 1 gave 15 covers, 18 partial, 1 misses; round 2 gave 23, 11, 0. Their gaps were fixed in the steps.

Verdicts:
- **covers:** the test passes only if the story is true;
- **partial:** the gaps are named;
- **misses:** the test would pass while the story is false.

For Product sign-off: review this table with the `.feature` files and with `STATUS.md`, which has the expected first failures, the testability requirements, the known limits and the questions for Product.

**Round 3: 27 covers, 7 partial, 0 misses.**

| ID | Verdict | What is checked | Gaps |
|---|---|---|---|
| LA-A11Y-1 | partial | No bounce on the button when the answer is ready; no width animation on relabel; no vertical movement while the login prompt appears; the button slides on cookie accept (393px) | If the search reloads the page, the width check passes silently. Motion driven by JavaScript frames isn't seen |
| LA-RTL-1 | partial | Hebrew Ask label; bottom-left within 40px; star right of the label; dot top-right ±14px; Hebrew login-prompt copy; the Hebrew ready announcement is heard | Only one announcement checked; English announcements not ruled out |
| LA-NOTE-1 | partial | Red dot (#C03522) on the button; exactly 2 bounces, then still; announcement text by key; accessible name by key | Announcement read ~1–2s later; a short-lived one would fail falsely |
| LA-NOTE-2 | covers | 12px circle ±1, #C03522, 2px white ring, start-side top corner ±14; 600ms bounce, −6px rise, 2px hop; one fading ping per bounce | |
| LA-NOTE-3 | covers | Dot shown; opening shows the answer and removes the dot; after closing, no dot | |
| LA-NOTE-4 | covers | Search label shown; answer arrives while closed; dot appears; the label never changes, frame by frame | |
| LA-NOTE-5 | covers | Reduced motion: dot appears, no animation on the button or dot | Stricter than the story: a plain fade-in of the dot would fail |
| LA-BTN-1 | covers | 4 rows, desktop and phone: label by key, a star, within 40px of the bottom and a side | Star shape not checkable |
| LA-BTN-2 | covers | Signed-in control, then no Ask button over 3s (once the assistant-off account exists) | |
| LA-BTN-3 | covers | Control: Ask shown on /texts; /login and /register watched at least as long as it took to mount | |
| LA-BTN-4 | partial | 56px ±1, fully rounded, #7C416F, white 16px/500 label, 18px star beside it | Star shape not checkable |
| LA-BTN-5 | covers | Hover and held press both #653259 | |
| LA-BTN-7 | covers | Tab reaches the button; a focus ring that isn't there at rest; Enter opens | |
| LA-BTN-8 | covers | 24px ±1 from the bottom and the right (EN) or left (HE) | |
| LA-COOKIE-4 | covers | Banner is a corner card under half the width; button 24px ±1 from the bottom | |
| LA-ENTRY-2 | covers | Pill by key, on the same row as search ±10px, 0–64px before it; click opens; 1280 and 900 | |
| LA-ENTRY-3 | covers | Tab focus; a ring that isn't there at rest; Enter and Space each open | |
| LA-ENTRY-4 | covers | Library-page control, then no pill on Voices, sampled for at least the mount time | |
| LA-ENTRY-5 | covers | 30px ±1, rounded, #7C416F, white 14px label, 16px star; hover and press #653259 | |
| LA-ENTRY-8 | covers | Signed-in control; no Ask button (3s); no header pill; no visible menu item or control named by key | |
| LA-NULL-1 | covers | No button in the empty-results block; body text by key; the phrase sits on one line | Links inside a sentence don't count as buttons (Product question) |
| LA-NULL-2 | covers | Exactly one button with the right href; body text by key | |
| LA-NULL-3 | covers | Every DOM change watched from first paint: the wrong copy never appears, for assistant-on and assistant-off visitors | |
| LA-NULL-5 | covers | Search label by key, star kept, button grew, width animation 200 ±20ms | |
| LA-NULL-6 | covers | Opens; sends the wrapper once with the query filled in; within 2s; thinking shown | Literal "…": Product question |
| LA-NULL-7 | covers | New session id; the earlier chat is listed under its server-side title; history re-fetched | |
| LA-NULL-13 | covers | Reopen sends nothing; the label never flickers on a tab switch; re-click sends nothing; a new search is asked exactly once | |
| LA-NULL-14 | partial | "Ask" on a tab with results, and after leaving the search page | "Leaving" is a full page load, not in-app navigation |
| LA-NULL-15 | covers | Hebrew search label; the Hebrew wrapper is sent once | The wrapper key name is provisional |
| LA-OPEN-1 | covers | Panel visible on first load, 3 rows, window sized before load | |
| LA-OPEN-2 | covers | Closed on /topics and after +25h in a new tab (expired cookies dropped); the panel never shows during 2s | |
| LA-OPEN-3 | covers | The visitor's own "open" survives navigation, isolated from first-visit default-open | |
| LA-CHAT-1 | partial | A hidden within 500ms; 24px loader, #6F6F6F, 0.8s infinite rotation, centred ±2px; announcement; B scrolled to its end | Phone: A may already be hidden behind history, so it passes silently; loader shape not checked |
| LA-CHAT-2 | partial | B visible within 500ms; frame-by-frame watch for a loader until B shows | "No loader" passes silently until the loader test id exists |

## Open review points (not yet fixed)

1. **LA-A11Y-1 relabel clause can pass vacuously** if the search reloads the page or the relabel comes more than 6s after it.
2. **Motion is only read on the Ask button and its children.** A bounce or slide put on a wrapper element would give false reds (LA-NOTE-1/2, the LA-A11Y-1 slide) or vacuous passes (the LA-A11Y-1 bounce, LA-NOTE-5). Implementers: animate the button itself, or rebind in `support/assistant.ts`.
3. **LA-CHAT-1 on phones:** "A disappears at once" can pass if history already covers A.
4. **LA-NOTE-1 reads the announcement from the page**, not from the running recorder.
5. **Flakiness risk:** overlays that mount late can stay up after the new window-sized entry.
6. **`settled()` expects a visible button or panel whenever `<lc-chatbot>` is present.** An empty element left in the assistant-off state would give false reds. This is binding layer, so implementers may fix it.
