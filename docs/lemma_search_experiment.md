# Lemma search comparison experiment

Open `/experimental/lemma-search/` on your local Django library server. This is a
standalone comparison page; it does not change the ordinary `/search` UI.
The Elasticsearch baseline and enhanced lists query the same 55,589-passage Hebrew corpus:
Tanakh, Rashi on Tanakh, and Mishnah. The original cleaned passage is displayed;
lemma highlights are not reconstructed. Links open the corresponding reader ref
and Hebrew version. Missing sheets/entity indexes mean the normal search page is
not a supported entry point with these local settings.

## Ordinary-search baseline

The page loads the existing Sefaria browser bundle and calls its Search object's
`isDictaQuery`, `dictaQuery`, `dictaBooksQuery`, `mergeQueries`, and
`mergeTextResultsVersions` methods. Ordinary search code is unchanged. Both lists
share one Dicta response, including native query parameters, reference adaptation,
category replacement, and score calibration. As on the ordinary frontend, each
provider supplies up to 100 candidates before display is limited and versions are
grouped by reference. A Dicta failure invalidates the comparison instead of silently
presenting a partial baseline. Results identify their provider.

The Elasticsearch source remains our frozen 55,589-passage Hebrew corpus, rather
than the live library's versions. Dicta provides its own Tanakh text version, just
as on the site. Thus this reproduces ordinary provider behavior **on the experimental
corpus**, not the full live site's scores or results. Default slop 10 matches ordinary
search; changing that control makes the ES part a modified baseline.

Enhanced uses the same merge with one intentional extension: ES hits matching the
added lemma route survive the Tanakh replacement filter. Without that exception,
ordinary search would discard the very Tanakh lemma matches under test. Weight zero
uses the unmodified baseline merge in both lists. The current native replacement
checks whether `categories` contains `Tanakh`, including Rashi on Tanakh; this
existing behavior is preserved in baseline, not silently corrected by the POC.

Dicta snippets are rendered as text only and have no Shoshan hover annotations.
No reindexing is required. Run `node scripts/test_lemma_search_page.cjs` after building
the Sefaria browser bundle to check the adapter against the actual Search class.

## Local development

Start Docker Desktop, then in Sefaria-Data:

```sh
docker compose -f research/lemmatizer/offline_search/compose.yaml up -d
```

In Sefaria-Project, keep the worker running in a separate terminal:

```sh
../Sefaria-Data/research/lemmatizer/.venv/bin/python -B scripts/lemma_search_worker.py
```

Start Django with your usual environment, for example:

```sh
/Users/yon/.pyenv/versions/sefaria-3.12.9/bin/python -B manage.py runserver 127.0.0.1:8000
```

Visit `http://localhost:8000/experimental/lemma-search/` (or the library hostname
used by your existing local setup). The first query loads Shoshan on MPS. Later
queries reuse that model; repeated queries reuse their annotation. Django submits
jobs and polls them; neural inference runs in a separate, single-threaded queue.
The worker binds only to 127.0.0.1:19201 and uses the research virtualenv, avoiding
ML dependency changes to Django. Stop it with Ctrl-C. At most eight searches can
be pending; recent results are held in bounded memory, not written to disk.

## Local settings

These changes belong only in the ignored `sefaria/local_settings.py`:

```python
# SEARCH_URL = "https://www.sefaria.org:443/api/search"
SEARCH_URL = "http://127.0.0.1:19200"
# SEARCH_INDEX_NAME_TEXT = 'text'
SEARCH_INDEX_NAME_TEXT = 'lemma-poc-tanakh-rashi-mishnah-v1'
SEARCH_INDEX_ON_SAVE = False
LEMMA_SEARCH_EXPERIMENT = True
```

In local mode the experimental endpoints also require DEBUG and a loopback client address.
The worker's index is selected with `--index`; its default is the index above.
Changing Django's general SEARCH_URL does not configure the worker: the worker
independently restricts itself to local port 19200 and `lemma-poc-` indexes.
To restore ordinary remote search, restore the commented URL and text index and
set LEMMA_SEARCH_EXPERIMENT=False. No production settings or indexes are changed.

## Scoring and reproducibility

Reuses `Sefaria-Data/research/lemmatizer/src/offline_search.py` query builder and
`search_lemma_core.py` inference. Startup checks index readiness, preprocessing
hashes, dependency versions, model manifest, and downloaded Shoshan file hashes.
No copying or re-lemmatizing the corpus is required.

