# Topic Model
> Source: `sefaria/model/topic.py`

## Purpose
Defines the Topic hierarchy (Topic, PersonTopic, AuthorTopic), the two kinds of topic links (IntraTopicLink for topic-to-topic, RefTopicLink for topic-to-text/sheet), and supporting infrastructure for link types and data sources. Topics are the primary way Sefaria organizes thematic content, connecting texts, people, and concepts into a navigable graph. Topics live in a taxonomy defined by `is-a` and `displays-under` IntraTopicLinks.

## Key Classes

### Topic
- **Inherits**: `SluggedAbstractMongoRecord`, `AbstractTitledObject`
- **Collection**: `topics`
- **Role**: Base class for all topics. Handles slug management, title groups, merging, pool membership, and the subclass dispatch system.
- **Key fields**: `slug`, `titles`, `description` (dict keyed by lang), `categoryDescription`, `subclass` (discriminator: `"person"` or `"author"`), `numSources`, `isTopLevelDisplay`, `displayOrder`, `shouldDisplay`, `data_source`, `image`, `portal_slug`, `properties` (dict of `{value, dataSource}` pairs), `alt_ids`, `parasha`, `ref`, `isAmbiguous`
- **Key methods**:
  - `load()` -- Polymorphic: automatically casts to the correct subclass (PersonTopic/AuthorTopic) based on the `subclass` field. If called on a subclass, filters query to only that subclass and its children.
  - `get_types()` -- **Expensive.** Recursively walks `is-a` ancestors. Use `has_types(slug_set)` for early-exit checking.
  - `topics_by_link_type_recursively()` -- Recursively traverses a given linkType (typically `is-a` or `displays-under`). Supports `reverse`, `only_leaves`, `max_depth`, `min_sources`.
  - `merge(other)` -- Merges another topic (or old slug) into self: re-points all links, updates sheets, indexes, marked_up_text_chunks, and linker_output in the DB, then deletes `other`.
  - `set_slug(new_slug)` -- Changes slug, updates Django mirror, saves, then calls `merge(old_slug)` to re-point references.
  - `link_set(_class, query_kwargs)` -- Returns IntraTopicLinkSet, RefTopicLinkSet, or mixed results depending on `_class` (`'intraTopic'`, `'refTopic'`, or `None`).
  - `should_display()` -- True if `shouldDisplay` is truthy AND (has sources OR has description OR `data_source == "sefaria"`).
  - `contents(minify=False)` -- When `minify=True`, returns only slug/shouldDisplay/displayOrder/pools (used for topic TOC building at server start).
  - `update_after_link_change(pool)` -- Called after RefTopicLink save/delete. Updates pool membership (`sheets`/`textual`) and recalculates `numSources`.
  - `_pre_save()` -- Syncs to Django `Topic` model (creates or updates `DjangoTopic` with en/he titles).
  - `_normalize()` -- Strips title whitespace. Also checks if topic displays-under "authors" and auto-sets `subclass = "author"`.
- **Subclass dispatch**: `subclass_map = {'person': 'PersonTopic', 'author': 'AuthorTopic'}`. The `subclass` field in Mongo drives which Python class is instantiated.

### PersonTopic
- **Inherits**: `Topic`
- **Collection**: `topics` (same collection, discriminated by `subclass`)
- **Role**: Topic representing a person (not necessarily an author). Adds time period and place annotation.
- **Key fields**: Inherits all Topic fields. Uses `properties` for `birthYear`, `deathYear`, `birthYearIsApprox`, `deathYearIsApprox`, `generation`, `era`, `birthPlace`, `deathPlace`.
- **Key methods**:
  - `most_accurate_life_period()` -- Returns a `LifePeriod` computed from properties, trying birth+death years first, then birth-only, then death-only, then generation, then era. Returns `None` if nothing is set.
  - `most_accurate_time_period()` -- Same logic but returns `TimePeriod` (different string formatting).
  - `annotate_place(d)` -- Adds Hebrew place names to contents dict by looking up Place objects.
  - `contents(annotate_time_period=True)` -- Enriches output with `timePeriod` block containing name and yearRange.
  - `get_person_by_key(key)` -- Loads by `alt_ids.old-person-key` (migration helper).

