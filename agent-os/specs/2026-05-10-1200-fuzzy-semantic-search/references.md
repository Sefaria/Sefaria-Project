# Fuzzy / Semantic Search POC — References

## Critical files to read before implementing

| File | Why |
|------|-----|
| `sefaria/helper/linker/disambiguator.py` | LLM call pattern to replicate: `ChatAnthropic`, `ChatPromptTemplate`, `@traceable`, `_get_llm()` factory |
| `api/views.py` | API view pattern: `View` subclass + `jsonResponse` |
| `sefaria/urls_shared.py:160-162` | Where to insert the new URL |
| `static/js/SearchResultList.jsx` | Component to modify: class structure, constructor, render |
| `static/js/SearchTextResult.jsx` | Shape reference for `SemanticSearchResult` component |
| `static/js/sefaria/search.js` | Existing query flow (sefariaQuery, dictaQuery) for context |
| `sefaria/settings.py` | Where to add `CHROMA_DB_PATH` |
| `requirements.txt` | Where to add new packages |

## Key functions / classes

| Symbol | File | Notes |
|--------|------|-------|
| `Ref(ref_str).text("en").as_string()` | `sefaria/model/text.py` | Fetch plain text for a ref |
| `Ref(ref_str).he_normal()` | `sefaria/model/text.py` | Hebrew display string |
| `library.all_titles_in_toc()` | `sefaria/model/__init__.py` | All book titles for indexing |
| `jsonResponse(data, status=200)` | `sefaria/client/util.py` | Standard JSON response |
| `ChatAnthropic` | `langchain_anthropic` | LLM client |
| `ChatPromptTemplate.from_messages` | `langchain_core.prompts` | Prompt builder |
| `traceable` | `langsmith` | LangSmith tracing decorator |
| `GoogleGenerativeAIEmbeddings` | `langchain_google_genai` | Gemini embedding client |
| `chromadb.PersistentClient` | `chromadb` | Vector store client |

## External docs

- ChromaDB Python client: https://docs.trychroma.com/reference/py-client
- LangChain Google GenAI embeddings: https://python.langchain.com/docs/integrations/text_embedding/google_generative_ai/
- Gemini embedding models: `models/text-embedding-004` (stable), `models/gemini-embedding-exp-03-07` (experimental)
- Claude Haiku 4.5 model ID: `claude-haiku-4-5-20251001`
