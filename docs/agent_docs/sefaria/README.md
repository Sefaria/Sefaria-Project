# Sefaria Backend Package
> Source: `sefaria/`

## Purpose
The core backend Python package. Contains the model layer (ORM over MongoDB), the web views and URL routing, business logic for sheets/search/tracking/export, helper modules, and infrastructure (database, caching, middleware, multiserver coordination, Varnish integration). This is where nearly all Python-side business logic lives.

## Navigation

### Model Layer
Covered separately in [`../model/`](../model/README.md) — the MongoDB ORM, text models (Index, Version, Ref, TextChunk, Library), schema trees, topics, links, users, etc. **Start there for any data-model work.**

### Views & Routing
| Doc | Covers | Load when... |
|-----|--------|-------------|
| [views_and_routing.md](./views_and_routing.md) | `views.py`, `urls*.py`, `hosts.py` | Adding/modifying Django views, URL patterns, subdomain routing |

### Business Logic
| Doc | Covers | Load when... |
|-----|--------|-------------|
| [sheets.md](./sheets.md) | `sheets.py` | Working with source sheets (CRUD, topics, collections, publishing) |
| [search.md](./search.md) | `search.py` | Working with Elasticsearch indexing of texts and sheets |
| [tracker_and_history.md](./tracker_and_history.md) | `tracker.py`, `history.py` | Text mutations, change logging, activity feeds, diff reconstruction |
| [config_and_utilities.md](./config_and_utilities.md) | `settings.py`, `forms.py`, `export.py`, `recommendation_engine.py`, `pagesheetrank.py`, `stats.py`, `clean.py`, `sitemap.py`, `image_generator.py`, `google_storage_manager.py`, `settings_utils.py`, `decorators.py` | Config, forms, exports, analytics, maintenance, media |

### Helper Layer
Business logic between models and views. See [`helper/README.md`](./helper/README.md) for the full navigation.

### System Infrastructure
Database, caching, middleware, multi-server coordination, Varnish. See [`system/README.md`](./system/README.md).

### Utility Packages
| Doc | Covers | Load when... |
|-----|--------|-------------|
| [utils.md](./utils.md) | `sefaria/utils/` | Hebrew numerals, dates, user account utils, time/calendar helpers |
| [datatype.md](./datatype.md) | `sefaria/datatype/` | The `JaggedArray` data structure — core to text representation |
| [small_packages.md](./small_packages.md) | `client/`, `gauth/`, `celery_setup/`, `constants/`, `site/`, `sefaria_tasks_interace/` | Internal HTTP client, Google OAuth, Celery config, shared constants, multi-site routing, async task interfaces |

## Package Layout

```
sefaria/
├── model/              # ORM + domain models (see agent_docs/model/)
├── helper/             # Business logic (see agent_docs/sefaria/helper/)
├── system/             # Infrastructure (see agent_docs/sefaria/system/)
├── utils/              # General utilities
├── datatype/           # JaggedArray
├── client/             # Internal HTTP client
├── gauth/              # Google OAuth
├── celery_setup/       # Celery task queue config
├── constants/          # Shared constants
├── site/               # Multi-site URL wrapper
├── sefaria_tasks_interace/  # Async task interfaces (note: directory typo)
├── views.py            # Main Django views (~1800 lines)
├── urls*.py            # URL routing (library + sheets subdomains)
├── hosts.py            # django-hosts config
├── sheets.py           # Source sheet backend (~1400 lines)
├── search.py           # Elasticsearch integration (~1200 lines)
├── tracker.py          # Text mutation gateway
├── history.py          # Activity feed + diff reconstruction
├── settings.py         # Django settings
├── export.py           # Text export (JSON/CSV/TXT)
├── recommendation_engine.py  # Related content
├── pagesheetrank.py    # PageRank scoring
├── stats.py            # Sheet statistics
├── sitemap.py          # XML sitemap generation
├── clean.py            # DB maintenance
├── image_generator.py  # Social media card PNGs
├── google_storage_manager.py  # GCP Storage
├── forms.py            # Django auth forms
├── decorators.py       # Auth decorators
└── [other small files]
```

## Common Patterns

- **Singleton `library`**: Imported as `from sefaria.model import library`. Lazy-built title maps, TOC tree, autocompleters.
- **Text mutations go through `tracker`**: Don't modify `Version` directly — use `tracker.modify_text()` so history + Varnish + search stay in sync.
- **Dependency cascades are wired in `sefaria/model/dependencies.py`**: A single Index title change fires 14 callbacks.
- **Multiserver coordination via Redis**: After DB changes, `server_coordinator.publish_event()` fires so all app servers stay in sync.
- **Varnish invalidation is tied to model changes**: See `sefaria/system/varnish/wrapper.py`.
