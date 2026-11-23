# Sefaria-Project Pipelines

## Commit is pushed to master

A push to `master` triggers the `continuous` pipeline in limited run mode (pushes to other branches only run it once the branch has an open PR, see below). This will result in the node, web and asset images being built and pushed to the dev GCR registry. The images names will reflect which branch they are built from, and the image tags will indicate the commit and datetime.

## Commit is pushed to PR branch

If a commit is pushed to a branch that has an open PR, the `continuous` pipeline is triggered in full run mode. This will build and push the images asin limited mode, and then additionally deploy a sandbox instance using the built images. The sandbox is deployed as a helm install, using the latest version of the chart, and a values file located in `build/ci/`, which is modified during the pipeline to indicate which commit triggered the deployment. After the sandbox deployment has been verified, pytest and selenium tests are executed in the sandbox, after which the sandbox is destroyed.

Every non-draft PR also runs the `Continuous Testing: Playwright e2e` job, which needs no sandbox. It runs the whole site on the GitHub runner, built from the PR's code, against a fresh MongoDB restored from the public dump (`build/ci/restore-test-mongo.sh`, the same restore the pytest jobs use, then `build/ci/start-e2e-app.sh`), and drives it at `https://www.sefaria.test`. It runs the BDD story suite (`npm run test:bdd`, blocking) and the Chrome `@pr` core journeys (`npm run test:pr`; a warning only while the `E2E_PR_BLOCKING` repo variable is `false`, which is how it starts; blocking once it is set to `true`). It takes about 11 minutes; the Mongo restore runs in the background while dependencies install and the bundles build, so it adds no wait. Which tests may be `@pr`: `e2e-tests/Sanity/README.md` §6a. Process: `e2e-tests/feature-specs/README.md`.

## Commit is pushed to a PR that has a merge conflict

GitHub does not run `pull_request` workflows while a PR has a merge conflict, so `continuous` is skipped and no images or cauldron updates happen. The `merge-conflict-notification` pipeline (`pull_request_target`, no PR code checked out) catches this: it sets a failing `Continuous / merge conflict (<base>)` status on the pushed commit, comments on the PR mentioning the pusher and author, and posts a Slack message tagging the pusher and the PR author in the test-failure channel (#engineering-signal). Only logins mapped to a Slack user ID in `GITUSER_SLACK_MAP` are notified; the job log warns about the rest.

## Commit that affects `helm-charts` is pushed to a branch

Any commit that affects the contents of the `helm-charts` folder will additionally trigger the `helm` pipeline. This runs a lint job to check the chart contents.

## Commit that affects `helm-charts` is merged to master

Any changes to the helm-charts folder that are merged to master will trigger the `helm-release` pipeline. The pipeline calculates the next version to apply to the chart, which is currently always a minor version bump each time it is run. It then creates a release event via the github api, which in turns applies a `helm-chart-version` tag to the commit. In addition, it creates a packaged version of the chart, including metadata related to the release version, and copies it to the `gh-pages branch` of the project. `gh-pages` has been reserved to be automatically published as a web page by github, which in this instance functions as a Helm Repository

## Version tag matching `^v.*` is applied to master

The intended method of applying a release version tag to the repository is by manually publishing a release via the github UI.

Google Cloud Build monitors the repository for updates to release version tags. When one is detected, Cloud Build creates new images for node, web and asset, performs various bash based templating actions to generate a helm chart and then deploys the chart to the production cluster with a fixed values file.

| Note: the cloudbuild deployment is being deprecated and will be replaced by a github based pipeline that uses the in-repo chart

When github detected a release verson tag is applied to the repository, it will trigger the production deploy pipeline. This builds the node, web and asset images, and then pushes them to the production gcr registry. It then performs a helm upgrade using a values file in `build/ci` and a specified chart version pullfrom the GH Pages Helm Registry.

| Note: the github based deployment is still in testing and deploys a second 'test' prod-like instance.

## Pull request is opened or updated (non-draft), or commit is pushed to master

The `Linting` pipeline (`linting.yaml`) runs four independent jobs: Ruff (Python lint + format check), ESLint (JS/JSX), Stylelint (SCSS) and Prettier (formatting check for JS/JSX, SCSS and Markdown). Warnings fail the build. It can also be triggered manually. See `docs/linting.md` for how to run the same checks locally.

## Pull request touches behavior specs (`e2e-tests/feature-specs/features/`)

The `Feature Spec Lock` pipeline (`feature-spec-lock.yaml`) runs on every PR. It passes immediately when no locked file changed (the `.feature` specs, `e2e-tests/feature-specs/CLAUDE.md`, the `.claude/hooks/guard-feature-specs.sh` agent guard, this workflow and `build/ci/check-feature-spec-lock.sh`). Otherwise it fails if any commit that changes a locked file was authored by someone not listed in the `SPEC_EDITORS` repo variable. No review is involved. It runs on `pull_request_target`, so the workflow and script always come from `master` and a PR can't edit the check to let itself through. It never executes code from the PR. Merge commits are checked by what they add beyond their parents, so a clean merge of `master` passes but a spec edit made inside a merge does not, and any locked change that can't be traced to a PR commit fails. Set `SPEC_LOCK_REQUIRE_SIGNED=true` to also require verified signatures on those commits, committed by a spec editor (GitHub web-editor commits pass). Tests: `python -m pytest build/ci/tests/test_check_feature_spec_lock.py`. Process and amendment path: `e2e-tests/feature-specs/README.md`.

## Commit pushed to a branch that changes behavior specs (not `master`)

The `BDD step stubs` pipeline (`bdd-stubs.yaml`) runs when a push changes `e2e-tests/feature-specs/features/`. It writes a step-definition stub for every spec sentence that has no step yet (`build/ci/bdd-stubs/generate-step-stubs.cjs`) and commits them to the same branch as `github-actions[bot]`, so the engineer receives a branch whose new scenarios fail with "Step not implemented yet". It only touches `e2e-tests/feature-specs/steps/`. Its push doesn't trigger other workflows. Process: `e2e-tests/feature-specs/README.md`, "Step stubs".
