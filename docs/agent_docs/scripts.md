# Scripts Directory
> Source: `scripts/` (~315 .py files, ~238 at top level)

## Purpose
Operational and one-off scripts for the Sefaria data pipeline: importing new books and lexicons, running data migrations, generating links, validating text structure, syncing with third-party services (Salesforce, NationBuilder), exporting data, and running recurring maintenance jobs (sitemaps, Elasticsearch reindexing, trend recalculation). Most are standalone Django-aware scripts that import directly from `sefaria.model` and operate against the live Mongo database.

## Subdirectories

### `scripts/books/`
Index-creation scripts for specific books that need custom structural logic (e.g. `mekhilta_derashbi_index.py`, `moreh_index.py`, `orot_index.py`). Use when adding a book whose structure can't be loaded through the standard JSON ingestion.

### `scripts/linker_books/`
Utilities for preparing book indexes for Linker v3 — bulk alt-title generation, commentary title munging, index modification for linker recognition, and LLM-based DH (dibur hamatchil) extraction. See `linker_books_utils.py` for shared helpers.

### `scripts/lexicon/`
Ingestion and cleanup for dictionary / wordform data: Strong's Enhanced Lexicon, Rashi's La'az glosses, Mishnah terms, Bible word forms. Used when adding a new lexicon or fixing wordform structure.

### `scripts/scheduled/`
Recurring jobs invoked by cron / k8s CronJobs. Includes:
- `generate_sitemaps.py` — rebuilds sitemap XMLs
- `reindex_elasticsearch_cronjob.py` / `_ES6.py` — ES reindexing
- `index_from_queue.py` — processes the ES indexing queue
- `recalculate_trends.py`, `recalculate_secondary_topic_data.py` — trend/topic aggregates
- `nation_builder_sync.py` — CRM sync
- `send_email_notifications.py` — daily/weekly digest mailer
- `webpages_cronjob.py`, `parse_rambi_webpages.py` — webpage link ingestion
- `regenerate_long_cached_data.py`, `metrics.py`

### `scripts/migrations/`
Formal one-shot schema/data migrations (e.g. `add_topic_images.py`, `migrate_good_to_promote_to_topic_pools.py`). Sparsely populated — most historical migrations live as ad-hoc scripts at the top level.

### `scripts/mishnah_map_validation/`
Validates the mapping between Mishnah references embedded in Talmud and standalone Mishnah refs (`mishnah_map_validation.py`, `ingest_new_links.py`).

### `scripts/workflowy/`
Integration with Workflowy outlines — `parse_index_and_version.py` turns a Workflowy export into an index + version document.

### `scripts/archive/`
Deprecated or historical scripts kept for reference (Onkelos link adders, old Mishneh Torah splitters, merge scripts for specific commentaries, Nation Builder tag sync, etc.). Do not rely on these working against current schema.

### `scripts/setup/`
Developer onboarding — currently only `setup_hooks.sh` for installing git hooks.

## Top-Level Scripts
The ~238 files at the root of `scripts/` are largely ad-hoc, one-off utilities. Broad categories by filename prefix:

- **`add_*`** — add fields, links, or related objects (e.g. `add_ramban_links.py`, `add_corpora.py`, `add_all_links.py`, `add_licenses.py`)
- **`fix_*`** — data corrections (e.g. `fix_bad_sheet_refs.py`, `fix_rashi_double_quotes.py`, `fix_jagged_arrays.py`)
- **`delete_*` / `clean_*`** — data cleanup (e.g. `delete_spam_users.py`, `delete_duplicate_profiles.py`, `delete_duplicate_links.py`, `clean_talmud.py`, `cleanup_linker_cache.py`)
- **`find_*`** — diagnostic queries (e.g. `find_broken_links.py`, `find_non_english_versions.py`, `find_unique_words.py`)
- **`check_*`** — validation (`check_kehot.py`, `check_english_hebrew_section_lengths.py`)
- **`export_*`** — data exports (`export_all.py`, `export_jps.py`, `export_users_not_in_salesforce.py`)
- **`convert_*` / `change_*`** — structural transformations (`convert_to_complex_text.py`, `change_address_types.py`)
- **`count_*` / `*_stats.py`** — reporting (`bavli_word_count.py`, `daf-yomi-stats.py`, `contributor_stats.py`)
- **Book-specific importers** — e.g. `arukh_hashulchan.py`, `bootstrap_topics.py`, `ImportAshlagTopics.py`, `catch_refs_yerushalmi_translation.py`

## Common Patterns
Nearly every script begins with:

```python
import django
django.setup()
from sefaria.model import *
```

From there they operate directly against the Mongo collections via model classes (`Index`, `Version`, `Ref`, `Link`, `UserProfile`, `Topic`, etc.) or the raw `sefaria.system.database.db` handle. Most accept command-line arguments via `argparse` or `sys.argv`; many support a `--dry-run` flag for destructive operations. Output is usually printed to stdout and/or written to a CSV alongside the script.

Scripts assume Django settings are available — i.e. `DJANGO_SETTINGS_MODULE` points at `sefaria.settings` and `sefaria/local_settings.py` is configured with a reachable Mongo instance.

## Running Scripts
From the project root, with the Sefaria virtualenv active and `local_settings.py` pointing at the target database:

```bash
python scripts/<script_name>.py [args]
```

Scheduled jobs are invoked identically but wired up through the Helm chart / k8s CronJobs rather than run by hand. For destructive scripts, prefer running against a staging database first and use `--dry-run` when the script supports it.
