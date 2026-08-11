-- Schema for the pgvector-backed semantic search store: `chunks` + `vectors`.
--
-- `Chunk` / `Vector` (semantic_search/models.py) map to these tables with `managed = False`,
-- so Django never creates or migrates them. This file is the source of truth for the schema,
-- created/populated out-of-band by the embed job (sefaria/helper/vector/embed_library_to_pgvector.py).
--
-- Split rationale: `chunks` holds metadata (index/version/ref context, categories, authors,
-- topics, pagerank, chunking provenance) which changes on admin/content operations; `vectors`
-- holds text + embedding together (they only ever change together - re-chunk or re-embed).
-- Metadata edits never rewrite vector rows, and multiple embedding models can coexist per
-- chunk without duplicating metadata. `chunking_schemes` / `embedding_models` are lookup
-- tables so new chunkers/models can be added as new rows instead of overwriting history.
--
-- Idempotent: table/index statements are `IF NOT EXISTS`, so re-running is safe (e.g. after a
-- restore that doesn't carry indexes forward reliably).
--
-- Apply with (autocommit; do NOT wrap in BEGIN/COMMIT -- CREATE INDEX CONCURRENTLY cannot run
-- inside a transaction block, and psql -f autocommits each statement by default):
--
--   psql -h "${PGVECTOR_HOST:-localhost}" -p "${PGVECTOR_DB_PORT:-5433}" \
--        -U "${PGVECTOR_USER:-pgvector}" -d "${PGVECTOR_DB:-pgvector}" \
--        -v ON_ERROR_STOP=1 -f semantic_search/sql/schema.sql
--
-- CONCURRENTLY avoids taking an ACCESS EXCLUSIVE lock on chunks/vectors while an index builds,
-- so live reads/writes are not blocked during creation. A CONCURRENTLY build that is
-- interrupted can leave an INVALID index behind; drop it and re-run if so:
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Lookup tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chunking_schemes (
    id          smallint PRIMARY KEY,
    description text NOT NULL
);

CREATE TABLE IF NOT EXISTS embedding_models (
    id          smallint PRIMARY KEY,
    description text NOT NULL
);

INSERT INTO chunking_schemes (id, description) VALUES
    (1, 'patot PatotChunker, default ChunkerConfig (semantic boundary detection, 3-pass with hard-max token split fallback)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO embedding_models (id, description) VALUES
    (1, 'gemini-embedding-001, 1536 dimensions, L2-normalized, task types RETRIEVAL_DOCUMENT/RETRIEVAL_QUERY')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- chunks: metadata only (no text, no embedding). PK'd by a stable surrogate `id` so metadata
-- edits (title renames, topic slug changes, pagerank recompute, ...) never need to touch or
-- invalidate `vectors` rows referencing this chunk.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chunks (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    index_title             text NOT NULL,
    version_title           text NOT NULL,
    language                text NOT NULL,
    ref                     text NOT NULL,
    url                     text NOT NULL,
    chunked_from_ref        text NOT NULL,
    direction               text NOT NULL,
    chunk_ordinal           integer NOT NULL,
    chunking_scheme_id      smallint NOT NULL REFERENCES chunking_schemes(id),
    primary_category        text,
    all_categories          text[] NOT NULL DEFAULT '{}',
    is_primary              boolean,
    is_source               boolean,
    composition_date        jsonb,
    composition_place       text,
    era_name                text,
    pagerank                double precision,
    author_names            text[] NOT NULL DEFAULT '{}',
    author_slugs            text[] NOT NULL DEFAULT '{}',
    associated_topic_names  text[] NOT NULL DEFAULT '{}',
    associated_topic_slugs  text[] NOT NULL DEFAULT '{}',
    linked_refs             text[] NOT NULL DEFAULT '{}',
    chunker_metadata        jsonb NOT NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    -- chunk_ordinal=1 for chunks spanning one whole segment or more (ref is unique within the
    -- unit in that case). When a single oversized segment is hard-split into multiple pieces
    -- (patot's hard_max_split pass), all pieces share the same ref and chunk_ordinal is that
    -- piece's 1-based position in the split. See chunk_ordinal semantics note in the plan /
    -- sefaria/helper/vector/embed_library_to_pgvector.py.
    UNIQUE (ref, version_title, language, chunk_ordinal, chunking_scheme_id)
);

-- ---------------------------------------------------------------------------
-- vectors: text + embedding together, FK'd to chunks. Multiple embedding_model_id rows can
-- exist per chunk (to compare models) without duplicating any chunks metadata.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vectors (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chunk_id            bigint NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    embedding_model_id  smallint NOT NULL REFERENCES embedding_models(id),
    text                text NOT NULL,
    embedding           vector(1536) NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (chunk_id, embedding_model_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
--
-- chunks: the UNIQUE constraint above already creates a btree on
-- (ref, version_title, language, chunk_ordinal, chunking_scheme_id), which via leftmost-prefix
-- also serves `ref` / `ref, version_title` lookups (KnnSearch's ref/ref__in filters,
-- get_chunks_containing_ref-style admin queries) without a dedicated index.
-- ---------------------------------------------------------------------------

-- Resume/filter lookups: get_indexed_unit_refs, and KnnSearch's index_title/language/
-- version_title filters.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_resume
    ON chunks (index_title, language, version_title);

-- P2: GIN indexes on the two slug arrays, for `<array> @> ARRAY[slug]` containment lookups
-- (e.g. topic/author slug renames) without a full table scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_author_slugs_gin
    ON chunks USING gin (author_slugs);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_assoc_topic_slugs_gin
    ON chunks USING gin (associated_topic_slugs);

-- vectors: HNSW vector index powering search_by_embedding's `embedding <=> query` cosine
-- ordering; without it every search seq-scans and sorts the whole table. Same type/params as
-- the current live index on library_chunks (m=32, ef_construction=200) - see
-- [[runbooks/pgvector-backup-restore]] for the /dev/shm + maintenance_work_mem + PVC-sizing
-- gotchas hit building this at ~2.4M rows (budget maintenance_work_mem well into double-digit
-- GB and expect a multi-hour build).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vectors_embedding_hnsw
    ON vectors USING hnsw (embedding vector_cosine_ops) WITH (m = 32, ef_construction = 200);

-- Not strictly needed (the UNIQUE(chunk_id, embedding_model_id) constraint's implicit btree
-- already covers chunk_id-prefix lookups), but named here for discoverability alongside the
-- other vectors indexes.

-- ---------------------------------------------------------------------------
-- section_text_cache: last-seen text hash per (section/passage ref, version, language).
-- Deliberately independent of chunks/vectors - no chunking_scheme_id/embedding_model_id, so a
-- row stays valid across chunker/embedding-model changes and only goes stale when the
-- underlying text does. embed_library_to_pgvector.py loads this whole table at startup and
-- diffs it against freshly computed hashes to skip re-running the chunker (and re-billing
-- Gemini) for units whose text hasn't changed since the last run.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS section_text_cache (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    section_ref         text NOT NULL,
    version_title       text NOT NULL,
    language            text NOT NULL,
    section_text_hash   text NOT NULL,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (section_ref, version_title, language)
);
