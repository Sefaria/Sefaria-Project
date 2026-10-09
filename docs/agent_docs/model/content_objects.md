# Content Objects
> Sources: `sefaria/model/note.py`, `sefaria/model/layer.py`, `sefaria/model/passage.py`, `sefaria/model/guide.py`, `sefaria/model/story.py`

## Purpose
These models represent user-created and editorial content that annotates or supplements the core text library. Notes are user annotations on specific refs; Layers group notes into collections; Passages define structural units (sugyot/mishnayot); Guides provide curated question-and-commentary experiences for sidebar display; Story is a deprecated utility class retained only for sheet/publisher metadata helpers.

## note.py

### Note (AbstractMongoRecord)
- **Collection:** `notes`
- **A user annotation on a specific text ref.** Can be public or private.
- **Required attrs:** `owner`, `public`, `text`, `type`, `ref`
- **Optional attrs:** `title`, `anchorText`
- **HTML sanitization:** `ALLOWED_TAGS` (i, b, br, u, strong, em, big, small, span, div, img, a) and `ALLOWED_ATTRS` restrict content.
- **`_normalize()`** canonicalizes `self.ref` via `Ref(self.ref).normal()`.

### NoteSet (AbstractMongoSet)
Standard set class for Note.

### Cascade functions
- **`process_index_title_change_in_notes(indx, **kwargs)`** -- Updates refs in all notes when an index title changes. Notes that fail to save after the ref update are deleted.
- **`process_index_delete_in_notes(indx, **kwargs)`** -- Deletes all notes whose ref matches the deleted index.

## layer.py

### Layer (AbstractMongoRecord)
- **Collection:** `layers`
- **A named collection of Notes (and potentially sources).**
- **Required attrs:** `owner`, `urlkey`, `note_ids` (list of ObjectIds), `sources_list`
- **Optional attrs:** `name`, `first_ref`, `all_refs`
- **Key methods:**
  - `all(tref=None)` -- Returns notes + sources, optionally filtered by ref.
  - `notes(tref=None)` -- Queries NoteSet by `_id` in `self.note_ids`; filters by section-level ref regex when tref given.
  - `sources(tref=None)` -- Stub, always returns `[]`.
  - `add_note(note_id)` -- Appends an ObjectId to `note_ids` (deduplicates).
  - `set_first_ref()` -- Sets `first_ref` from the first note's ref. Called automatically on save if unset.
  - `listeners()` -- Returns distinct owner UIDs across all notes in the layer (for change notifications).

### LayerSet (AbstractMongoSet)
Standard set class for Layer.

### Cascade function
- **`process_note_deletion_in_layer(note, **kwargs)`** -- Registered in `dependencies.py` on Note delete. Removes the deleted note's `_id` from every Layer that references it, then saves.

## passage.py

### Passage (AbstractMongoRecord, MatchTemplateMixin)
- **Collection:** `passage`
- **Represents a structural text unit: a sugya, mishnah, passage, or biblical story.**
- **Required attrs:** `full_ref`, `type`, `ref_list` (list of segment-level ref strings)
- **Optional attrs:** `same_as`, `source`, `match_templates`
- **`possible_types`:** `["Mishnah", "Sugya", "passage", "biblical-story"]`
- **Key methods:**
  - `containing_segment(cls, ref)` -- Class method. Finds the shortest Passage whose `ref_list` includes the given segment ref.
  - `ref()` -- Returns `Ref(self.full_ref)`.
- **`_normalize()`** expands `ref_list` from the range list of `full_ref`.
- **`_validate()`** asserts `self.type` is in `possible_types`.
- Mixes in `MatchTemplateMixin` from `sefaria.model.linker.has_match_template` for linker integration.

### PassageSet (AbstractMongoSet)
Standard set class for Passage.

## guide.py

