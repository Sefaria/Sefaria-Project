# Baseline capture record

| Item                  | Value                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Capture date          | 2026-11-18, 12:09–12:39 UTC (full run); full-page states re-captured 12:46 UTC; `docs_disambiguator_lightbox` at 1280 re-captured 2026-11-19 (same deploy) after the capture began waiting for the opened image to load                 |
| ReadMe deploy version | `5.968.3` (live's `<meta name="readme-deploy">`, read on every job; same as at research time)  |
| Site                  | https://developers.sefaria.org                                                                 |
| States                | 60 state ids covering the 56 rows of PLAN.md Appendix B                                        |
| State × width pairs   | 279 (21 pairs excluded with their reason in `states.ts`, I-2)                                  |
| Files                 | 279 `raw/*.jpg`, 279 `roboto/*.png`, 279 `roboto/*.metrics.json`                               |
| Size                  | about 104 MB: raw JPEG 41 MB, Roboto PNG 48 MB, metrics 15 MB                                  |
| Jobs                  | 558/558 clean (`capture-report.json`)                                                          |
| Environment           | `ENV.json` (Chromium 157.0.8103.78 headless shell r1243, Ubuntu 24.04.5 LTS, 119 system fonts) |
| Captured by           | W15, `node e2e-tests/developers-visual/capture/capture-live.ts`                                |

## What reached live

Only GET requests. Per `capture-report.json`, across the 558 jobs the guard aborted 638 ReadMe
pageview/request beacons (`POST …/metrics-proxy/create/*`), 382 request-history lists
(`GET …/metrics-proxy/requests/list`) and 558 Cloudflare challenge beacons (`POST /cdn-cgi/…`), and
fulfilled every Try It call from `fixtures/tryit-responses.ts` (60 × Genesis 1:1, 20 × Notabook 99,
10 × find-refs). No request reached the Sefaria API. The search states issue the read-only
`GET /sefaria/api-next/v2/search` that the search box itself sends.

## Findings at capture time

- Live opens the first response accordion (200) on load; REFERENCE_SPEC.md §1.4 says "collapsed by
  default". The research measurements (`computed-get-v3-texts.json`, respPicker 7348px tall) agree
  with what live does now, so this is a wording error in the spec, not a change on live.
- Live scrolls an inner container (`.ContentWithOwlbot-content`), not the window.
- The 404 page's three suggestions are picked at random per load; masked (`notFoundSuggestions`).

## Re-running

```bash
node e2e-tests/developers-visual/capture/capture-live.ts                       # everything (about 30 min, 2 contexts)
node e2e-tests/developers-visual/capture/capture-live.ts --only <ids> --widths <list>
```

Baselines are never re-captured silently: a re-capture is the Integrator's decision, recorded in the
PR description, and this file is updated in the same commit with the new date and deploy version.

## Raw JPEGs held out of the repository (pending H-9)

The capture produced 279 `raw/*.jpg` files (about 41 MB) as a record of live as it was. Nothing compares
against them, and the whole set was larger than the ~60 MB that H-9 approved by default, so they are not
committed yet. The comparison targets (`roboto/*.png` and `*.metrics.json`, about 63 MB) are committed.
The raw set is kept outside Git by the Integrator until the product owner decides (commit, or upload to
cloud storage with a hash manifest).
