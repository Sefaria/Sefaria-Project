# Sefaria Reader (next)

A new web client for the Sefaria library, built with React 19 and TanStack Start. It renders the reader (texts, the
sidebar, panels), the library and book pages, search, topics, sign-in and the static information pages on the server,
then hydrates in the browser and keeps what it has fetched in a local cache. Everything it reads comes from the Sefaria
API; every write goes to Django. Pages it does not have (sheets, profiles, account settings, admin tools…) stay
Django's.

Its scope is the **Feature Atlas** in [`docs/features/`](docs/features/): every feature of the old client, with an ID
(`TXD-012`) and a rebuild status.

## How it is deployed

The production image is built from this folder ([`Dockerfile`](Dockerfile)): one Node process (`server/index.mjs`) that
renders pages and serves the built assets. The Helm chart (`helm-chart/sefaria`) runs it beside Django in one of three
modes: `legacy` (nobody gets it; the default), `optin` (page requests carrying the cookie `reader_version=next`, which
Django sets) and `reader` (everyone). nginx sends the paths Django owns straight to Django.

Details, settings and the environment variables: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Run it

Node 22.12 or later.

```bash
npm ci
npm run dev          # http://localhost:3100, against the live API at www.sefaria.org
npm run storybook    # the component library, http://localhost:6006
```

`npm run dev` reads the live API by default. The settings are environment variables, read when the server starts (the
list and what each one does is at the top of [`src/lib/config.ts`](src/lib/config.ts)). The useful ones locally:

- `PUBLIC_API_ORIGIN` / `SEFARIA_API_ORIGIN`: the API as the browser and the server reach it (default
  `https://www.sefaria.org`). Point both at a local Django to work against your own data.
- `SEFARIA_PASS_THROUGH=1`: pass paths this client does not render on to Django, as in the cluster. Without it you get
  this client's own 404 page for them.
- `PORT`: the dev server's port (default 3100).

To run against recorded answers instead of the live API, start the e2e cassette (below) and point the client at it:

```bash
node scripts/cassette/bundle.mjs fetch                             # download the pinned recordings into e2e/.cassette
E2E_API_MODE=replay node scripts/api-cassette.mjs &                # the cassette on http://localhost:3998
PUBLIC_API_ORIGIN=http://localhost:3998 npm run dev
```

The static information pages (`/about`, `/team`, `/products`, `/jobs`, `/terms`…) are rendered from Django's content answer
(`/<page>?format=json&lang=en|he`, `reader/static_content.py`), which only this branch's Django serves: www.sefaria.org answers
it with the page's HTML, so against the live API these pages are handed to Django (this client's 404 page without
`SEFARIA_PASS_THROUGH=1`). To see them locally, either point both origins at a local Django of this branch (the static pages
need no library data), or serve the answers rendered from this branch's templates (`e2e/fixtures/static-pages`) from a cassette
that records everything else from the live API, in a directory of its own:

```bash
export E2E_CASSETTE_DIR=$PWD/.dev-cassette E2E_API_PORT=3998
node -e 'import("./e2e/static-pages-cassette.ts").then((m) => m.seedStaticPages())'   # Node 23.6+ (TypeScript types stripped)
E2E_API_MODE=auto node scripts/api-cassette.mjs &
PUBLIC_API_ORIGIN=http://localhost:3998 SEFARIA_API_ORIGIN=http://localhost:3998 npm run dev
```

`/team`, `/products` and `/jobs` then fill their CMS part from www.sefaria.org's CMS proxy (`/api/strapi/graphql-cache`).

## Test it

| Command                                                              | What it checks                                                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                  | TypeScript                                                                                                              |
| `npm test`                                                           | Unit and component tests (Vitest, jsdom, offline: `fixtures/`), and the architecture rules. Runs `fixtures:check` first |
| `npm run test:stories`                                               | Every Storybook story as a browser test, with accessibility checks (English)                                            |
| `npm run test:stories:hebrew` / `test:stories:dark`                  | The same stories in the Hebrew interface (right to left) and in the dark theme                                          |
| `npm run test:e2e`                                                   | End-to-end (Playwright, Chromium) against the dev server and the API cassette                                           |
| `npm run build && npm run test:e2e:prod`                             | The production build's server-rendered pages link every stylesheet their first paint needs                              |
| `npm run build && node scripts/budgets/measure.mjs`                  | The JS and CSS a reader page loads up front, against `scripts/budgets/baseline.json` (2% tolerance)                     |
| `npm run features:coverage -- --unknown`                             | Every `@feature` tag names a feature that exists in the atlas                                                           |
| `npm run fixtures:check`                                             | The unit-test fixtures hold no personal data and are minified                                                           |
| `node --test scripts/cassette/*.test.mjs scripts/budgets/*.test.mjs` | The cassette bundle and budget scripts                                                                                  |

CI runs all of these on a change under `reader-next/` (`.github/workflows/reader-next-client.yaml`). This folder has no
lint script of its own; the repository root's `npm run lint` checks the Markdown here with Prettier, and
`npm run lint:py` the atlas tools' Python.

### End-to-end tests and the API cassette

The e2e suite never depends on live data. The app under test (server and browser alike) reaches the API through a local
proxy, [`scripts/api-cassette.mjs`](scripts/api-cassette.mjs), which answers from recordings in `e2e/.cassette/` (not in
git). `E2E_API_MODE` picks how:

- `auto` (the default): answer from the recordings, record what is missing from the live API.
- `replay`: answer only from the recordings; a miss is a 504 and is logged. CI runs this way.
- `record`: always ask the live API and overwrite the recording.

