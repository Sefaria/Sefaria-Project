# Story tests

These tests are Product's behaviour stories, run as written. Product writes Gherkin
stories, an agent that never sees the implementation writes the steps, and the
tests are merged **red** before the feature is built. Engineering then builds until
they go green. Background and rationale: wiki page `concepts/Story-Driven Black-Box Testing`.

First trial: Library Assistant Q4 (Shortcut sc-47782), on the long-lived branch `feature/la-q4`.

## Three layers, three owners

| Layer | Path | Says | Who may change it |
|---|---|---|---|
| Contract | `features/**/*.feature` | What the product does (Product's text, verbatim) | Product, or an approved test amendment |
| Assertions | `steps/**/*.ts` | Exactly what each sentence checks | The story test writer. Locked during implementation |
| Binding | `support/**`, `../pages/**` | How to find and fake things: locators, fixtures, the chat stub, test ids | Implementers, freely |

**Implementing a feature?** You may freely change the binding layer: page-object
locators, a fixture, a new test id in the app. Changing a `.feature` or `steps/`
file needs a PR labelled `test-amendment`, with a reason (story ambiguous, story
wrong, cannot be tested, step bug), approved by a CODEOWNER. The one change you
make yourself is removing a `@fail` tag when its scenario goes green: tag-only
diffs to `.feature` files pass the check without the label.

## Status tags

Added to scenarios; never change the story text.

- `@fail`: red today for the reason in `STATUS.md`. playwright-bdd marks it
  `test.fail()`, so the run stays green while the feature is missing, and it
  flags the scenario as soon as it starts passing. Remove the tag at that point.
- `@manual`: cannot be checked reliably by automation (gestures, a real screen
  reader). Listed in `STATUS.md` with an owner; never silently skipped.
- `@decision-needed`, `@spec-gap`: Product's tags. Never run until decided.
- `@scope-general` / `@scope-mobile` / `@scope-anon`: whose area the story is
  (Yitzhak / Steve / Yishai). The run is filtered by `STORY_SCOPE`.

## STATUS.md

One row per scenario. Columns:

- **Class:** black-box, needs-seam, manual or blocked.
- **Result on master:** pass, or the expected first failure, in words.
- **Seams needed.**

A red test must fail for the reason recorded here. "Element not found" is only
acceptable when the missing element is the one the story describes.

## Running

```bash
npx bddgen                                           # compile .feature -> specs (also runs on test)
npx playwright test --project=chrome-assistant-stories        # desktop 1280×800
npx playwright test --project=chrome-assistant-stories-phone  # phone 393×852, touch
STORY_SCOPE='@scope-general or @scope-mobile' npx playwright test --project=chrome-assistant-stories
SANDBOX_URL=https://www.sefaria.org SANDBOX_URL_IL=https://www.sefaria.org.il npx playwright test --project=chrome-assistant-stories
npx playwright test --project=chrome-assistant-stories -g 'LA-NOTE-1'
```

A scenario tagged `@desktop @phone` runs in both projects. A scenario with
neither tag runs on desktop.

## Seams

- **Fake chat server** (`support/chatStub.ts`). Answers arrive after a delay
  the test chooses (`chat.answerDelayMs`), with no Claude call, and every
  question sent is recorded (`chat.questions`). It is built from the protocol
  observed on production, not from the chatbot's source. Stories about the
  server itself (`@api`) talk to the real chat server.
- **Copy by key.** Stories name translation keys. The keys the steps expect, and
  the one string that has no key yet (the English no-results question wrapper,
  from the spec), live in the locked layer, `steps/_expected.ts`. `support/copy.ts`
  only looks a key up in `static/js/sefaria/i18n/interface/{en,he}.json`. Keys
  under `assistant.*` live in the chatbot's own catalog, which this repo can't
  read yet. A missing key throws `CopyKeyMissing`, an honest red.
- **Assistant-off account** (`PLAYWRIGHT_LA_OFF_USER_*`). A real account with
  the assistant turned off, so no test flips a setting. Without it those
  scenarios fail with `SeamMissing`.
- **Free-answer limit** (`ChatStub.refuseAsNeedingLogin()`). It throws
  `SeamMissing` until the chat server's "needs login" response is documented.
- **Fake clock, test ids.** These are testability requirements on the
  implementation tickets. See `STATUS.md`.

## Rules for step definitions

- Black-box: find things the way a person does, by role, accessible name or key-resolved copy.
- Everything you'd change after a redesign (locators, waits, setup) goes in
  `support/` or a page object. A step says *what* is true, not *how* to reach it.
- Visual values (colours, sizes, timings) are design decisions. Check them with
  computed styles and bounding boxes, not screenshots.
- Never read implementation branches or PRs for the feature under test.
- Follow `e2e-tests/CLAUDE.md`, in particular `t()` for timeouts and no state waits with `waitForTimeout`.