Baseline is the existing naive stemming phrase search. Enhanced adds a lemma
phrase clause, with its score multiplied by the selected weight, then applies
the same pagesheetrank factor. Either clause can retrieve a passage. Weight zero
explicitly removes the lemma clause, so both candidate sets and rankings equal
the baseline (a zero-boost clause alone would still admit additional documents).
Equal multipliers are not equal score contributions. No separate exact-word
boost is currently added. Scores across modes are not calibrated probabilities.
The page exposes actual query JSON and per-token annotations for inspection.

Labels marking results present in only one list refer to the displayed top N,
not the full candidate sets. This page is for exploration, not evidence of search
quality; representative queries and judged relevance are still required.

## Verification

Run the focused tests with the Django environment:

```sh
/Users/yon/.pyenv/versions/sefaria-3.12.9/bin/python -B scripts/test_lemma_search_experiment.py
```

Verified on 2026-10-06: 10 tests pass; Django system checks pass with existing
allauth deprecation warnings. A live browser search for בני ישראל produced
query lemmas בן ישראל, 754 baseline matches and 763 enhanced matches at weight 1.
At weight 0 the displayed results and scores were identical. These are functional
checks, not relevance judgments.

## Word lemmas

Query words appear as individual word → lemma cards. Result words expose their
saved corpus lemma on hover, keyboard focus, or tap. Fallbacks explicitly say
“Original word used”; these are not claimed to be model-generated lemmas.
The worker reads the original lemmas.jsonl export using a compact file-offset
lookup, verifies its hash against index provenance, and checks each displayed
passage and lemma string against the index. It does not run inference again on
results. Original punctuation, diacritics, and repeated-word positions are retained.
For another corpus pass `--annotations /path/to/matching/lemmas.jsonl`. Restart
the worker after this update and refresh the page. No reindexing is needed.

## Phrase flexibility correction

The normal frontend sends slop 10; exact mode sends 0. Earlier POC runs used 0
for both lists and therefore were stricter than ordinary website search. The
shared Phrase flexibility control now defaults to 10 and is applied to both
clauses; 0 reproduces the previous strict phrase behavior. This is positional
flexibility (gaps and reordering), not spelling fuzziness. The offline compare
command also exposes `--slop`, records it in the run manifest, and defaults to 10.
No model or index rebuild is needed. Old saved rankings have not been rewritten.

Shoshan's installed `lemmatize` API returns one lemma per token, not a candidate
list. Internally it selects a nearest bank lemma, then may replace it through
routing or transduction. Top retrieval neighbors alone are not validated
morphological alternatives, and retrieval cosine scores are not probabilities.
A future query-expansion experiment can retain the primary lemma and add a few
lower-weight alternatives from the corpus's surface-form-to-lemma associations,
with explicit controls and relevance judgments. No alternative expansion is
enabled by this change.

## Optional י / ו expansion

The checkbox (off by default) groups existing corpus lemmas by removing י and ו.
Each query word searches its original lemma plus all corpus lemmas in that group.
Empty reductions retain their original string. Displayed lemmas and indexed
documents do not change. Query cards show additional searched forms. This is
spelling-based expansion, not an assertion that these words have the same meaning.

The enhanced lemma clause is a dis_max of expanded match_phrase queries, all
using the shared slop. Only the best matching phrase contributes its lemma score
(tie_breaker=0), with the selected lemma weight. Baseline is unchanged, and weight
0 still disables the entire lemma route. At most 256 combinations are allowed;
queries exceeding that limit receive an explicit error, never silent truncation.
This preserves phrase slop, including transpositions and repeated-term semantics.
The alternatives are loaded from the verified corpus annotation export at worker
startup. No reindexing or new model inference on documents is required.

## Cluster deployment implementation

The opt-in `LEMMA_SEARCH_BACKEND=celery` mode now submits `lemma_search.compare`
to `<deployEnv>-lemma-search` using the existing web Celery app and shared
Redis/Sentinel. A separate CPU image consumes only this queue, using the same
`generate_config.py` connection logic. Ordinary `<deployEnv>-tasks` stays separate.
Results expire after 30 minutes; browser job handles are signed and bound to the
signed-in user or anonymous browser session and configured index. Submissions are
rate limited per user/session. Cluster access requires only the experiment flag;
no login or staff account is needed.
Local mode and its worker continue to work unchanged.

