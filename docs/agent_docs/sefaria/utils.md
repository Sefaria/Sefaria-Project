# Sefaria Utilities (`sefaria/utils/`)
> Sources: `sefaria/utils/util.py`, `hebrew.py`, `user.py`, `talmud.py`, `log.py`, `calendars.py`, `chatbot.py`, `testing_utils.py`, `domains_and_languages.py`, `views_utils.py`

## Purpose

A collection of pure-ish utility modules that provide foundational operations used across the Sefaria codebase: Hebrew numeral encoding/decoding, calendar lookups, text/data-structure manipulation, user account management, multi-domain/language routing, and view helpers.

## Key Components

### `util.py` -- General-Purpose Helpers

| Area | Key Functions |
|---|---|
| **Time** | `epoch_time()`, `td_format()` (timedelta to readable string), `get_hebrew_date()` (Gregorian to Hebrew calendar via `convertdate`) |
| **Lists** | `list_depth()` (nesting depth of a list), `list_chunks()`, `union()`, `flatten_jagged_array()`, `is_text_empty()`, `rtrim_jagged_string_array()` |
| **Dicts** | `traverse_dict_tree(dict, key_list)` -- navigate nested dicts by key path; `deep_update()` -- recursive dict merge |
| **Text/HTML** | `strip_tags()` (via `MLStripper` HTMLParser subclass), `titlecase()` (NYT-style smart title-casing), `string_overlap()`, `replace_using_regex()`, `count_by_regex()`, `truncate_string()` (HTML-aware truncation with ellipsis), `text_preview()` |
| **Language codes** | `short_to_long_lang_code()` ("he" -> "hebrew"), `get_short_lang()` (reverse), `get_lang_codes_for_territory()` (via babel) |
| **Wrapping** | `wrap_chars_with_overlaps()` -- wraps character ranges in a string, correctly shifting indices when ranges overlap |
| **Subclasses** | `get_all_subclasses(cls)`, `get_all_subclass_attribute(cls, attr)` -- recursively find all subclasses of a class |
| **Other** | `get_size()` (recursive memory size), `graceful_exception()` (decorator: catch exceptions, log, return default), `in_directory()`, `get_directory_content()`, `is_int()` |

### `hebrew.py` -- Hebrew Numeral & Text Operations (~676 lines)

**Constants:**
- `GERESH`, `GERSHAYIM` -- Unicode punctuation marks for Hebrew numerals
- `ALPHABET_22`, `ALPHABET_27` (with final letters), `FINAL_LETTERS`
- `H2E_KEYBOARD_MAP`, `E2H_KEYBOARD_MAP`, `KEYBOARD_SWAP_MAP` -- bidirectional Hebrew/English keyboard layout mappings
- `PREFIXES` -- set of common Hebrew grammatical prefixes (single and double letter)

**Numeral conversion:**
- `heb_to_int(char)` / `int_to_heb(int)` -- single character <-> integer (memoized)
- `decode_hebrew_numeral(str)` -- full Hebrew numeral string to int (handles thousands via geresh)
- `encode_hebrew_numeral(n)` / `encode_small_hebrew_numeral(n)` -- int to Hebrew numeral string (memoized)
- `encode_hebrew_daf(daf)` -- e.g. "21a" -> Hebrew daf with amud marker
- `sanitize(input_string)` -- applies special-case replacements (15=tet-vav, 16=tet-zayin, 270/272/275 corrections) and adds geresh/gershayim punctuation
- `break_int_magnitudes(n)` -- decompose integer into place-value components
- `split_thousands(n)` -- split Hebrew numeral string on geresh for thousands groups
- `gematria(string)` -- sum of letter values

