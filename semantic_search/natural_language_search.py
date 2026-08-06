def union_chunks_by_ref(first: list, second: list) -> list:
    """
    Union two SemanticTextChunk lists by ref, keeping the first occurrence and
    dropping duplicates found in the second list.
    """
    seen = set()
    union = []
    for chunk in (*first, *second):
        if chunk.ref in seen:
            continue
        seen.add(chunk.ref)
        union.append(chunk)
    return union
