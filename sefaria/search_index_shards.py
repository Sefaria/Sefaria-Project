"""Primary shard counts for new search indexes.

Kept free of Django and Elasticsearch imports so it can be unit-tested on its own.
"""

DEFAULT_TEXT_PRIMARY_SHARDS = 3
MAX_TEXT_PRIMARY_SHARDS = 16


def primary_shard_count(index_type, environ):
    """Number of primary shards for a new index of `index_type`.

    The text index is built with replicas off. With one primary, the whole build (about
    20 GB at peak) lands on a single node that already holds a copy of the live index,
    which filled a 30Gi disk on dev (2026-10-17) and a 40Gi disk on prod (2026-09-24).
    Three primaries spread it over the three data nodes. Smaller indexes keep one primary.
    `SEARCH_TEXT_PRIMARY_SHARDS` overrides the text count; a bad value raises ValueError.
    """
    if index_type != "text":
        return 1
    raw = (environ.get("SEARCH_TEXT_PRIMARY_SHARDS") or "").strip()
    if not raw:
        return DEFAULT_TEXT_PRIMARY_SHARDS
    count = int(raw)
    if not 1 <= count <= MAX_TEXT_PRIMARY_SHARDS:
        raise ValueError(f"SEARCH_TEXT_PRIMARY_SHARDS must be between 1 and {MAX_TEXT_PRIMARY_SHARDS}, got {raw!r}")
    return count