### AuthorTopic
- **Inherits**: `PersonTopic`
- **Collection**: `topics` (same collection, discriminated by `subclass`)
- **Role**: Topic representing an author of texts. Used in `Index.authors` field. Adds works aggregation logic.
- **Key methods**:
  - `get_authored_indexes()` -- Returns `IndexSet({"authors": self.slug})` sorted by Ref order.
  - `aggregate_authors_indexes_by_category()` -- Groups an author's works into categories when possible, returning a list of `AuthorWorksAggregation` objects (either `AuthorIndexAggregation` for individual works or `AuthorCategoryAggregation` for grouped works). Complex logic involving commentary detection, collective titles, and category path matching.
  - `get_aggregated_urls_for_authors_indexes()` -- Returns list of `{url, title, description}` dicts for author page display.
  - `is_author(slug)` -- Static. Returns True if slug loads as AuthorTopic.

### TopicLinkHelper
- **Inherits**: `object`
- **Collection**: N/A (utility class)
- **Role**: Shared attributes and factory for IntraTopicLink / RefTopicLink. Both link types live in the same `topic_links` collection, discriminated by the `class` field.
- **Key fields** (shared required): `toTopic`, `linkType`, `class` (`'intraTopic'` or `'refTopic'`), `dataSource`
- **Key methods**:
  - `init_by_class(topic_link, context_slug)` -- Factory: returns IntraTopicLink or RefTopicLink based on `class` field.

### IntraTopicLink
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `topic_links` (shared with RefTopicLink)
- **Role**: Topic-to-topic link (e.g., is-a, displays-under, related-to). Directional: `fromTopic` -> `toTopic`.
- **Key fields**: `fromTopic`, `toTopic`, `linkType`, `dataSource`, `order` (dict, may contain `custom_order`), `class` (always `'intraTopic'`)
- **Key methods**:
  - `__init__(attrs, context_slug)` -- `context_slug` determines `is_inverse` property (True when context_slug == toTopic).
  - `contents()` -- When context_slug is set (and not `for_db`), replaces fromTopic/toTopic with a single `topic` field and adds `isInverse` and `tfidf`.
  - `_validate()` -- Checks: link type exists, both topics exist, data source exists, no duplicates (including inverse direction for symmetric types), validates `validFrom`/`validTo` type constraints, prevents circular `is-a` paths.
  - Properties: `is_inverse`, `topic`, `tfidf` -- computed based on `context_slug`.

### RefTopicLink
- **Inherits**: `AbstractMongoRecord`
- **Collection**: `topic_links` (shared with IntraTopicLink)
- **Role**: Links a topic to a text Ref or a source sheet. Direction is always ref -> topic (ref in `ref` field, topic in `toTopic`). No `fromTopic` field.
- **Key fields**: `ref`, `toTopic`, `expandedRefs` (auto-computed segment refs), `is_sheet` (auto-computed bool), `linkType`, `dataSource`, `charLevelData` (optional, for sub-ref precision), `descriptions` (optional, per-lang title+prompt), `unambiguousToTopic`
- **Key methods**:
  - `_normalize()` -- Auto-sets `is_sheet` from ref pattern (`Sheet \d+`), sets `class` to `'refTopic'`, expands ref to segment refs in `expandedRefs`.
  - `save()` / `delete()` -- After super, calls `topic.update_after_link_change(pool)` to keep pool membership and numSources in sync.
  - `_pre_save()` -- Checks for duplicates (by linkType + ref + toTopic + dataSource, plus charLevelData if present).
  - `set_description(lang, title, prompt)` -- Sets learning prompt metadata for this ref-topic connection.
  - `contents()` -- Renames `toTopic` to `topic` when not `for_db`.

