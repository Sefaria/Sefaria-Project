"""
Quick helper to attach ref_resolver_context_mutations to the
"Peninei Halakhah, Family" schema node and print the updated document.

Usage:
    python scripts/scratch_peninei_context_mutations.py

Requires active Django/Mongo configuration.
"""

from __future__ import annotations

import json
from copy import deepcopy
from typing import Dict, List

import django

django.setup()

from sefaria.system.database import db  # noqa: E402


# Map of English node titles to the mutations that should be attached.
TARGET_MUTATIONS: Dict[str, List[dict]] = {
    "Peninei Halakhah, Family": [
        {"op": "add", "input_terms": ["shulchan_arukh"], "output_terms": ["even_haezer"]},
    ]
}


def _english_titles(node: dict) -> List[str]:
    return [title["text"] for title in node.get("titles", []) if title.get("lang") == "en"]


def _apply_mutations(node: dict, title_to_mutations: Dict[str, List[dict]], updated: List[dict]) -> None:
    titles = set(_english_titles(node))
    matching = titles & set(title_to_mutations.keys())
    if matching:
        title = matching.pop()
        node["ref_resolver_context_mutations"] = deepcopy(title_to_mutations[title])
        updated.append(node)
    for child in node.get("nodes", []) or []:
        if isinstance(child, dict):
            _apply_mutations(child, title_to_mutations, updated)


def main() -> None:
    index_doc = db.index.find_one({"title": "Peninei Halakhah, Family"})
    if not index_doc:
        raise RuntimeError("Peninei Halakhah, Family index not found in MongoDB")

    updated_nodes: List[dict] = []
    schema_root = index_doc.get("schema")
    if isinstance(schema_root, dict):
        _apply_mutations(schema_root, TARGET_MUTATIONS, updated_nodes)
    else:
        print("Index document missing schema; nothing to do.")
        return

    if not updated_nodes:
        print("No nodes updated; nothing to do.")
        return

    db.index.replace_one({"_id": index_doc["_id"]}, index_doc)
    print("Updated nodes:")
    for node in updated_nodes:
        print(json.dumps(node, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
