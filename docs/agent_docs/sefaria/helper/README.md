# Sefaria Helper Layer

> Source: `sefaria/helper/`

## Purpose

The helper layer sits between raw models and the view/API layer. It contains the "business logic" — text manipulation, schema editing, topic serving, linking orchestration, LLM integrations, CRM connectors. When an operation is too complex for a single model method but shouldn't live in a view, it lives here.

## Navigation

| Doc                                                | Covers                                                                                 | Load when...                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [text_and_schema.md](./text_and_schema.md)         | `text.py`, `schema.py`, `link.py`, `normalization.py`, `category.py`, `legacy_ref.py`  | Editing text structure, resizing schemas, autolinkers, text normalization, category operations                   |
| [linker_and_llm.md](./linker_and_llm.md)           | `linker/*.py`, `llm/*.py`, `marked_up_text_chunk_generator.py`                         | Find-refs API, LLM-powered disambiguation, sheet scoring, topic prompt generation                                |
| [topic_and_community.md](./topic_and_community.md) | `topic.py`, `community_page.py`, `descriptions.py`, `trend_manager.py`                 | Topic page API, community page (parashah/calendar/featured), author data import, user engagement trends          |
| [crm.md](./crm.md)                                 | `crm/*.py`                                                                             | Salesforce/NationBuilder integration, chatbot opt-in webhook                                                     |
| [utilities.md](./utilities.md)                     | `search.py`, `slack/`, `texts/`, `file.py`, `webpages.py`, `linker_index_converter.py` | ES query building, Slack webhooks, file/image utilities, URL normalization, legacy Index → linker term migration |
| (this page, below)                                 | `reader_choice.py`                                                                     | The legacy-vs-new reader choice: `reader_version` cookie, opt-in audience, kill switch                           |

## File Layout

```
helper/
├── text.py                          # Text utilities (resize, spell, find-replace, Workflowy)
├── schema.py                        # Schema tree manipulation
├── link.py                          # Autolinker abstract interface
├── normalization.py                 # Text normalization pipeline (composable)
├── category.py                      # Category move/rename with cascades
├── legacy_ref.py                    # Legacy ref mapping
├── topic.py                         # Topic page API helper (~1500 lines)
├── community_page.py                # Google Sheets-backed community content
├── descriptions.py                  # Author data import
├── trend_manager.py                 # User engagement traits
├── search.py                        # Elasticsearch query builder
├── marked_up_text_chunk_generator.py  # Batch MUTC generation
├── linker_index_converter.py        # Index → linker term migration
├── linker/
│   ├── linker.py                    # find-refs API
│   ├── disambiguator.py             # LLM-powered ref disambiguation (~1800 lines)
│   └── tasks.py                     # Celery tasks for linking pipeline
├── llm/
│   ├── topic_prompt.py              # LLM topic prompt generation
│   ├── sheet_scoring*.py            # Sheet quality scoring
│   └── tasks/                       # Celery wrappers
├── crm/
│   ├── crm_mediator.py              # Facade
│   ├── crm_factory.py               # Factory by CRM_TYPE
│   ├── crm_connection_manager.py    # Abstract base
│   ├── salesforce.py                # Primary CRM
│   ├── nationbuilder.py             # Deprecated (routes to Dummy)
│   ├── dummy_crm.py                 # No-op
│   ├── crm_info_store.py            # MongoDB storage of CRM IDs
│   └── tasks.py                     # Chatbot opt-in webhook
├── slack/
│   └── send_message.py              # Slack webhook
├── texts/
│   └── tasks.py                     # Text Celery tasks
├── reader_choice.py                 # Legacy vs new reader choice (cookie, audience, kill switch, middleware)
├── file.py                          # Image resize/scrape
└── webpages.py                      # URL normalization
```

## reader_choice.py

Owns the `reader_version` cookie that nginx routes page requests by when the Helm chart runs `nodejs.mode: optin` (both readers deployed; Django gets `settings.READER_OPTIN`). In `legacy` mode `available()` is False and everything here is inert.

- `available()` -- `READER_OPTIN`; `on_library(request)` -- the request's django_hosts host is the Library (the cookie is never set or cleared on Voices responses).
- `audience()` -- remote config `feature.reader.optin.audience`: `"all"` (every signed-in user) or anything else = `"staff"`. `next_disabled()` -- the kill switch, remote config `feature.reader.next.disabled`. `may_use_next(user)` combines them. Remote config is process-local, so a change reaches other pods only after they restart.
- The choice is stored at `profile.settings["reader_version"]` (`"next"` / `"classic"`), written through `/api/profile` or `/api/reader-choice`; `apply_cookie(response, request, choice)` sets or clears the cookie on the shared cookie domain.
- `ReaderChoiceMiddleware` -- see [middleware_and_request.md](../system/middleware_and_request.md).

## Common Patterns

- **Text mutations use `sefaria.tracker`**: Helpers call `tracker.modify_text()` rather than `Version.save()` directly.
- **Schema edits cascade**: `schema.cascade()` is the key function for maintaining referential integrity across ~15 collections when refs change.
- **LLM work is async**: LLM calls go through Celery chains so HTTP requests don't block.
- **Linker disambiguation is multi-stage**: Dicta Parallels → Sefaria Search → Claude/GPT reasoning.
- **CRM uses mediator + factory**: Swap CRM backends via `CRM_TYPE` setting without touching callers.
