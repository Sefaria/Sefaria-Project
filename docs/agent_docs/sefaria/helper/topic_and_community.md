# Topic Serving, Community Page, Descriptions & Trends
> Sources: `sefaria/helper/topic.py`, `sefaria/helper/community_page.py`, `sefaria/helper/descriptions.py`, `sefaria/helper/trend_manager.py`

## Purpose

These helpers serve topic pages, the community homepage, author/topic metadata management, and user engagement trend analysis. `topic.py` is the largest and most complex, handling everything from API response assembly to batch generation of topic-ref link relevance scores. `community_page.py` fetches curated content from Google Sheets. `descriptions.py` manages author biographical data. `trend_manager.py` provides a simple framework for evaluating user reading patterns.

## Key Functions/Classes

### topic.py (~1478 lines)

**API Response Assembly:**
- **`get_topic(v2, topic, lang, ...)`** -- Main helper for `api/topics/<slug>`. Loads a Topic by slug, assembles response with primary titles, transliteration flags, description (only if `description_published`), intra-topic links, ref links, author indexes, and ambiguous topic possibilities. Optimizes by querying `topic_links` once when both `with_links` and `with_refs` are requested.
- **`group_links_by_type(link_class, links, annotate_links, group_related)`** -- Groups links by their link type slug. For intra-topic links, deduplicates by topic slug. When `group_related` is true, collapses related link types into a single `related` group.
- **`sort_and_group_similar_refs(ref_links, lang)`** -- Sorts ref links by relevance, then merges links with overlapping `expandedRefs` into groups. Learning-team links are never merged. Deduplication considers curatedPrimacy, dataSources, and descriptions.
- **`annotate_topic_link(link, link_topic_dict)`** -- Enriches an intra-topic link with display titles, transliteration flags, description, shouldDisplay, pools, and numSources.
- **`sort_refs_by_relevance(a, b, lang)`** -- Comparison function for ref links: curatedPrimacy > pagerank > (numDatasource * tfidf). Designed to mirror `refSort` in TopicPage.jsx.
- **`get_all_topics(limit, displayableOnly, active_module)`** -- Returns topics filtered by pool membership and displayability, sorted by numSources. Cached 24h.
- **`get_topic_by_parasha(parasha)`** -- Loads topic by parasha name from the `parasha` field.
- **`get_random_topic(pool)` / `get_random_topic_source(topic)`** -- Random selection from topic pools and source links.
- **`get_bulk_topics(topic_list)`** -- Batch-loads topics by slug list.
- **`recommend_topics(refs)`** -- Given a list of refs, finds topics most frequently linked to those refs.
- **`get_topics_for_ref(tref, lang, annotate)`** -- Returns all topic links for a ref, optionally annotated with display info.
- **`get_trending_topics(num_topics)`** -- Queries Google Analytics (Beta API) for most-viewed topic pages in last 28 days. Cached 24h.
- **`get_topics_for_book(title, annotate, n)`** -- Returns top topics for a book, aggregated by user_votes, excluding parasha topics.

**Author Indexes:**
- **`get_author_indexes(slug, include_aggregations, include_descriptions)`** -- Returns authored works for an AuthorTopic slug, with optional aggregated URLs and descriptions.
- **`_serialize_author_index(index, include_descriptions)`** -- Formats an Index for the author-indexes API response.

**Secondary Data Generation (batch scripts):**
- **`generate_all_topic_links_from_sheets(topic)`** -- Processes all public source sheets to create:
  - RefTopicLinks (source-to-topic) using TF-IDF scoring with owner thresholds.
  - IntraTopicLinks (topic-to-topic, "sheets-related-to") based on co-occurrence on sheets.
  - Sheet-to-topic links.
  Uses `RecommendationEngine.cluster_close_refs` to merge nearby source refs into ranges.
