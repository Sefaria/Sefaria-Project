# Search Architecture

`static/js/SearchPOCPage.jsx` is a proof-of-concept combining full-text source search with name-lookup results for topics, books, and authors. This document covers the design, open decisions, known gaps, and tech debt to address before production.

---

## Design

Two query paths run in parallel on every search:

1. **Source search** — `Sefaria.search` function, uses our elastic search endpoint for texts aside from Tanakh. For Tanakh, it uses the Dicta search for fuzzy matching.
2. **Name API** — `/api/name/<query>?limit=50`. Returns `completion_objects` covering Authors, Books, and Topics.

The autocomplete dropdown already calls the Name API and handles the full result set — everything except sources. The POC extends that pattern to a full results page.

Results are split by `completion_object.type`:

| Name API type   | Maps to tab |
|-----------------|-------------|
| `AuthorTopic`   | Authors     |
| `ref`           | Books       |
| `Topic`, `PersonTopic` | Topics |

Each completion object is normalized into the `SearchTopic` shape the existing result components expect, using its title, Hebrew title, type, key, and derived category. This avoids building new card UI.

Tab hydration is lazy — detail requests (`getTopic`, `getIndexDetails`) fire only when the user opens that tab, at most once per query, with bounded concurrency to avoid burst API calls.

---

## Name API: Design Issues

### `ref` type conflates books and section-level refs

The API returns both index-level refs (whole books) and section-level refs (e.g. "Genesis 3") under the single type `ref`. This is confusing — the tab intends to show Books, not arbitrary refs.

**Recommended data refactor (post-POC):** Split the `ref` type into `index` (book-level) and `ref` (section-level) in the Name API. This makes intent explicit and removes the need for the confirmation round-trip. (i.e. "Covenant and Conversation, Genesis 3" currently passes through as a book, returned with type `ref`)  Another option is to simply use a filter on the front-end that uses ref parsing functions in sefaria.js to remove duplicate books (for example, if there are two refs "Covenant and Conversation, Genesis 3" and "Covenant and Conversation, Genesis 2:4", we would use the ref parsing in sefaria.js to know that these two have the same book and we would only display one book).

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

## When to Call the Name API

Options being considered:

- **On every search** (current POC behavior) — fast, the autocomplete already does this at keystroke speed, so latency is not a concern.
- **Only on tab switch** — saves requests but delays results when the user navigates away from Sources.

The `TabView` component is currently managing this implicitly. Our inclination is to call in the background before an explicit tab switch, consistent with the autocomplete pattern, but there is no strong consensus here. **Feedback welcome.**

---

## Open Questions

- **Empty results** — what should each tab show when there are no matches? Fall through to another tab? Show a zero-state message?
- **Categorical collapsing** — should similar topic clusters be collapsed?
- **Language filtering** — expose a UI control to restrict results to a single language?
- **Topic descriptions** — currently fetched per card on hydration. Worth batching via API or pre-caching?  (Downside to pre-caching is this could significantly slow down page load.  We should probably create a new API to batch all of the relevant topics and get back their descriptions)
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
