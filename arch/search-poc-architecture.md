# Search Architecture

`static/js/SearchPOCPage.jsx` is a proof-of-concept combining full-text source search with dedicated entity search for topics, books, and authors. This document covers the design, open decisions, known gaps, and tech debt to address before production.

---

## Design

Two query paths run in parallel on every search:

1. **Source search** — `Sefaria.search` function, uses our elastic search endpoint for texts aside from Tanakh. For Tanakh, it uses the Dicta search for fuzzy matching.
2. **Entity search** — `/api/search-poc?q=<query>&type=<topic|author|book>`, fired once per tab. This endpoint queries the dedicated `topic` and `book` Elasticsearch indices built for the POC; its design is documented in the companion [entity-search-architecture.md](entity-search-architecture.md).

> **Note on history.** The POC originally fed the entity tabs from the autocomplete **Name API** (`/api/name/<query>?limit=50`), reusing the dropdown's existing result handling. That path hit the Name API limitations documented below, which is exactly what motivated the dedicated `topic`/`book` indices. The page has since been switched to `/api/search-poc`; the Name API issues are retained here as the rationale for that move, not as a description of current behavior.

Each ES hit is normalized into the `SearchTopic` shape the existing result components expect, using its title, Hebrew title, type, and derived category. This avoids building new card UI.

Because the entity documents returned by `/api/search-poc` are self-contained (they already carry titles, descriptions, and `numSources`), the per-card hydration the Name API path required is unnecessary — there is no second detail request per card.

---

## Why we moved off the Name API

These are the Name API limitations the POC ran into; they are the motivation for the dedicated entity indices (the companion doc). They no longer describe the page's live data path.

### `ref` type conflates books and section-level refs

The API returns both index-level refs (whole books) and section-level refs (e.g. "Genesis 3") under the single type `ref`. This is confusing — the tab intends to show Books, not arbitrary refs.

**Recommended data refactor (post-POC):** Split the `ref` type into `index` (book-level) and `ref` (section-level) in the Name API. This makes intent explicit and removes the need for the confirmation round-trip. (i.e. "Covenant and Conversation, Genesis 3" currently passes through as a book, returned with type `ref`)

We have FE utilities in `Sefaria.js` for ref parsing that can help bridge the gap in the interim.

### Fuzzy matching produces noisy results
- Name API does fuzzy matching, sometimes low confidence results

### Source ordering is puzzling
- With the query תהילה , a source from Talmud quoting Psalms appears as the first result, before the verse from Psalms itself
- Rank should be more intuitive, and ordering should be chronological perhaps - with books collapsible by category. We have all of this data. 

### Language matching

The Name API returns results across languages. "Mos" can match Spanish titles, for example. Open questions:
- Should we filter to a single language by default?
- Should the user be able to control language in results?
- How do we handle queries that legitimately cross languages (transliterated Hebrew, etc.)?

---

## When to Call the Entity Search

Options being considered:

- **On every search** (current POC behavior) — all three entity tabs (`topic`, `author`, `book`) are queried in parallel alongside the source search, so results are ready before the user switches tabs.
- **Only on tab switch** — saves requests but delays results when the user navigates away from Sources.

The `TabView` component is currently managing this implicitly. Our inclination is to call in the background before an explicit tab switch, consistent with the autocomplete pattern, but there is no strong consensus here. **Feedback welcome.**

---

## Open Questions

- **Empty results** — what should each tab show when there are no matches? Fall through to another tab? Show a zero-state message?
- **Categorical collapsing** — should similar topic clusters be collapsed?
- **Language filtering** — expose a UI control to restrict results to a single language?
- **Topic descriptions** — now carried directly on the `/api/search-poc` hit (no per-card hydration). The open question is whether the indexed snapshot is fresh/long enough, or whether descriptions still want batching or pre-caching for some cases.
- **Ranking** - is a more intuitive ranking of relevant matches (a bigger, data/API overhaul) part of this work?

---

## Tech Debt

### `TabView`
`TabView` is usable but clunky — tab switching UX is rough in practice. This is worth a refactor, either as part of this project or alongside it.

### Filterable list
The filterable list component could also use a cleanup pass.

### Search results "page" component
The existing search results page (`SearchPage` or equivalent) is a large shared component — it also powers Voices and comes with its own filter infrastructure. The POC works around this rather than integrating with it.

Production integration requires:
- Assessing how to extend or override the component's behavior for this feature.
- Ensuring changes don't introduce regressions in the Voices flow.
- Deciding whether to modify the shared component or extract a lighter-weight version.

This is a significant body of work to scope before committing to an approach.