### TopicLinkType
- **Inherits**: `SluggedAbstractMongoRecord`
- **Collection**: `topic_link_types`
- **Role**: Defines a type of link between topics (or topic-to-ref). Each type has a forward and inverse representation.
- **Key fields**: `slug`, `inverseSlug`, `displayName`, `inverseDisplayName`, `shouldDisplay`, `inverseShouldDisplay`, `groupRelated`, `validFrom` (list of valid source topic type slugs), `validTo` (list of valid target topic type slugs)
- **Key constants**: `isa_type = 'is-a'`, `related_type = 'related-to'`, `possibility_type = 'possibility-for'`
- **Key methods**:
  - `get(attr, is_inverse, default)` -- Retrieves forward or inverse variant of an attribute by prepending `'inverse'`.
  - `slug_fields = ['slug', 'inverseSlug']` -- Both slugs are indexed; `validate_slug_exists(slug, index)` uses the index param to pick which slug field.

### TopicDataSource
- **Inherits**: `SluggedAbstractMongoRecord`
- **Collection**: `topic_data_sources`
- **Role**: Provenance record for where topic data or links came from (e.g., `"sefaria"`, `"learning-team-editing-tool"`, `"sheet-topic-aggregator"`).
- **Key fields**: `slug`, `displayName`, `url`, `description`

### TopicSet / PersonTopicSet / AuthorTopicSet
- **Inherits**: `AbstractMongoSet`
- **Role**: Set classes that auto-filter by `subclass` field when instantiated from a subclass recordClass.
- **Key behavior**: `_read_records()` casts each record to the correct Python subclass. `load_by_title(title)` searches across `titles.text`.

### TopicLinkSetHelper
- **Role**: Utility for querying the shared `topic_links` collection. `init_query()` injects `class` filter. `find()` returns mixed IntraTopicLink/RefTopicLink instances.

## Non-Obvious Patterns

- **Single collection, two Python classes**: Both IntraTopicLink and RefTopicLink live in `topic_links`, discriminated by the `class` field. Always use the specific class or `TopicLinkSetHelper.find()` -- never query the collection directly without a `class` filter.
- **Subclass dispatch via `subclass` field**: `Topic.load()` and `TopicSet._read_records()` automatically cast to PersonTopic/AuthorTopic. The `subclass_map` dict drives this. When loading via a subclass, the query is automatically filtered to include only that subclass and its children.
- **Auto-author promotion**: `_normalize()` checks if the topic has a `displays-under` link to `"authors"` and automatically sets `subclass = "author"`, even if the topic was created as a plain Topic.
- **Django mirror**: `_pre_save()` syncs every Topic to a Django `DjangoTopic` model. This is used for the pool system (`TopicPool`/`PoolType`). Pool operations go through Django ORM, not Mongo.
- **Pools are Django-managed**: `get_pools()`, `add_pool()`, `remove_pool()` operate on the Django side. Pools (e.g., `"sheets"`, `"textual"`) track whether a topic has sheet links or text links.
- **context_slug changes IntraTopicLink output**: When an IntraTopicLink is loaded with a `context_slug`, its `contents()` flips the link perspective, returning a single `topic` field (the "other" topic) plus `isInverse` and `tfidf`.
- **merge() is comprehensive**: Re-points links, sheets, indexes, marked_up_text_chunks, and linker_output. Deletes the source topic. Used by `set_slug()` to handle slug changes.
- **get_types() is expensive**: Each call walks `is-a` ancestors recursively with individual DB calls. Use `has_types(slug_set)` for early-exit checking when you only need a boolean answer.
- **RefTopicLink auto-expands refs**: `_normalize()` converts the `ref` to segment-level refs in `expandedRefs`, enabling efficient lookups. Sheet refs (matching `Sheet \d+`) are not expanded.
- **Description change creates links**: `process_topic_description_change` parses markdown links from descriptions and auto-creates IntraTopicLinks (for `/topics/...` URLs) or RefTopicLinks (for text refs).
- **TopicLinkType.validate_slug_exists(slug, index)**: The second argument `index` selects which slug field to check (`0` = `slug`, `1` = `inverseSlug`).
- **properties dict pattern**: Topic properties use `{value, dataSource}` structure, not flat values. Use `get_property(name)` for just the value, or `get_property(name, value_only=False)` for both value and data source.

