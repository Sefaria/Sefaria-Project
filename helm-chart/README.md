# Sefaria Helm Chart

Chart definitions for deploying the full Sefaria environment (web, node, tasks, redis, etc.),
including cauldrons (see `.github/workflows/helm.yaml`).

## Commit message format

Any push touching `helm-chart/**` (on a non-master/prod/preprod branch) triggers the `Helm`
GitHub Action, which uses `semantic-release` (scoped to this directory via
`semantic-release-monorepo`, see `release-rules.sh`) to cut a new chart version and publish it
(GitHub Pages + GAR OCI).

**Commit messages must use a [Conventional Commits](https://www.conventionalcommits.org/)
prefix** (`fix:`, `feat:`, `chore:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `static:`,
`helm:`, or `deploy:`) for semantic-release to recognize the change and bump the version.

A commit that touches `helm-chart/**` without one of these prefixes is invisible to
semantic-release: no new version is cut, and the `Get chartVersion` step in the `Helm` workflow
then hard-fails with "No chart version available" (there's no fallback to the last release if it
doesn't point at the current HEAD). The chart published for that branch stays stale at whatever
the last conventionally-tagged commit was — which is easy to miss, since app-code commits on the
same branch/PR can otherwise merge and deploy normally.

If you see that failure, reword the offending commit (or add a new one) with a proper prefix and
push again.