**Text analysis:**
- `has_hebrew()`, `is_all_hebrew()`, `is_mostly_hebrew()` -- detect Hebrew content
- `strip_nikkud()`, `strip_cantillation()`, `has_cantillation()` -- vowel/cantillation mark handling
- `hebrew_plural(s)` -- irregular plurals for Jewish terms (Daf->Dappim, Mishnah->Mishnayot, etc.)
- `hebrew_term(s)` -- look up Hebrew translation of an English term via library
- `hebrew_parasha_name(value)` -- English parasha name to Hebrew, handles double-parshiot with hyphens

**Keyboard & normalization:**
- `swap_keyboards_for_string()` -- convert text typed on wrong keyboard layout
- `decompose_presentation_forms_in_str()` -- normalize Unicode presentation forms to standard Hebrew
- `normalize_final_letters_in_str()` -- convert final letters (sofit) to regular forms

**Abbreviation matching:**
- `is_abbr(word)` -- detect Hebrew abbreviations (contains embedded quotation mark)
- `get_abbr()`, `get_all_abbrs()` -- match abbreviations against expanded word lists
- `hebrew_starts_with()` -- prefix matching with abbreviation expansion support
- `get_prefixless_inds()`, `get_matches_with_prefixes()` -- strip Hebrew grammatical prefixes for matching

### `calendars.py` -- Jewish Calendar Lookups

Each function queries a MongoDB collection and returns a standardized dict with `title` (en/he), `displayValue`, `url`, `ref`, `order`, and `category`:

- `parashat_hashavua_and_haftara()` -- weekly Torah portion with haftarah by custom (ashkenazi/sephardi/edot hamizrach)
- `daf_yomi()`, `daf_weekly()`, `yerushalmi_yomi()` -- Talmud study cycles
- `daily_929()`, `daily_mishnayot()`, `daily_rambam()`, `daily_rambam_three()` -- daily study programs
- `halakhah_yomit()`, `arukh_hashulchan()` -- halakha cycles
- `tanakh_yomi()`, `tanya_yomi()`, `tikkunei_yomi()` -- additional daily study
- `hok_leyisrael()` -- Chok LeYisrael, links to collections
- `get_all_calendar_items()` -- aggregates all of the above; returns empty list if `SITE_SETTINGS["TORAH_SPECIFIC"]` is False
- `get_parasha()` -- queries `db.parshiot` for the next parasha by date and diaspora setting

### `user.py` -- User Account Management

- `delete_user_account(uid)` -- deletes user data across all MongoDB collections (sheets, notes, notifications, following, profiles, likes, history) and Django User object; marks user for CRM review first
- `merge_user_accounts(from_uid, into_uid)` -- moves all content ownership between accounts, optionally copies profile data, then deletes source account
- `generate_api_key(uid)` -- creates and stores a random API key
- `reset_all_api_keys()` -- regenerates all existing API keys

### `talmud.py` -- Daf/Section Conversion

- `section_to_daf(section, lang)` -- converts 0-based section index to daf string ("4b" or Hebrew equivalent with amud markers "." and ":")
- `daf_to_section(daf)` -- reverse: "4b" -> section number

### `chatbot.py` -- Encrypted User Token for Chatbot

- `build_chatbot_user_token(user_id, secret)` -- creates an AES-GCM encrypted, base64-encoded token containing a hashed user ID and expiration time (default 72 hours TTL)

### `domains_and_languages.py` -- Multi-Domain Language Routing

- `current_domain_lang(request)` -- determines if the current domain is pinned to a specific language using `settings.DOMAIN_MODULES`; returns None if ambiguous (e.g. localhost)
- `get_redirect_domain_for_language(request, target_lang)` -- gets the URL to redirect to for a language switch, preserving the current module (library/voices)
- `needs_domain_switch(request, target_domain)` -- checks if a redirect is actually needed (prevents loops)
- `get_cookie_domain(language)` -- finds common domain suffix for cookie sharing across modules (e.g. `.sefaria.org`)

### `testing_utils.py` -- Test Helpers for TOC Verification

- `get_all_toc_locations(title, toc)` -- recursively finds all category paths where a title appears in the Table of Contents
- `verify_title_existence_in_toc()` / `verify_existence_across_tocs()` -- asserts a title appears exactly once at the expected location