- **`calculate_tfidf_related_sheet_links(related_links)`** -- Computes TF-IDF scores for intra-topic relatedness based on sheet co-occurrence.
- **`update_ref_topic_link_orders(source_links, sheet_topic_links)`** -- Calculates and attaches ordering metadata to all ref-topic links:
  - `tfidf` -- mean TF-IDF score of Hebrew words in the source
  - `numDatasource` -- how many distinct links share this ref/topic pair
  - `pr` -- PageRank score
  - `availableLangs` / `comp_date` / `order_id`
  - For sheets: `views`, `dateCreated`, `relevance` (avg PageRank * avg topic TF-IDF), `language`, `titleLanguage`
- **`update_intra_topic_link_orders(sheet_related_links)`** -- Adds TF-IDF relevance scores to intra-topic sidebar links.
- **`calculate_popular_writings_for_authors(top_n, min_pr)`** -- Creates `popular-writing-of` RefTopicLinks for authors based on PageRank.
- **`recalculate_secondary_topic_data()`** -- Full pipeline: regenerates sheet links, recalculates all ordering scores, bulk-writes to DB.
- **`add_num_sources_to_topics()`** -- Updates `numSources` count on all topics.
- **`get_top_topic(sheet)`** -- Picks the "top" topic for a sheet based on relevance scoring.
- **`tokenize_words_for_tfidf(text, stopwords)`** -- Hebrew text tokenizer: strips cantillation, HTML, kri-ktiv, English, punctuation, and waw prefixes. Uses a Hebrew stopword list.

### community_page.py (~379 lines)

- **`get_community_page_data(language, refresh)`** -- Fetches and caches (1 hour, in-memory) raw data from four Google Sheets tabs: parashah, calendar, discover, featured. Separate URLs for English and Hebrew.
- **`get_community_page_items(date, language, diaspora, refresh)`** -- Returns processed items for a given date: parashah, calendar, discover, featured. Each item includes a sheet and heading.
- **`get_parashah_item(data, date, diaspora)`** -- Matches the current parasha to the spreadsheet row, loads the associated sheet, and sets bilingual headings. Handles mid-week holiday readings where parasha name doesn't match the database.
- **`get_featured_item(data, date)`** -- Returns a featured item for the given date from the spreadsheet.
- **`sheet_with_customization(data)`** -- Loads a sheet by ID from a URL, then overrides title/summary/author/heading with custom values from the spreadsheet.
- **`translate_labels(label)`** -- Maps Hebrew spreadsheet column headers to English (e.g., "פרשה" -> "Parashah").
- **`get_featured_sheet_from_collection(collection)` / `get_featured_sheet_from_topic(slug)` / `get_featured_sheet_from_ref(ref)`** -- Random sheet selection from various sources, filtered for English title and substantial summary.
- **`print_parashah_rows(n)`** -- Utility for populating the spreadsheet with upcoming parasha dates.

### descriptions.py (~348 lines)

- **`create_era_link(topic, prev_era_to_delete)`** -- Creates an `is-a` IntraTopicLink from an author topic to its era category (e.g., "rishon-person", "talmudic-people"). Uses a slug map from era codes (GN, RI, AH, CO, KG, PT, T, A) to era topic slugs.
- **`update_authors_data()`** -- Bulk import of author data from a Google Sheets CSV. Two-pass process:
  - **Pass 1:** Validates slugs (uniqueness, format, era presence), then creates/updates AuthorTopic records with names, birth/death years/places, era, bios, Wikipedia/JE links, sex. Creates `displays-under` links to "authors" topic and era links.
  - **Pass 2:** Creates relationship links (child-of, grandchild-of, child-in-law-of, sibling-in-law-of, taught, member-of) from spreadsheet columns 16-21.

### trend_manager.py (~101 lines)

