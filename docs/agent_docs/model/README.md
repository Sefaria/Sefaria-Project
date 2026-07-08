# Sefaria Model Layer
> Source: `sefaria/model/`

## Architecture Overview

The model layer is a custom MongoDB ORM built on `AbstractMongoRecord` (see [abstract.md](./abstract.md)). Every model class maps to a Mongo collection via class attributes (`collection`, `required_attrs`, `optional_attrs`). The save lifecycle is: `_normalize()` → `_validate()` → `_sanitize()` → `_pre_save()` → write → `notify()`.

Cross-model side effects are wired through a pub/sub system: `subscribe()` and `notify()` in `abstract.py`, with all subscriptions registered in `dependencies.py` (see [dependencies.md](./dependencies.md)). These fire **synchronously** during save/delete — there is no async queue.

The `text.py` file is the gravitational center: it defines Index, Version, Ref, TextChunk, and the Library singleton. Most other models relate back to it. The `schema.py` file defines the tree-node structure representing how texts are organized.

Official API documentation: https://developers.sefaria.org/docs/welcome

## Key Concepts

| Concept | What it is | Defined in |
|---------|-----------|------------|
| **Ref** | Immutable reference to a text passage (e.g., "Genesis 1:1"). Metaclass-cached (LRU ~60k). | [text.md](./text.md) |
| **Index** | Represents a book/text in the library. Has a schema tree of nodes defining its structure. | [text.md](./text.md) |
| **Version** | A specific translation or edition of an Index's text. Collection: `texts`. | [text.md](./text.md) |
| **TextChunk** | Retrieves actual text content for a Ref + language/version combo. Can merge multiple Versions transparently. | [text.md](./text.md) |
| **Library** | Singleton managing all Indexes, title maps, TOC tree, and autocompleters. Three-stage lazy init. | [text.md](./text.md) |
| **Schema nodes** | Tree structure defining how texts are organized (chapters, sections, etc.). JaggedArrayNode is the most common leaf. | [schema.md](./schema.md) |
| **Link** | Bidirectional connection between two Refs (commentary, parallel, etc.). | [link.md](./link.md) |
| **Topic** | Knowledge graph node (person, concept, text). Connected via IntraTopicLink and RefTopicLink. | [topic.md](./topic.md) |

## Navigation Table

Use this to find the right doc for your task:

### Foundation (read these first for any model work)
| Doc | Source | Load when... |
|-----|--------|-------------|
| [abstract.md](./abstract.md) | `abstract.py` | Working on any model class, ORM base, lifecycle hooks, or the notification system |
| [schema.md](./schema.md) | `schema.py` | Working with schema trees, node types, address types, Terms, or Index structure |
| [text.md](./text.md) | `text.py` | Working with Index, Version, Ref, TextChunk, Library, or any text retrieval |
| [dependencies.md](./dependencies.md) | `dependencies.py` | Understanding cascading side effects between models |

### Core Domain Models
| Doc | Source | Load when... |
|-----|--------|-------------|
| [category.md](./category.md) | `category.py` | Working with text categories, the TOC tree, or category hierarchy |
| [lexicon.md](./lexicon.md) | `lexicon.py` | Working with dictionaries, word lookups, or lexicon entries |
| [link.md](./link.md) | `link.py` | Working with cross-references between texts |
| [topic.md](./topic.md) | `topic.py` | Working with topics, topic links, author topics, or the knowledge graph |
| [user_profile.md](./user_profile.md) | `user_profile.py` | Working with user data, reading history, or profiles |
| [version_state.md](./version_state.md) | `version_state.py` | Working with text completion tracking or availability data |

### Secondary Models
| Doc | Source | Load when... |
|-----|--------|-------------|
| [collection.md](./collection.md) | `collection.py` | Working with curated sheet collections |
| [notification.md](./notification.md) | `notification.py` | Working with user or global notifications |
| [webpage.md](./webpage.md) | `webpage.py` | Working with external web content linking |
| [garden.md](./garden.md) | `garden.py` | Working with data visualizations |
| [marked_up_text_chunk.md](./marked_up_text_chunk.md) | `marked_up_text_chunk.py` | Working with annotated text spans (citations, named entities) |
| [autospell.md](./autospell.md) | `autospell.py` | Working with search autocomplete |
| [trend.md](./trend.md) | `trend.py` | Working with user analytics or reading trends |

### Grouped (small/simple models by domain)
| Doc | Source Files | Load when... |
|-----|-------------|-------------|
| [social.md](./social.md) | `following.py`, `blocking.py` | Working with follow/block relationships |
| [content_objects.md](./content_objects.md) | `note.py`, `layer.py`, `passage.py`, `guide.py`, `story.py` | Working with user notes, layers, passages, or guides |
| [location.md](./location.md) | `place.py`, `timeperiod.py`, `manuscript.py` | Working with geographic, temporal, or manuscript metadata |
| [web_and_media.md](./web_and_media.md) | `webpage_text.py`, `media.py`, `audio.py`, `portal.py` | Working with cached web content, media, audio, or portals |
| [utilities.md](./utilities.md) | `lock.py`, `queue.py`, `history.py`, `ref_data.py`, `text_request_adapter.py` | Working with edit locks, indexing queue, change history, or API adapters |

### Linker Subsystem
| Doc | Source | Load when... |
|-----|--------|-------------|
| [linker/README.md](./linker/README.md) | `linker/` (overview) | Working with citation recognition or entity linking from natural language |

## Dependency Graph (Simplified)

```
abstract.py ← schema.py ← text.py ← (most other models)
                                  ↑
                          dependencies.py (wires all cross-model events)
                                  ↑
                          __init__.py (imports everything, calls library._build_index_maps())
```

Key dependency patterns:
- `text.py` imports `schema.py` and `abstract.py`
- Most domain models import `text.py` for Ref/Index/Library
- `dependencies.py` imports all models to wire subscriptions
- `__init__.py` imports all models and triggers `library._build_index_maps()` at module load
- Circular dependencies are handled via lazy imports (local imports inside functions)

## Common Patterns Across All Models

1. **Load by criteria**: `MyModel().load({"field": "value"})` — returns `self` if found, `None` if not
2. **Query sets**: `MyModelSet({"field": "value"})` — lazy, iterates on demand
3. **Save with cascades**: `obj.save()` triggers `notify()` which fires all registered dependency callbacks
4. **Skip cascades**: `obj.save(override_dependencies=True)` — use sparingly, can leave data inconsistent
5. **Slug-based models**: Use `MyModel.init("slug")` factory method (cached)
6. **Primary key changes**: Set `criteria_override_field` (e.g., `oldTitle`) before save when renaming
