"""Read-only: report what move_draft_text.py would find locally for one book.

Run from the Sefaria-Project root:
  PYTHONPATH=. DJANGO_SETTINGS_MODULE=sefaria.settings python3 <this file> "Book Title"
Prints one JSON object on the last line of output.
"""
import json
import sys

import django

django.setup()

from sefaria.model import library, VersionSet, LinkSet, Ref  # noqa: E402


def main(title):
    try:
        index = library.get_index(title)
    except Exception as e:
        return {"found": False, "error": str(e)}
    if not index:
        return {"found": False, "error": f"No index found for {title!r}"}

    canonical = index.title
    versions = [
        {"language": v.language, "versionTitle": v.versionTitle}
        for v in VersionSet({"title": canonical}).array()
    ]
    # Same queries move_draft_text.py uses for -l 1 and -l 2.
    ref_regex = Ref(canonical).regex()
    manual_query = {"$and": [
        {"refs": {"$regex": ref_regex}},
        {"$or": [{"auto": False}, {"auto": 0}, {"auto": {"$exists": False}}]},
    ]}
    all_query = {"refs": {"$regex": ref_regex}}
    return {
        "found": True,
        "title": canonical,
        "categories": index.categories,
        "versions": versions,
        "manual_link_count": LinkSet(manual_query).count(),
        "all_link_count": LinkSet(all_query).count(),
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"found": False, "error": "usage: inspect_local_text.py 'Book Title'"}))
        sys.exit(1)
    print(json.dumps(main(sys.argv[1]), ensure_ascii=False))
