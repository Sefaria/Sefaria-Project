# Fuzzy / Semantic Search POC — Standards

## Python conventions

- Follow existing patterns in `sefaria/helper/linker/disambiguator.py`
- Use `@traceable(run_type="llm", name="...")` from `langsmith` on all LLM calls
- Use `ChatAnthropic` + `ChatPromptTemplate` from `langchain_anthropic` / `langchain_core`
- Use module-level `logger = logging.getLogger(__name__)` for logging
- Use `logger.warning()` for recoverable errors, never raise from inside `index_ref()` or `fuzzy_search()`
- Lazy-import `langchain_google_genai` inside functions (not at module level) to avoid import errors when the package isn't installed

## API conventions

- Follow `api/views.py:Text` pattern: subclass `django.views.View`, use `jsonResponse()` from `sefaria.client.util`
- Do not use DRF's `APIView`
- Return `{"error": "..."}` with appropriate status codes (400 for bad input, 500 for unexpected)
- No `@csrf_exempt` needed for GET-only endpoints

## Embedding model

- Use `models/text-embedding-004` (stable) via `GoogleGenerativeAIEmbeddings`
- Do **not** use the experimental `models/gemini-embedding-exp-03-07` unless explicitly confirmed

## Environment variables

| Var | Required | Default |
|-----|----------|---------|
| `ANTHROPIC_API_KEY` | Yes (indexing + query) | — |
| `GOOGLE_API_KEY` | Yes (indexing + query) | — |
| `CHROMA_DB_PATH` | Via settings | `/tmp/sefaria_chroma` |
| `ANTHROPIC_HAIKU_MODEL` | No | `claude-haiku-4-5-20251001` |

## Frontend conventions

- `SearchResultList` is a class component using `react-class`; add state in the constructor, use `componentDidUpdate` for side effects
- Use native `fetch()` (not jQuery `$.ajax`) for the new `/api/fuzzy-search` call
- `SemanticSearchResult` is a functional component (no class needed)
- Use `<InterfaceText>` wrapper for any user-visible string labels
- Do not add PropTypes to `SemanticSearchResult` for this POC

## ChromaDB

- Use `PersistentClient` (not ephemeral `Client`)
- Collection name: `sefaria_keyphrases`
- Distance metric: cosine (`{"hnsw:space": "cosine"}`)
- IDs must be unique strings; format: `"{ref}::{phrase[:60]}"`
- Use `collection.upsert()` (idempotent re-indexing)
