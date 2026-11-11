# Contributing to the new reader

Start with [`README.md`](README.md) (run, test, add a page) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (the rules).

## Before you change something

- Check the Feature Atlas (`docs/features/`) for the feature you are touching, and [`docs/DECISIONS.md`](docs/DECISIONS.md)
  for a decision that already settles it. A product question that neither answers goes to the product team before the
  code does.
- Match www.sefaria.org: same URLs, same words, same behaviour. Do not port a bug of the old client; record each
  deliberate difference in the feature's note in `docs/features/rebuild-status.json`.
- Search Storybook before adding a component; prefer a variant of an existing one.

## While you change it

- Reproduce a bug with a failing test first, then fix it.
- Tag tests and stories with the atlas IDs they cover: `// @feature TXD-012`.
- Every URL change goes through the router, every write through `src/lib/auth/http.ts`, every colour through a token.
- No new npm dependency without a reason the pull request states.
- Comments say what the code does and why. Do not cite tickets, review rounds or planning documents that are not in the
  repository.
- The repository is public: no personal data in fixtures, recordings, tests or comments (use placeholders such as
  `Reader One` or `user1@example.com`), no local paths, no internal links.

## Before you open a pull request

```bash
npm run typecheck
npm test
npm run test:stories && npm run test:stories:hebrew && npm run test:stories:dark
npm run features:coverage -- --unknown
E2E_API_MODE=replay CI=1 npm run test:e2e
```

If you changed what a page loads, also run `npm run build`, `node scripts/budgets/measure.mjs` and `npm run test:e2e:prod`.
If you changed which paths Django owns, run `node --experimental-strip-types ../build/ci/reader-nginx-paths.mjs --check`.

Use conventional commit messages (`fix(reader-next): …`, `feat(reader-next): …`). CI runs the same checks on every pull
request that touches `reader-next/`.
