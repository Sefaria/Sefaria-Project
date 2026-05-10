# Fuzzy / Semantic Search POC — Plan

## Context

Sefaria's current Elasticsearch `match_phrase` search has no tolerance for typos, paraphrasing, or conceptual synonyms. A user searching "joy" won't find passages indexed as "simcha"; "brit milla" (misspelled) finds nothing. This POC adds a semantic search layer using LLM keyphrase generation + vector embeddings stored in ChromaDB, surfaced as a separate "Semantic Matches" section in the search results UI.

---

## Tasks

### 1. Dependencies + settings

In `requirements.txt` (after existing langchain lines):
```
chromadb>=0.6.0
langchain-google-genai>=2.0.0
```

In `sefaria/settings.py`, add near the bottom:
```python
CHROMA_DB_PATH = os.path.join(SEFARIA_DATA_PATH, "chroma") if 'SEFARIA_DATA_PATH' in dir() else "/tmp/sefaria_chroma"
```

In `sefaria/local_settings_example.py`:
```python
CHROMA_DB_PATH = "/path/to/chroma"
```

---

### 2. `sefaria/helper/fuzzy_search_indexer.py` (NEW)

Core functions:
- `_get_haiku()` → `ChatAnthropic` with `claude-haiku-4-5-20251001`
- `get_chroma_collection()` → persistent ChromaDB collection `sefaria_keyphrases` with cosine distance
- `_generate_keyphrases(text)` → `@traceable` LLM call: list 8-15 search phrases a user might type
- `_rate_keyphrases(text, phrases)` → `@traceable` LLM call: rate each phrase 1-5, return JSON array
- `index_ref(ref_str, collection)` → fetch en+he text, generate keyphrases, filter rated ≥ 3, embed with Gemini `models/text-embedding-004`, upsert to ChromaDB
- `index_refs(refs, batch_size=50)` → loop with progress logging

---

### 3. `scripts/index_fuzzy_search.py` (NEW)

CLI script: walks the library, collects segment refs (up to `--limit`), optionally filtered by `--category`, then calls `index_refs()`.

Run via: `python scripts/index_fuzzy_search.py --limit 100 --category Tanakh`

---

### 4. `sefaria/helper/fuzzy_search.py` (NEW)

Core function `fuzzy_search(query, n_results=20)`:
1. `_expand_query(query)` → `@traceable` Haiku call: list 3-6 phrases capturing query intent; prepend original query
2. Embed each phrase with Gemini `models/text-embedding-004`
3. Query ChromaDB top-10 per phrase
4. Union by ref, keep highest cosine score
5. Fetch `oref.text("en").as_string()[:250]` snippet for each ref
6. Return `[{ref, heRef, snippet, score}]` sorted by score desc

---

### 5. API endpoint

In `api/views.py`, add `FuzzySearch(View)` class with `get()` method:
- reads `?q=` param, calls `fuzzy_search()`, returns `jsonResponse({"results": [...]})`
- returns 400 if `q` is missing, 500 on unexpected error

In `sefaria/urls_shared.py`, after the `api/search-wrapper` paths (~line 161):
```python
path('api/fuzzy-search', api_views.FuzzySearch.as_view()),
```

---

### 6. `static/js/SemanticSearchResult.jsx` (NEW)

Simple functional component: renders `<a href="/{ref}"><b>{heRef}</b></a>` + snippet paragraph.

---

### 7. Wire into `SearchResultList.jsx`

- Add `semanticResults: [], semanticLoading: false` to constructor state
- Add `componentDidUpdate` to fetch `/api/fuzzy-search?q=...` when `props.query` changes (text tab only)
- Render a `semanticSection` div with header "Semantic Matches" above the `searchResultList` div when results exist

---

## Verification

1. `python scripts/index_fuzzy_search.py --limit 50 --category Tanakh` — logs progress, ChromaDB grows
2. `curl "http://localhost:8000/api/fuzzy-search?q=joy"` — returns refs to joy/simcha passages
3. `curl "http://localhost:8000/api/fuzzy-search?q=brit+milla"` — returns circumcision passages despite typo
4. Frontend `/search?q=joy&tab=text` — "Semantic Matches" section appears below main results
5. Empty ChromaDB → API returns `{"results": []}` without error