- **`TrendManager(name, key, period, valueThresholdMin)`** -- Base class for evaluating user engagement trends. `getPersonInfo(trends)` returns a dict with key, name, period, and boolean value based on whether the trend value exceeds the threshold.
- **`CategoryTrendManager(categoryName, period)`** -- Checks if user has read enough in a specific category (key: `ReadInCategory{name}`).
- **`SheetReaderManager(period)`** -- Checks sheets-read count (key: `SheetsRead`).
- **`ParashaLearnerManager(period="currently")`** -- Checks if user is a current parasha learner (boolean, no threshold).
- **`SheetCreatorManager(period, public, valueThresholdMin)`** -- Checks sheet creation count, with optional public-only variant (key: `SheetsCreatedPublic`).
- **`CustomTraitManager(customTraitName, customTraitKey, period)`** -- Generic trait evaluator that returns the raw value rather than a boolean.

## Non-Obvious Patterns

1. **`description` is only returned when `description_published` is True.** `get_topic()` explicitly deletes the `description` field from the response if `description_published` is falsy. This allows draft descriptions to exist in the database without being exposed.

2. **Learning-team links are never merged with other similar refs.** In `sort_and_group_similar_refs`, links with dataSource `learning-team` or `learning-team-editing-tool` are always kept separate, even if their expandedRefs overlap with other links.

3. **The community page is entirely driven by Google Sheets.** There are separate spreadsheet URLs for English and Hebrew, each with four tabs. Data is cached in-memory for 1 hour. The `translate_labels` function handles Hebrew column headers.

4. **TF-IDF calculation for topic-ref links uses "leave-one-out" scoring.** When calculating a ref's TF-IDF score for a topic, the formula subtracts that ref's own term frequency contribution to avoid self-reinforcement: `sum((tfidf[w] - tref_tf[w]*idf[w]) for w in words) / len(words)`.

5. **Topic pools gate which topics appear.** `get_all_topics` checks `get_topic_pool_name_for_module(active_module)` to determine the expected pool name, then filters topics by pool membership. This allows different modules to show different topic subsets.

6. **Ref clustering for topic sources** uses `RecommendationEngine.cluster_close_refs` to merge nearby refs into ranges, then splits clusters where individual counts differ by more than 2 standard deviations from the cluster mean.

7. **The author data pipeline validates slug format against primary title.** `update_authors_data()` checks that each slug matches `SluggedAbstractMongoRecord.normalize_slug(primary_title)` and aborts the entire import if any slug issues are found.

8. **`sort_refs_by_relevance` mirrors frontend sorting.** The function explicitly notes it should match `refSort` in `TopicPage.jsx`, ensuring server-side and client-side sorting produce the same order.

## Relationships

- **topic.py** imports from `sefaria.model.topic` (Topic, AuthorTopic, RefTopicLink, IntraTopicLink, TopicLinkType, TopicLinkHelper) and `sefaria.helper.descriptions` (for `create_era_link`).
- **topic.py** uses `django_topics.models.Topic` (Django ORM) for pool-based topic queries and random sampling.
- **community_page.py** imports `get_topic_by_parasha` from topic.py and `get_parasha` from `sefaria.utils.calendars`.
- **descriptions.py** is called by topic.py's import pipeline and directly manipulates AuthorTopic and IntraTopicLink models.
- **trend_manager.py** is standalone -- it reads from a `trends` dict (presumably from user analytics) and returns structured person-info dicts.
- **topic.py** uses `sefaria.pagesheetrank.pagerank_rank_ref_list` for PageRank computation on topic sources.

## Common Tasks

- **Serve a topic page:** Call `get_topic(v2=True, topic=slug, lang="en", ...)`.
- **Get topics for a ref:** Call `get_topics_for_ref(tref, annotate=True)`.
- **Rebuild all topic link ordering scores:** Call `recalculate_secondary_topic_data()`.
- **Import author data from spreadsheet:** Call `update_authors_data()`.
- **Get community page content:** Call `get_community_page_items(date, language, diaspora)`.
- **Find trending topics:** Call `get_trending_topics(num_topics=10)`.
- **Recommend topics for a reading list:** Call `recommend_topics(refs)`.
- **Check if a user is a parasha learner:** Use `ParashaLearnerManager().getPersonInfo(user_trends)`.