The dedicated image avoids changing the web app's Python dependencies. Its model
and frozen annotation bundle live at `/opt/lemma/research`; query initialization
still verifies pinned source/model/dependency hashes against the imported index.
The new Helm template keeps one dedicated worker replica warm and reads existing
Redis/ES credential secrets. No inference runs in gunicorn. Ordinary search index
settings are untouched. Publish and pin the branch chart: old charts ignore these
new values and do not expose the new Django settings.

### Prepare the image context locally (large, ignored output)

From Sefaria-Project:

```sh
python -B scripts/package_lemma_search.py \
  --research-root ../Sefaria-Data/research/lemmatizer \
  --output ../Sefaria-Data/research/lemmatizer/datasets/dev_bundle_v1
docker build --platform linux/amd64 -t lemma-search-worker:dev \
  ../Sefaria-Data/research/lemmatizer/datasets/dev_bundle_v1
```

The builder verifies model hashes and produces a per-file SHA256 manifest. It does
not upload anything. Do not commit the bundle, weights, or corpus. The Docker build
requires the pinned torch 2.14.1 CPU and other Linux wheels; if unavailable, stop and
validate a deliberate version change rather than bypassing provenance checks.

Use the cluster's existing image registry after a successful Linux smoke test.
`build/lemma-search/cauldron-values.example.yaml` is a values overlay, not a complete
Cauldron release. Service names, ES credentials/permissions and resource sizing must
be checked against live dev. The index must be populated before the first search.

### Import only the dedicated index

Inside the built image or another environment containing the frozen bundle:

```sh
python -m scripts.import_lemma_search_index \
  --url http://VERIFIED_DEV_ES_SERVICE:9200 \
  --allowed-host VERIFIED_DEV_ES_SERVICE \
  --index lemma-poc-lemma-search-tanakh-rashi-mishnah-v1
```

Inject ELASTIC_USERNAME/ELASTIC_PASSWORD through secret references with index-create
permissions for import. The runtime uses query credentials. The importer refuses an
existing index and never changes aliases. It reuses the fully validated offline
loader; its explicit allowlist transport is scoped to this process, leaving the
original local-only CLI unchanged. Run the importer as an intentional one-time job,
not on web or worker startup. Partial imports require investigation/a fresh name.

### Deployment status

The branch images and Helm chart are published, and the Cauldron release is
installed. Google Cloud authentication was restored on 2026-10-06. Dev ES 8.8.0
has the required ICU/Sefaria analyzers; the dedicated index is imported and ready.
Live Redis/Sentinel inference and the web container's actual Celery client both
pass. Capacity under concurrent users and Sentinel failover remain untested.

### Local deployment verification (2026-10-06)

- 21 isolated endpoint/worker tests pass, including staff authorization, signed job
  ownership, dedicated queue routing, expansion, and read-only runtime transport.
- Django system checks pass with three existing allauth deprecation warnings.
- Both enabled and disabled Helm configurations render with Helm 3.16.4; enabled
  worker and web config agree on the dedicated queue.
- The Linux amd64 CPU image builds successfully. The worker accepts the exact pinned
  torch release with its `+cpu` build suffix; other version mismatches still fail.
- A real local Redis broker/result backend and prefork Celery worker completed the
  expanded query `רחל בוכה בנים`: baseline 0, enhanced 2, lemmas `רחל בכה בן`.
  Setting weight zero returned baseline parity. The worker readiness probe passed.
- Cold queue-to-result time was 20.31 seconds; a cached repeat was 0.02 seconds on
  Docker Desktop. These are smoke-test timings, not cluster capacity measurements.

The temporary Redis/worker smoke-test containers were removed after validation.
The image and ignored frozen bundle remain locally. This initial local check
preceded registry publication and the Cauldron installation described below. Real
Sentinel failover remains untested.

## Automatic updates for the dev POC

The normal web/node/asset PR pipeline is unchanged. The additional
`.github/workflows/lemma-search.yaml` workflow builds worker changes on same-repo
PRs from `codex/lemma-search-experiment` (and supports manual dispatch on that
branch). Fork PRs cannot publish. Tags contain the Git SHA and UTC build timestamp.

The large, frozen bundle is published once to the **development** Artifact Registry
as `sefaria-lemma-search-bundle`. `build/lemma-search/bundle-image.txt` pins its
registry digest. The bundle includes Linux dependencies, pinned research sources,
weights, and corpus exports. CI layers the current worker/transport/importer and
shared Celery connection code onto that image; it does not rerun corpus inference.
The bundle manifest describes that frozen base, not the overlaid application code;
the worker image revision label identifies the current application code. To change
research preprocessing or dependencies, deliberately publish a new bundle and
update the digest after checking document/query provenance compatibility.

