# Fuzzy / Semantic Search POC — Shape

## Architecture

```
INDEX TIME (offline script)
  Library refs
    → Claude Haiku 4.5: generate 8-15 keyphrases per segment
    → Claude Haiku 4.5: rate each phrase 1-5
    → filter rated ≥ 3
    → Gemini text-embedding-004: embed filtered phrases
    → ChromaDB (cosine): upsert {id=ref::phrase, embedding, metadata={ref, phrase}}

QUERY TIME (API endpoint)
  GET /api/fuzzy-search?q=<query>
    → Claude Haiku 4.5: expand query to 3-6 phrases
    → Gemini text-embedding-004: embed each phrase
    → ChromaDB: top-10 results per phrase
    → union by ref (keep best cosine score)
    → fetch text snippet for each ref
    → return [{ref, heRef, snippet, score}]

FRONTEND
  SearchResultList.componentDidUpdate (when props.query changes, text tab)
    → fetch /api/fuzzy-search?q=...
    → setState({ semanticResults })
    → render <SemanticSearchResult> items in "Semantic Matches" section
```

## Data flow

```
User types query
       │
       ├─► /api/search-wrapper/es8  (existing Elasticsearch path, unchanged)
       │         └─► SearchResultList renders hits as before
       │
       └─► /api/fuzzy-search?q=...  (NEW)
                 ├─► Claude Haiku expands → 3-6 phrases
                 ├─► Gemini embeds each phrase
                 ├─► ChromaDB: top-10 per phrase, union by ref
                 └─► [{ref, heRef, snippet, score}]
                           └─► SemanticSearchResult items below main results
```

## Files changed

| File | Change |
|------|--------|
| `requirements.txt` | Add `chromadb>=0.6.0`, `langchain-google-genai>=2.0.0` |
| `sefaria/settings.py` | Add `CHROMA_DB_PATH` |
| `sefaria/local_settings_example.py` | Add `CHROMA_DB_PATH` example |
| `sefaria/helper/fuzzy_search_indexer.py` | NEW — index-time pipeline |
| `scripts/index_fuzzy_search.py` | NEW — CLI indexing runner |
| `sefaria/helper/fuzzy_search.py` | NEW — query-time pipeline |
| `api/views.py` | Add `FuzzySearch` view |
| `sefaria/urls_shared.py` | Wire `api/fuzzy-search` |
| `static/js/SemanticSearchResult.jsx` | NEW — single result component |
| `static/js/SearchResultList.jsx` | Add fetch + semantic section render |

## ChromaDB schema

Collection: `sefaria_keyphrases`, distance: cosine

| Field | Value |
|-------|-------|
| id | `"{ref}::{phrase[:60]}"` |
| embedding | 768-dim Gemini vector |
| metadata.ref | Sefaria ref string (e.g. `"Genesis 1.1"`) |
| metadata.phrase | The keyphrase used to generate this embedding |
