# Linker Subsystem
> Source: `sefaria/model/linker/`

## Purpose
The linker subsystem recognizes and resolves textual citations and named entities from natural language input. Given a string like "see Rashi on Genesis 1:1 and the Rambam in Hilchot Shabbat", it identifies the references, resolves them to `Ref` objects, and optionally links named entities to `Topic` records.

## Architecture
The pipeline flows in this order:

```
Input text
  → LinkerEntityRecognizer (NER via spaCy)
    → RawRef / RawNamedEntity / RawCategory (ref_part.py)
      → RefResolver (ref_resolver.py)
      → NamedEntityResolver (named_entity_resolver.py)
      → CategoryResolver (category_resolver.py)
        → LinkedDoc (output with resolved refs, entities, categories)
```

The `Linker` class (`linker.py`) orchestrates this pipeline.

## Navigation

| Doc | Source | Load when... |
|-----|--------|-------------|
| [linker.md](./linker.md) | `linker.py` | Understanding the entry point, `bulk_link()`, or the overall pipeline |
| [ref_part.md](./ref_part.md) | `ref_part.py` | Working with parsed reference parts (RawRef, TermContext, etc.) |
| [ref_resolver.md](./ref_resolver.md) | `ref_resolver.py` | Understanding how parsed refs become Ref objects, ambiguity handling |
| [referenceable_book_node.md](./referenceable_book_node.md) | `referenceable_book_node.py` | Working with schema node wrappers for ref resolution |
| [supporting.md](./supporting.md) | 10 smaller files | Match templates, context mutations, entity recognition, refiners, category resolution |

## Key Concepts
- **RawRef**: A span of text identified as a potential citation, broken into `RawRefPart` objects (book titles, section numbers, DH markers)
- **ResolvedRef**: A RawRef successfully matched to a `Ref` + schema node path
- **ResolutionThoroughness**: `NORMAL` vs `HIGH` — controls whether DH-only refs and certain fallbacks are attempted
- **Context**: Previously resolved refs provide context for ambiguous subsequent refs (e.g., "chapter 2" after "Genesis" → "Genesis 2")
- **Ibid tracking**: "ibid." and similar markers resolve to the most recent ref in the IbidHistory

## Relationships
- **Depends on**: `schema.py` (node types, Terms), `text.py` (Ref, Index, Library), `passage.py` (Passage matching), `topic.py` (Topic for named entities), `category.py` (Category for category resolution)
- **Depended on by**: `__init__.py` exports `RawRef` and `Linker`; used by the API linker endpoints and `webpage.py`