### Create the Cauldron with the standard tools

1. Push the Project branch and open its PR. Wait for the ordinary images, worker
   image, and branch Helm prerelease to publish. Use a conventional `feat:` or
   `helm:` commit for chart changes so the existing release workflow produces a version.
2. In cauldrons, use `create-cauldron.sh --name lemma-search --branch
   codex/lemma-search-experiment --tasks --no-keda --chart PUBLISHED_VERSION
   --dryrun`. This **pushes a review branch**; it is not a read-only preview.
3. On that review branch, merge `build/lemma-search/cauldron-values.example.yaml`
   into the release's `spec.values`, replacing the initial worker-image placeholder
   with the first published SHA/timestamp tag. Keep its `$imagepolicy` comment.
   Verify ES host/index before merging. Do not replace unrelated release values.
4. Append the two objects in `build/lemma-search/worker-imagepolicy.yaml` to the
   existing `imagepolicies/codexlemma-search-experiment.yaml` (with a YAML document
   separator). That file is already registered by the normal creator. This places
   the worker policy alongside the web/node/asset policies, with the same lifecycle.
5. Import the dedicated ES index once with the bundled importer and review the
   release diff. Merge the cauldrons review branch to deploy. Verify an anonymous visitor
   can search at `/experimental/lemma-search/`.

Flux then writes each newer worker image into `lemmaSearch.image` and reconciles
the deployment. Web-only edits use the existing pipeline; worker edits use this
additional pipeline. Neither needs a new chart unless deployment templates change.
The chart prerelease stays explicitly pinned. The creator/repoint scripts do not
yet understand this optional worker: re-running either for this POC requires
reapplying/reviewing these extra values and policies. Changing the tracked branch
also requires updating the workflow opt-in and the worker registry/policy names.

### Published POC artifacts

- Application PR: https://github.com/Sefaria/Sefaria-Project/pull/3787 (draft; the
  experiment branch is not merged into master).
- Cauldron configuration: https://github.com/Sefaria/cauldrons/pull/166 (merged).
- Pinned chart: `0.91.0-codexlemma-search-experiment.2`.
- Endpoint after installation: https://lemma-search.cauldron.sefaria.org/experimental/lemma-search/
  (no login required).
- The dev index `lemma-poc-lemma-search-tanakh-rashi-mishnah-v1` contains all 55,589
  documents. A Linux CPU query against this index reproduced baseline 0 / expanded
  2, including both Jeremiah 31:15 and Rashi on Jeremiah 31:15:2.
- The initial worker CI run stopped because its frozen base was still uploading.
  The subsequent run succeeded after publication; the registry digest matches
  `bundle-image.txt`. The published worker uses the normal branch registry, and
  Flux resolves its image policy successfully.

The initial Cauldron installation performs its normal database restore before
starting application pods. Code-only updates do not repeat this restore. Check
HelmRelease and pod readiness rather than treating successful image publication
as evidence that the website is ready.

### Live verification (2026-10-06)

Helm reports `Ready` after installation and an automatic image update. Flux
advanced the worker from `sha-415d8ea-20261006110908` to
`sha-623750c-20261006112012` after a subsequent branch push, exercising the actual
CI → registry → GitOps → deployment path. The initial database restore completed;
the upgrade did not repeat it.

A real task on `lemma-search-lemma-search`, using the cluster Redis/Sentinel and
dev Elasticsearch, returned baseline 0 / enhanced 2 for the expanded test query.
The cold round trip was 26.06 seconds. The same task sent by the web container's
actual Sefaria Celery app returned successfully in 0.13 seconds with the model and
query cached. These are smoke-test timings, not load-test results.

The initial deployment required staff login. That restriction has since been
removed: the page and query API allow anonymous visitors. Anonymous job handles
and rate limits are scoped to a random browser-session identity, rather than
sharing a single anonymous user ID. CSRF protection and signed job handles remain.

### Expansion limit fallback

If ignoring י/ו would generate more than 256 phrase combinations, the worker
continues with the original lemma query and returns a visible warning. It records
`expansion_requested: true` and `expand_yod_vav: false`, and the displayed alternatives
reflect what was actually searched. It does not truncate alternatives silently or
raise the Elasticsearch workload limit. The baseline remains unchanged.