### Guide (AbstractMongoRecord)
- **Collection:** `guide`
- **Curated question-and-commentary content for the sidebar connection panel.**
- **Required attrs:** `ref`, `expanded_refs` (auto-populated list of segment refs), `questions`
- **Data structure:** Each guide has a `ref` and an array of `questions`. Each question has a `question` string and an array of `commentaries`, each with `commentaryRef` and `summaryText`. See the embedded JSON Schema in the docstring for the full specification.
- **Key methods:**
  - `set_expanded_refs()` -- Expands `self.ref` to all segment-level refs. Called during `_normalize()`.
  - `load_by_ref(ref)` -- Loads a guide by its canonical ref.
  - `contents()` -- Adds `anchorRef` and `anchorRefExpanded` keys (aliases of `ref` and `expanded_refs`) to the dict output for client consumption.
- Originally built for Pesach Haggadah; the model is generic.

### GuideSet (AbstractMongoSet)
- **`load_set_for_client(cls, tref)`** -- Class method. Given a text ref, expands to segment refs, queries for all Guides with overlapping `expanded_refs`, and returns their `.contents()`.

## story.py

### Story (plain object -- NOT an AbstractMongoRecord)
- **DEPRECATED since Nov 2022.** Not backed by MongoDB. Retained solely for static helper methods used in sheet and trend statistics.
- **Static methods:**
  - `sheet_metadata(sheet_id, return_id=False)` -- Fetches sheet metadata and formats it.
  - `build_sheet_metadata_dict(metadata, sheet_id, return_id=False)` -- Builds a dict with `sheet_title`, `sheet_summary`, `publisher_id`, `sheet_via`.
  - `publisher_metadata(publisher_id, return_id=False)` -- Fetches public user data and builds a publisher info dict.
  - `sheet_metadata_bulk(sid_list, return_id=False, public=True)` -- Bulk version of `sheet_metadata`.
- TODO in source: "Refactor out of existence."

## Non-Obvious Patterns
- **Note HTML sanitization is defined but not enforced in `_normalize` or `_validate`.** The `ALLOWED_TAGS` / `ALLOWED_ATTRS` constants exist on Note but are consumed externally (likely in API views) rather than by the model itself.
- **Layer.sources() is a stub** that always returns `[]`. The `sources_list` required attr and `all()` method suggest sources were planned but never implemented.
- **Passage._normalize has a bug:** line 39 checks `if type == "Mishnah"` using the builtin `type` function instead of `self.type`. The Mishnah same_as logic is also commented out.
- **Guide.contents() adds client-specific keys** (`anchorRef`, `anchorRefExpanded`) directly in the model, coupling it to the API response shape.

## Relationships
- **Note -> Layer:** A Layer holds a list of Note `_id`s in `note_ids`. Deleting a Note cascades to remove its ID from all referencing Layers via `process_note_deletion_in_layer`, registered in `dependencies.py`.
- **Note -> Index:** Index title changes cascade to update Note refs; index deletion cascades to delete matching Notes. Both registered in `dependencies.py`.
- **Guide -> Ref / Commentary texts:** Guides reference primary texts via `ref` and commentary texts via `commentaryRef` inside the questions structure. These are string references, not foreign keys.
- **Passage -> Ref:** Passages wrap a `full_ref` and expand it to `ref_list` segment refs. Used by the linker system via `MatchTemplateMixin`.
- **Story -> Sheets / UserProfile:** Story's static methods reach into `sefaria.sheets` and `user_profile` for metadata but Story itself has no persistent storage.

## Common Tasks
- **Add a note to a layer:** Call `layer.add_note(note_id)` then `layer.save()`.
- **Get all notes for a text ref within a layer:** `layer.notes(tref="Genesis 1:1")` filters by section-level regex.
- **Find the sugya containing a segment:** `Passage.containing_segment(ref)` returns the shortest matching Passage.
- **Load guide content for a ref (client-facing):** `GuideSet.load_set_for_client("Pesach Haggadah, Kadesh 2")` returns list of dicts with anchorRef keys.
- **Get sheet metadata for statistics:** `Story.sheet_metadata(sheet_id)` or `Story.sheet_metadata_bulk(id_list)`.