### `log.py` -- Deprecated Logging

Entirely commented out. Previously contained `CategoryFilter`, `ErrorTypeFilter`, and `SlackLogHandler` for sending errors to Slack. Replaced by structured logging (`structlog`).

### `views_utils.py` -- URL Query Parameter Helper

- `add_query_param(url, param, value)` -- appends a query parameter to a URL, preserving existing params

## Non-Obvious Patterns

- **Memoization**: Many Hebrew numeral functions (`heb_to_int`, `int_to_heb`, `decode_hebrew_numeral`, `encode_hebrew_numeral`, `sanitize`) use `@memoized` from `sefaria.system.decorators`. This is important since these are called very frequently during ref parsing.

- **`graceful_exception` decorator**: Used heavily in `calendars.py` to prevent any single calendar source from breaking the entire calendar response. Each calendar function is independently wrapped and returns `[]` on failure.

- **Hebrew numeral edge cases**: The `sanitize()` function handles the well-known cases where yud-heh (15) and yud-vav (16) must be replaced with tet-vav and tet-zayin to avoid spelling divine names. It also handles the 270/272/275 cases where letter ordering conventions differ.

- **`wrap_chars_with_overlaps`**: Handles wrapping character ranges in a string when ranges may overlap -- it dynamically adjusts start/end positions of subsequent ranges after each wrap to account for inserted characters. Used for adding markup to text segments.

- **`text_preview` builds bilingual preview dicts**: Returns `{'en': ..., 'he': ...}` by merging jagged English/Hebrew arrays, truncated to 80 characters.

- **Keyboard swap maps are used for search**: When a user accidentally types Hebrew text on an English keyboard (or vice versa), the swap maps let the search system try the alternative mapping.

## Relationships

- `hebrew.py` is imported throughout the model layer (especially by `Ref`, `Index`, address types, and schemas) for numeral encoding/decoding and language detection.
- `util.py` functions like `strip_tags`, `list_depth`, `flatten_jagged_array` are used by both model and view layers.
- `calendars.py` depends on `sefaria.model` (Ref, Topic, Term, library) and `sefaria.system.database` (direct MongoDB queries).
- `user.py` performs direct MongoDB operations via `sefaria.system.database.db` and also uses the Django `User` model.
- `domains_and_languages.py` reads from `settings.DOMAIN_MODULES` and is used by middleware and views for language/domain routing.
- `chatbot.py` is standalone -- only used to generate tokens for the external chatbot integration.
- `talmud.py` imports from `hebrew.py` for encoding daf numbers.
- `views_utils.py` is used by Django views that need to add redirect parameters to URLs.

## Common Tasks

**Convert an integer to a Hebrew numeral string:**
```python
from sefaria.utils.hebrew import encode_hebrew_numeral
encode_hebrew_numeral(5784)  # Returns Hebrew year string with gershayim
```

**Check if text is Hebrew:**
```python
from sefaria.utils.hebrew import has_hebrew, is_mostly_hebrew
has_hebrew("some text with Hebrew")
is_mostly_hebrew(some_string, len_to_check=300)
```

**Strip HTML tags from text content:**
```python
from sefaria.utils.util import strip_tags
plain_text = strip_tags(html_string)
```

**Get today's calendar items:**
```python
from sefaria.utils.calendars import get_todays_calendar_items
items = get_todays_calendar_items(diaspora=True, custom="sephardi")
```

**Convert between daf notation and section numbers:**
```python
from sefaria.utils.talmud import section_to_daf, daf_to_section
section_to_daf(5)    # "3b"
daf_to_section("3b") # 6
```

**Swap keyboard layout for mistyped search input:**
```python
from sefaria.utils.hebrew import swap_keyboards_for_string
swap_keyboards_for_string("akuo")  # Converts English keys to Hebrew letters
```