`playwright.config.ts` starts the cassette and three dev servers itself (the main one on `E2E_PORT`, default 3100; one with
test sign-in keys for the auth specs; one with pass-through to Django, as in the cluster). To run the suite as CI does:

```bash
node scripts/cassette/bundle.mjs fetch
E2E_API_MODE=replay CI=1 npm run test:e2e
```

The recordings CI replays are pinned by [`e2e/cassette.lock`](e2e/cassette.lock): a bundle published as a release asset
of this repository. After recording new answers (`E2E_API_MODE=record` or `auto`), `node scripts/cassette/bundle.mjs pack`
scrubs personal data from the recordings (`scripts/cassette/scrub.mjs`), writes a new bundle and pins it in the lock; the
bundle must then be uploaded to that release before CI can use it. `node scripts/cassette/bundle.mjs verify` tells you
whether your local recordings match the lock.

### Unit-test fixtures

`fixtures/` holds recorded API answers for unit tests and stories (see [`fixtures/README.md`](fixtures/README.md)). The
repository is public, so they hold no personal data: `npm run fixtures:record` (and `fixtures:record-search`) re-record
them and then run `npm run fixtures:scrub`, which replaces people with placeholders, minifies the files and keeps only
those listed in `scripts/fixtures/keep.txt`. `npm test` fails while any fixture is unscrubbed.

## Architecture rules

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before a large change. In short:

- The URL is the reader state, in sefaria.org's own scheme, and every URL change goes through the router.
- Only `src/lib` sees API response shapes; `src/ui` components receive props and never read the router, settings or the API.
- Every write goes through `src/lib/auth/http.ts` (session cookie and CSRF) to Django.
- Every colour is a design token (`src/ui/tokens/`); an element that sets `lang` also sets `dir`.
- Reads are cached on disk with per-class policies (`src/lib/cache/`); a write invalidates what it changed.

`npm test` enforces the mechanical ones (`test/architecture/`). Decisions already taken, with their reasons, are in
[`docs/DECISIONS.md`](docs/DECISIONS.md).

## Adding a page (route)

1. Add the route file in `src/routes/` (TanStack Router file routes). The dev server and the build regenerate
   `src/routeTree.gen.ts`; commit it.
2. Tell the server the path is this client's: `CLIENT_EXACT` or `CLIENT_PREFIXES` in
   [`src/server/route-manifest.ts`](src/server/route-manifest.ts). Any other path is treated as a ref, and handed to
   Django when it is not one.
3. If the path was Django's, remove it from `DJANGO_PREFIXES` in
   [`src/lib/routing/django-paths.ts`](src/lib/routing/django-paths.ts) (add it to `LIBRARY_ONLY_PREFIXES` when the
   Voices host must keep Django's page), then regenerate nginx's copy:
   `node --experimental-strip-types ../build/ci/reader-nginx-paths.mjs` (CI runs it with `--check`). If the reader links
   to it from a page that used to leave the app, drop its entry from `scripts/exits-allowlist.json`.
4. Stylesheets of the first paint. Start's route manifest links only the CSS of a route's static imports. If the page is
   a new kind of page under the `$` route (a dynamically imported chunk, see `src/features/reader/page-kinds.tsx`), add
   its chunk to the hand-kept map `PAGE_KIND_ENTRIES` in
   [`vite-plugins/page-kind-css.ts`](vite-plugins/page-kind-css.ts), or its first paint is unstyled in production. Add
   the page's path to the `ROUTES` list in [`e2e/ssr-styles.spec.ts`](e2e/ssr-styles.spec.ts), which `test:e2e:prod`
   checks against the production build.
5. Tests: unit tests next to the code, a story for each new `src/ui` component, an e2e spec for the journey, each tagged
   with the atlas IDs it covers (`// @feature STA-005`). Update the feature's status in
   `docs/features/rebuild-status.json`.

## The Feature Atlas

[`docs/features/`](docs/features/) is the scope and the record:

- `features.json`: every feature of the old client, with its ID, area, and how the old client did it.
- `rebuild-status.json`: each feature's status here (`done`, `partial`, `todo`, `deferred`, `n/a`, `replaced`) and a note.
- `CHANGELOG.md`: what changed in the atlas, by date.
- `inv_*.md`: the write-ups of the old client the atlas was read from.
- `python3 docs/features/tools/build.py` builds a readable `FEATURES.md` and an HTML atlas from the JSON (not committed).

Tests and stories carry `@feature` tags; `npm run features:coverage` reports which features have a tagged test.

## More documentation

| Doc                                                            | What                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                   | Tenets, layers, the enforced rules, the library cache, tests |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                       | The chart's modes, settings, nginx routing, rollout          |
| [docs/DECISIONS.md](docs/DECISIONS.md)                         | Decisions taken and why                                      |
| [docs/INTEGRATION.md](docs/INTEGRATION.md)                     | How other apps on the page talk to the reader                |
| [docs/WORKSPACE.md](docs/WORKSPACE.md)                         | Panels, side panels and their URLs                           |
| [docs/BOOK_TYPES.md](docs/BOOK_TYPES.md)                       | How every book type differs, from recorded API data          |
| [docs/READER_STATE_API.md](docs/READER_STATE_API.md)           | Follow me and recording (labs, off in production)            |
| [docs/ROOM_RELAY_CLOUDFLARE.md](docs/ROOM_RELAY_CLOUDFLARE.md) | The relay for Follow me (`relay/`)                           |
| [docs/VENDOR.md](docs/VENDOR.md)                               | The vendored toolkit code and the changes made to it         |

How to contribute: [`CONTRIBUTING.md`](CONTRIBUTING.md).
