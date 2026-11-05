# Sefaria Reader (next)

A from-scratch web client for the Sefaria library: React 19 + TanStack Start, a persistent local library cache,
and a Storybook-catalogued component library. Scope is the **Feature Atlas** in `docs/features/`.

```bash
npm install
npm run dev              # app on http://localhost:3100 (reads the live Sefaria API)
npm run storybook        # component library on http://localhost:6006
npm test                 # unit + component tests (jsdom; recorded fixtures, no network)
npm run test:stories     # every story as a browser test, with accessibility checks
npm run test:e2e         # end-to-end in Chromium against the live API
npm run features:coverage        # which atlas features have tagged tests/stories
npm run fixtures:record  # re-record API fixtures in fixtures/api
```

| Doc | What |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Tenets, layers, the library cache, testing levels |
| [docs/PROGRESS.md](docs/PROGRESS.md) | What is built, what is next, known gaps |
| [docs/COMPONENT_AUDIT.md](docs/COMPONENT_AUDIT.md) | Old-client audit, design tokens, the proposed component library |
| [docs/BOOK_TYPES.md](docs/BOOK_TYPES.md) | How every book type differs, grounded in recorded API data |
| [docs/VENDOR.md](docs/VENDOR.md) | The vendored toolkit code and our changes to it |
| [docs/features/](docs/features/) | The Feature Atlas (941 features) and the old-client write-ups |

Conventions: tests and stories carry `// @feature ID` tags (IDs from the atlas); `npm run features:coverage -- --unknown`
fails on a tag that does not exist. Before adding a component, search Storybook for it.
