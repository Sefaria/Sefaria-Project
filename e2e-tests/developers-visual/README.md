# Visual parity harness for developers.sefaria.org

PLAN.md §6.1 (pixel parity) and Appendix B (the states). Owned by W15.

The portal that replaces ReadMe must look like live developers.sefaria.org, with the deviations
registered in `deviations.ts`. This directory holds the baselines captured from live, the states
and recipes that produce them, and the gates that compare the portal against them.

```
adapter.ts              the recipe interface (openCopyPageMenu(), runTryIt(), …)
adapters/live.ts        drives ReadMe's DOM on live (used by the capture)
adapters/local.ts       drives the portal through e2e-tests/pages/developers/ (stubs until W14's page objects land)
states.ts               every state of Appendix B: id, path, widths (+ reasons for exclusions), regions, masks, recipe
regions.ts              comparison regions, framing anchors and dynamic masks, with selectors per side
mapped-elements.ts      the elements of gates 1 and 2 (keys of research computed-get-v3-texts.json)
deviations.ts           D-1 … D-12, the only place a known difference may be declared
gates.ts                the three gates as pure functions; tests/gates.test.ts
png.ts                  dependency-free PNG decode / lossless optimizing encode
parity.spec.ts          state × width: local adapter + the three gates (run by playwright.devportal-visual.config.ts)
fixtures/tryit-responses.ts   recorded Try It responses (both sides; no call reaches the Sefaria API)
fonts/                  Roboto + Heebo woff2 (OFL, see OFL-*.txt) injected into live for the Roboto baselines
capture/capture-live.ts the capture script; capture/browser.ts the launch + network guard; capture/env.ts the fingerprint
capture/verify-mapped.ts      checks mapped-element selectors against the research measurements
baselines/raw/          live as it is, JPEG q90 — a record, never compared
baselines/roboto/       live with Roboto/Heebo injected, optimized PNG + <state>-visual-<w>.metrics.json — the comparison target
baselines/ENV.json      the rendering environment the baselines were made in
baselines/CAPTURE.md    capture date, ReadMe deploy version, how the run went
baselines/capture-report.json   per-job record, including every request the guard aborted or fulfilled
```

The package has no dependencies of its own: it uses the repository's `node_modules` (Playwright)
and Node 22's built-in TypeScript type stripping (so imports carry `.ts` and only erasable syntax is
used: no enums, no parameter properties).

## Unit tests (the gates)

```bash
npm --prefix e2e-tests/developers-visual run test:unit
```

`node:test` over `tests/*.test.ts`: gate 1 (styles, font family exempt), gate 2 (0.5px), gate 3
(1.0% per region, 0.5% per viewport, threshold 0.2, masks on both sides, per-region overrides,
missing regions, size mismatches) and the PNG round trip.

## Capturing the baselines

```bash
node e2e-tests/developers-visual/capture/capture-live.ts                 # every state × width, raw + roboto
node e2e-tests/developers-visual/capture/capture-live.ts --only v3_default,home --widths 1440,390
node e2e-tests/developers-visual/capture/capture-live.ts --out /some/scratch/dir   # try without touching baselines/
```

Options: `--only <state ids>`, `--widths <list>`, `--variants raw,roboto`, `--concurrency <1|2>`
(at most 2 browser contexts at once), `--out <dir>`. A partial run merges into
`capture-report.json`.

What a capture does, per state and width, on a fresh browser context (so cookies such as
`readme_language` and the persisted sidebar-collapse state never leak between states):

1. Installs the network guard before the first navigation (`capture/browser.ts`): every request to
   `**/metrics-proxy/**` is aborted, every non-GET request to developers.sefaria.org is aborted
   (this also stops Cloudflare's challenge beacon), any request to the Sefaria API is aborted, and
   `https://try.readme.io/**` (ReadMe's Try It proxy) is fulfilled from `fixtures/tryit-responses.ts`.
   Nothing is POSTed to live and no request reaches the Sefaria API. Each job's aborted and
   fulfilled requests are listed in `capture-report.json`.
2. For the Roboto variant: serves the font files by route interception (`devportal-ui/public/fonts/`
   when it exists, else `fonts/`), overrides ReadMe's `--font-family` variable and the homepage's
   hard-coded `Inter` families with `Roboto, Heebo, "Helvetica Neue", Arial, sans-serif`, and waits
   for `document.fonts.ready`. Monospace is not touched.
3. Navigates, settles (network idle, code viewers rendered, no spinner, fonts and images loaded,
   finite animations finished), runs the recipe, and parks the pointer.
4. Raw: JPEG q90. Roboto: PNG with the dynamic masks painted (`#FF00FF`), re-encoded losslessly
   (verified pixel-identical) when smaller, plus the metrics file: mapped elements (box + computed
   style), region boxes, mask boxes and the live boxes of the registered deviations, all in
   screenshot coordinates (viewport, or document for `fullPage` states).

Live scrolls an inner container (`.ContentWithOwlbot-content`), not the window. The live adapter
scrolls that container, and for full-page states `prepareFullPage()` lets the document grow so the
full-page screenshot contains the whole page.

Chromium: Playwright's pinned revision is used when installed; otherwise the newest
`chromium_headless_shell-*` under `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`), or
`DEVPORTAL_VISUAL_CHROMIUM=<path>`. The one used is recorded in `ENV.json`.

## How V-pixel runs the loop

`playwright.devportal-visual.config.ts` (W16) runs `parity.spec.ts` in five projects, `visual-1440`
… `visual-390`. For each state × width the spec:

1. refuses to run if the environment differs from `baselines/ENV.json` (Chromium version, OS image,
   installed-font hash, injected-font hashes);
2. runs the state's recipe through the local adapter against the portal (`baseURL`);
3. measures the mapped elements, regions, masks and deviation areas on the portal;
4. applies the gates (`gates.ts`): **(1)** computed styles equal to the metrics file (font family
   exempt), **(2)** every box within 0.5px, **(3)** at most 1.0% differing pixels per region and
   0.5% per viewport at threshold 0.2. Masks and deviation areas of either side are painted on both
   images; elements under a deviation are skipped by gates 1 and 2;
5. attaches the portal screenshot, a diff image and the gate results (`*-gates.json`), which become
   the evidence of a `PX` entry in the owning builder's inbox (PLAN §4.4).

Builders fix and V-pixel re-runs until green, under the retry and escalation rules of PLAN §4.5.

Local-side contract (requested of the Integrator): portal elements carry
`data-visual-region="<region id>"`, `data-visual-mask="<mask id>"`, `data-visual="<mapped key>"` and
`data-visual-deviation="D-n"`; the local adapter's TODOs name the page-object method each recipe
step will call.

## Rules

- **Baselines are never silently re-captured.** A verifier that finds live has changed since the
  capture stops and tells the Integrator (PLAN §4.5 rule 6). Re-capturing is the Integrator's
  decision, recorded in the PR description with the new capture date and ReadMe deploy version, and
  `baselines/CAPTURE.md` is updated in the same commit. After ReadMe is cancelled the committed files
  are the only record.
- Nobody makes a state pass by loosening a threshold, masking a region, skipping a state or adding a
  deviation on their own (PLAN §4.5 rule 7). `deviations.ts` takes entries only when they trace to
  the brief or PLAN §1.3.
- Live is read-only: GET only, the guard installed before navigation, "Vote" never clicked, no form
  submitted.
