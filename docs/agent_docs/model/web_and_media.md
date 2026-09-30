# Web Content & Media
> Sources: `sefaria/model/webpage_text.py`, `sefaria/model/media.py`, `sefaria/model/audio.py`, `sefaria/model/portal.py`

## Purpose
These modules handle external and multimedia content that connects to Sefaria's core text library. They cover cached webpage text (for Sefaria's linker/webpages feature), audio and video media linked to specific refs (shown in the sidebar connections panel), and portal landing pages for partner organizations. They are grouped because they all represent externally-sourced or supplementary content rather than primary text data.

## webpage_text.py

### WebPageText (AbstractMongoRecord)
- **Collection:** `webpages_text`
- **Required attrs:** `url`, `title`, `body`
- **Primary key tracking:** `track_pkeys = True`, keyed on `url`
- Stores the extracted text content of external webpages that reference Sefaria texts (used by the Sefaria Linker ecosystem).
- `load(url_or_query)` -- accepts a raw URL string (auto-normalized) or a dict query.
- `_normalize()` -- normalizes the URL via `sefaria.helper.webpages.normalize_url`.
- `_validate()` -- uses Django's `URLValidator`; raises `DuplicateRecordError` if another record with the same URL already exists (manual uniqueness enforcement).
- `add_or_update(webpage_text_contents)` -- static upsert method. Takes a dict with `url`, `title`, `body`. Returns `("excluded", existing)` if content is unchanged, `("excluded", None)` if the URL fails validation, or `("saved", record)` on success.

### WebPageTextSet (AbstractMongoSet)
Standard set class for `WebPageText`.

## media.py

### Media (AbstractMongoRecord)
- **Collection:** `media`
- **Required attrs:** `media_url`, `source_he`, `source`, `media_type`, `ref`, `license`, `source_site`, `description`, `description_he`
- Represents video/visual media items shown in the sidebar connections panel.
- `ref` field is an array of sub-documents, each containing `sefaria_ref`, `start_time`, and `end_time` (mapping time ranges to text refs).
- `_normalize()` -- normalizes the top-level `self.ref` via `Ref()`. Note: this appears to conflict with `ref` being an array in practice; the `get_media_for_ref` function iterates over `media.ref` as a list.
- `client_contents(ref)` -- builds a client-facing dict from one matched ref sub-document, merging the media's metadata with the ref's timing and anchor info.

### MediaSet (AbstractMongoSet)
Standard set class for `Media`.

### get_media_for_ref(tref)
Module-level function. Given a text ref string, queries the `media` collection for any media whose `ref.sefaria_ref` matches the ref's regex patterns. Returns a list of client-formatted dicts. Uses `Ref.regex(as_list=True)` for flexible matching across ref ranges.

## audio.py

### Audio (AbstractMongoRecord)
- **Collection:** `audio`
- **Required attrs:** `audio_url`, `source`, `audio_type`, `ref`, `media`, `license`, `source_site`, `description`
- Structurally very similar to `Media` but for audio content. The `media` field here is an attribute of Audio (not the Media class), likely a reference to an associated media/image.
- `ref` is an array of sub-documents with `sefaria_ref`, `start_time`, `end_time` (same pattern as Media).
- `client_contents(ref)` -- same pattern as Media; note it includes a `print(d)` debug statement that should probably be removed.

### AudioSet (AbstractMongoSet)
Standard set class for `Audio`.

### get_audio_for_ref(tref)
Module-level function. Identical pattern to `get_media_for_ref` -- queries by ref regex, returns client-formatted results.

## portal.py

### Portal (SluggedAbstractMongoRecord)
- **Collection:** `portals`
- **Slug fields:** `['slug']`
- **Required attrs:** `slug`, `about`, `name`
- **Optional attrs:** `mobile`, `newsletter`, `organization`
- Represents a partner organization's landing page on Sefaria (e.g., a curated portal for a specific institution).
- Uses `attr_schemas` for deep nested validation of its complex structure:
  - **about** -- bilingual title (en/he), optional title_url, image_uri, image_caption, bilingual description.
  - **mobile** -- bilingual title, description, android_link, ios_link.
  - **organization** -- bilingual title and description.
  - **newsletter** -- bilingual title and description, title_url, and `api_schema` with `http_method` and payload key mappings (`first_name_key`, `last_name_key`, `email_key`) for subscribing users to the partner's newsletter.
- `_validate()` -- validates URLs in about.title_url, mobile.android_link, mobile.ios_link, and the HTTP method in newsletter.api_schema.

### PortalSet (AbstractMongoSet)
Standard set class for `Portal`.

## Non-Obvious Patterns
- **Media and Audio are near-duplicates.** They follow the same architecture (record class, set class, `get_*_for_ref` function) with minor field differences. Any bug fix or enhancement in one likely needs to be mirrored in the other.
- **Bug in get_media_for_ref:** The variable `media` in the final loop refers to the last item from the `for media in results` loop, meaning all matched refs in the second loop use the last media record's `client_contents`. This is a latent bug when multiple Media records match.
- **Debug print in audio.py:** `client_contents` contains `print(d)` which will log to stdout in production.
- **_normalize inconsistency in Media/Audio:** `_normalize` calls `Ref(self.ref).normal()` treating `self.ref` as a string, but the query functions and `client_contents` treat `ref` as a list of dicts. This suggests `_normalize` may not work correctly (or is never called on records with array refs).
- **WebPageText enforces uniqueness manually** in `_validate` rather than relying on a MongoDB unique index, checking for duplicates on every save.
- **Portal uses SluggedAbstractMongoRecord** (not plain AbstractMongoRecord), giving it slug-based URL routing and the slug generation/validation machinery from that base class.

## Relationships
- **Media/Audio -> text.Ref:** Both use `Ref` for normalizing and regex-matching against the text library.
- **WebPageText -> sefaria.helper.webpages:** Depends on `normalize_url` for URL canonicalization. Related to the `WebPage` model in `sefaria/model/webpage.py` which tracks the pages themselves (as opposed to their extracted text).
- **Portal -> sefaria.system.validators:** Uses `validate_url` and `validate_http_method` from the system validators module.
- **All four -> abstract.py:** Standard AbstractMongoRecord / AbstractMongoSet inheritance (Portal uses the Slugged variant).

## Common Tasks
- **Add a new media/audio entry:** Create a `Media` or `Audio` record with the required attrs; `ref` should be a list of `{sefaria_ref, start_time, end_time}` dicts.
- **Query media for a ref:** Call `get_media_for_ref(tref)` or `get_audio_for_ref(tref)` with a Sefaria ref string. Be aware of the bug in `get_media_for_ref` noted above.
- **Upsert webpage text:** Use `WebPageText.add_or_update({"url": ..., "title": ..., "body": ...})`. Check the return tuple for status.
- **Create a partner portal:** Instantiate a `Portal` with `slug`, `name`, and an `about` dict containing bilingual title and description. Save to persist.
- **Add newsletter integration to a portal:** Populate the `newsletter` attr with bilingual title/description and an `api_schema` specifying `http_method` and the payload key mappings for the partner's subscription API.
