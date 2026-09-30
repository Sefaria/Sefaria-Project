# WebPage & WebSite
> Source: `sefaria/model/webpage.py`

## Purpose
Tracks external web pages that reference Sefaria texts (discovered via the Sefaria Linker installed on partner sites). Stores URL, title, description, and the Sefaria refs found on each page. Also manages `WebSite` records that represent known partner domains with configuration for URL normalization, title branding cleanup, and whitelisting.

## Key Classes

### WebPage
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `webpages`
- **Role**: Represents a single external web page that references one or more Sefaria texts. Created/updated when the Sefaria Linker reports a page visit.
- **Key fields**: `url`, `title`, `refs` (list of Ref strings found on page), `expandedRefs` (segment-level expansion, computed on save), `linkerHits` (visit counter), `lastUpdated`, `description`, `authors`, `articleSource`, `type` (only valid value: `"article"`), `whitelisted`
- **Derived attributes** (set in `_set_derived_attributes`, not persisted): `domain`, `_site_data`, `site_name`, `favicon`
- **Key methods**:
  - `load(url_or_query)` -- Accepts a plain URL string (auto-normalizes it) or a standard Mongo query dict.
  - `add_or_update_from_linker(webpage_contents, add_hit=True)` -- **Static. Primary entry point for linker data.** Loads or creates a WebPage, normalizes, checks exclusions, increments hits, saves. Returns `("saved", webpage)` or `("excluded", webpage_or_none)`.
  - `should_be_excluded()` -- Checks if the page has no refs, a URL over 1000 bytes, or matches excluded URL/title patterns. Pages with URLs over 1000 bytes are moved to `webpages_long_urls` collection (Mongo index limit).
  - `client_contents()` -- Returns a dict suitable for API responses, with derived fields (`domain`, `siteName`, `favicon`) added and `lastUpdated` removed.
  - `clean_title(title, site_data, site_name)` -- Static. Strips site branding from titles using separator patterns (e.g., "Article Title | Site Name" becomes "Article Title"). Respects `initial_title_branding` flag for sites that put the brand first.
  - `get_website(dict_only=False)` -- Returns the corresponding `WebSite` record. If `dict_only=True`, uses the in-memory cache instead of a DB load.

### WebPageSet
- **Inherits**: `AbstractMongoSet`
- **Collection**: `webpages`
- **Role**: Standard set class for querying multiple WebPages.

### WebSite
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `websites`
- **Role**: Configuration record for a known external website/domain. Controls URL normalization rules, title branding removal, whitelisting, and URL exclusion patterns.
- **Key fields**: `name`, `domains` (list of domain strings), `is_whitelisted`, `bad_urls` (regex patterns for pages to exclude), `normalization_rules`, `title_branding`, `initial_title_branding` (bool -- brand appears at start of title), `linker_installed`, `num_webpages`, `exclude_from_tracking`, `whitelist_selectors`
- **Key methods**:
  - `get_num_webpages()` -- Lazily computes and caches the count of webpages matching this site's domains.
- **Note**: Implements `__hash__` and `__eq__` based on `(name, domains[0])`, so WebSite instances can be used as dict keys / set members.

### WebSiteSet
- **Inherits**: `AbstractMongoSet`
- **Collection**: `websites`

## Non-Obvious Patterns

- **URL normalization is critical**: URLs are normalized before load/save via `sefaria.helper.webpages.normalize_url`. This applies global rules (remove www, use https, strip hash/utm params) plus per-site rules from the `websites` collection. Two URLs that look different may normalize to the same value.
- **Whitelisted-only in API responses**: `_get_webpages_for_segment_refs()` silently skips non-whitelisted pages (`if not webpage.whitelisted: continue`). Only pages from whitelisted WebSites appear in the API.
- **expandedRefs vs refs**: `refs` stores the original (possibly range-level) refs found on the page. `expandedRefs` is the segment-level expansion, computed during `_normalize()` on save. Queries for "which pages reference this segment" use the `expandedRefs` field with the `expandedRefs_1` index.
- **Deduplication by content**: In `_get_webpages_for_segment_refs`, pages are deduplicated by `title + sorted(refs)` key, keeping the most recently updated version. This handles multiple URLs with identical content.
- **Freshness filter**: The webpages API only returns pages updated within the last 365 days.
- **Sanitization with bleach**: All string attributes (except `url`) are sanitized via `bleach.clean` on save.
- **Long URL handling**: URLs over 1000 bytes are moved to a separate `webpages_long_urls` collection because Mongo cannot index fields that large.

## Relationships

- **WebPage -> WebSite**: Each WebPage derives its site data from the `websites` collection via domain matching (helper function `site_data_for_domain`). A WebPage's `domain` is looked up against `WebSite.domains`.
- **WebPage -> Ref**: `refs` and `expandedRefs` store string references to Sefaria texts. These are validated/normalized using `text.Ref`.
- **Helper module**: URL normalization, domain extraction, site data lookup, and website caching live in `sefaria/helper/webpages.py`, not in the model itself.
- **Linker integration**: The Sefaria Linker (JavaScript widget on partner sites) calls `add_or_update_from_linker()` to report pages.

## Common Tasks

### Look up webpages for a Sefaria ref
```python
from sefaria.model.webpage import get_webpages_for_ref
results = get_webpages_for_ref("Genesis 1:1")  # segment-level ref required
# Returns list of client_contents dicts with anchorRef/anchorRefExpanded
```

### Add or update a webpage from linker data
```python
from sefaria.model.webpage import WebPage
status, page = WebPage.add_or_update_from_linker({
    "url": "https://example.com/article",
    "title": "My Article",
    "refs": ["Genesis 1:1", "Exodus 2:3"],
    "description": "An article about Torah"
})
# status is "saved" or "excluded"
```

### Load a webpage by URL
```python
page = WebPage().load("https://example.com/article")  # auto-normalizes URL
```

### Check if a site is whitelisted
```python
site = WebSite().load({"domains": "example.com"})
if site and site.is_whitelisted:
    ...
```

### Maintenance functions (module-level)
- `dedupe_webpages(webpages, test=True)` -- Merge pages whose URLs normalize to the same value.
- `dedupe_identical_urls(test=True)` -- Merge pages with literally identical URLs.
- `clean_webpages(test=True)` -- Delete pages matching exclusion patterns or with empty refs.
- `find_webpages_without_websites(webpages, ...)` -- Find pages from unknown domains; optionally create new WebSites or delete stale pages.
- `find_sites_that_may_have_removed_linker(...)` -- Alert on whitelisted sites with no recent linker activity.