## Relationships

- **Depends on**:
  - `abstract` (SluggedAbstractMongoRecord, AbstractMongoSet, subscribe/cascade)
  - `schema` (AbstractTitledObject, TitleGroup, Term)
  - `text` (Ref, IndexSet, Index, library)
  - `category` (Category)
  - `timeperiod` (TimePeriod, LifePeriod)
  - `place` (Place)
  - `portal` (Portal -- for portal_slug validation)
  - `django_topics.models` (DjangoTopic, TopicPool, PoolType -- Django ORM mirror)
  - `sefaria.system.database` (db)
  - `sefaria.system.validators` (validate_url)
  - `sefaria.system.exceptions` (InputError, DuplicateRecordError)

- **Depended on by**:
  - `sefaria/helper/topic.py` (topic page API logic, topic tree building)
  - `reader/views.py` (API endpoints)
  - `sefaria/sheets.py` (sheet-topic associations)
  - `sefaria/model/linker/named_entity_resolver.py` (NER linking to topics)
  - `sefaria/model/garden.py`
  - `sefaria/model/collection.py`
  - `sefaria/model/timeperiod.py` (reverse cascade)
  - `sefaria/helper/community_page.py`
  - `sefaria/helper/llm/` (topic prompts for LLM tasks)
  - `scripts/` (bootstrap_topics, import_people_to_topics, import_named_entities, recalculate_secondary_topic_data)

- **Dependency subscriptions** (registered in `dependencies.py`):
  - Index title change -> `process_index_title_change_in_topic_links`: updates `ref` field in RefTopicLinks
  - Index delete -> `process_index_delete_in_topic_links`: deletes RefTopicLinks referencing that index
  - Topic delete -> `process_topic_delete`: deletes all RefTopicLinks and IntraTopicLinks for that topic, cleans up sheets, removes DjangoTopic
  - AuthorTopic delete -> `process_topic_delete` (same handler, registered separately)
  - Topic description change -> `process_topic_description_change`: re-parses markdown links in description, creates/deletes related IntraTopicLinks and RefTopicLinks
  - Topic slug change -> `marked_up_text_chunk.process_topic_slug_change`
  - TimePeriod symbol change -> cascades to `PersonTopicSet` on `properties.era.value` and `properties.generation.value`

## Common Tasks

- **Load a topic by slug**: `Topic.init("slug-name")` -- returns correct subclass automatically.
- **Get all sub-topics**: `topic.topics_by_link_type_recursively(linkType='displays-under', reverse=True)`
- **Get text refs for a topic**: `topic.link_set('refTopic')` or `topic.get_ref_links(is_sheet=False)`
- **Get related topics**: `topic.link_set('intraTopic', query_kwargs={"linkType": "related-to"})`
- **Check if topic is of a type**: `topic.has_types({"some-type-slug"})` -- walks is-a hierarchy.
- **Merge topics**: `surviving_topic.merge(other_topic)` -- comprehensive merge of all references.
- **Change a topic's slug**: `topic.set_slug("new-slug")` -- handles all cascading updates.
- **Get author's works**: `author_topic.get_aggregated_urls_for_authors_indexes()` -- returns grouped works.
- **Create a topic-to-text link**: `RefTopicLink({"ref": "Genesis 1:1", "toTopic": "slug", "linkType": "about", "dataSource": "source-slug"}).save()`
- **Create a topic-to-topic link**: `IntraTopicLink({"fromTopic": "child-slug", "toTopic": "parent-slug", "linkType": "is-a", "dataSource": "source-slug"}).save()`
