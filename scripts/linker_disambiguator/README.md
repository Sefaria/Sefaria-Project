# Linker Disambiguator Scripts

Scripts for running, reviewing, and migrating disambiguated linker output between environments.

## Export / Import (cross-environment migration)

Use these two scripts to copy disambiguated results from one MongoDB environment to another (e.g. production → staging).

### Export: `export_disambiguated_objects_to_json.py`

Reads `linker_disambiguation_tmp` to find which documents were touched by the disambiguator, then fetches their current state from the target collections and writes three JSON files.

```bash
./run scripts/linker_disambiguator/export_disambiguated_objects_to_json.py --output-dir /tmp/disambig-export
```

Output files:
- `links.json` — link objects from the `links` collection
- `linker_output.json` — linker output docs from the `linker_output` collection
- `marked_up_text_chunks.json` — marked-up text chunk docs from `marked_up_text_chunks`

### Import: `import_disambiguated_objects_from_json.py`

Loads the three JSON files produced by the export script and upserts them into MongoDB. Handles ID conflicts gracefully: if a document's `_id` and natural key (refs or ref/versionTitle/language) point to different existing documents, it deletes the stale `_id` record and leaves the natural-key record.

```bash
./run scripts/linker_disambiguator/import_disambiguated_objects_from_json.py \
  --links /tmp/disambig-export/links.json \
  --linker-output /tmp/disambig-export/linker_output.json \
  --marked-up-text-chunks /tmp/disambig-export/marked_up_text_chunks.json
```

Per collection, the script prints counts of new / updated / skipped / deleted documents.

---

## Dispatching disambiguation tasks

### `dispatch_library_links_disambiguation_tasks.py`

Scans `linker_output` for citations that need disambiguation (ambiguous refs or non-segment-level resolutions), groups them by base text ref to maximize Anthropic prompt-cache hits, and enqueues Celery tasks.

```bash
./run scripts/linker_disambiguator/dispatch_library_links_disambiguation_tasks.py

# Skip the first N payloads (useful if a previous run was interrupted)
./run scripts/linker_disambiguator/dispatch_library_links_disambiguation_tasks.py --start 1000

# Limit to N payloads (randomly shuffled)
./run scripts/linker_disambiguator/dispatch_library_links_disambiguation_tasks.py --limit 500

# Resume after a specific payload (pass a JSON file containing the last-dispatched payload)
./run scripts/linker_disambiguator/dispatch_library_links_disambiguation_tasks.py \
  --resume-after-payload-file last_payload.json

# Dry-run resume (find the anchor and print context without dispatching)
./run scripts/linker_disambiguator/dispatch_library_links_disambiguation_tasks.py \
  --resume-after-payload-file last_payload.json --dry-run

# Filter to a specific ref subtree (debug)
./run scripts/linker_disambiguator/dispatch_library_links_disambiguation_tasks.py \
  --debug-ref "Genesis 1"
```

Requires Celery to be enabled (`CELERY_ENABLED = True` in `local_settings.py`) and a running broker (Redis or RabbitMQ).

Set `DEBUG_MODE = True` at the top of the script to sample a small random subset instead of processing all documents.

---

## Reviewing disambiguation results

### `review_disambiguator.py`

Given a segment ref or a Sefaria URL, loads the corresponding `linker_output` records, runs the disambiguator live, and prints results with Sefaria URLs (`?debug_mode=linker`).

Edit the variables at the top of the script rather than passing CLI flags:

```python
INPUT_REF_OR_URL = "Notes by Rabbi Yehoshua Hartman on Gevurot Hashem 37:26"
VERSION_TITLE = None          # optional, to narrow to one version
BASE_URL_OVERRIDE = None      # e.g. "https://www.sefaria.org"
```

Then run:

```bash
./run scripts/linker_disambiguator/review_disambiguator.py
```

---

## Evaluating disambiguation quality

### `export_disambiguation_tmp_to_csv.py`

Exports `linker_disambiguation_tmp` (up to 1000 `mutc`-type records) to CSV. Each row represents one disambiguation event with its payload, result, and Hebrew/English context fetched from Sefaria. If English text is unavailable, Claude Sonnet translates from Hebrew.

Requires `ANTHROPIC_API_KEY` in the environment when translation is needed.

```bash
# Write to stdout
./run scripts/linker_disambiguator/export_disambiguation_tmp_to_csv.py

# Write to file
./run scripts/linker_disambiguator/export_disambiguation_tmp_to_csv.py --output results.csv

# Control parallelism for text fetching (default: 30 threads)
./run scripts/linker_disambiguator/export_disambiguation_tmp_to_csv.py --output results.csv --threads 10
```

### `view_disambiguation_csv.py`

Streamlit UI for reviewing and annotating a CSV produced by the export script. Supports filtering by case type, success, method, and correctness annotation. Annotations are written to the `correcness` column (preserving the original column name) and can be saved back to the CSV file or downloaded.

```bash
streamlit run scripts/linker_disambiguator/view_disambiguation_csv.py -- --csv results.csv
```

Or open the app and upload the CSV via the sidebar.
