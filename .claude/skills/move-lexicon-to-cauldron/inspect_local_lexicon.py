"""Read-only: report what move_draft_lexicon.py would find locally for one lexicon.

Run from the Sefaria-Project root:
  PYTHONPATH=. DJANGO_SETTINGS_MODULE=sefaria.settings python3 <this file> "Lexicon Name"
Prints one JSON object on the last line of output.
"""
import json
import sys

import django

django.setup()

from sefaria.model import library, VersionSet, LinkSet, Ref  # noqa: E402
from sefaria.system.database import db  # noqa: E402


def main(name):
    lexicon = db.lexicon.find_one({"name": name}, {"_id": 0})
    if not lexicon:
        return {"found": False, "local_lexicons": sorted(l["name"] for l in db.lexicon.find({}, {"name": 1}))}

    result = {
        "found": True,
        "name": name,
        "entry_count": db.lexicon_entry.count_documents({"parent_lexicon": name}),
        "word_form_count": db.word_form.count_documents({"lookups.parent_lexicon": name}),
        "index_title": lexicon.get("index_title"),
        "version_title": lexicon.get("version_title"),
        "version_lang": lexicon.get("version_lang"),
        "should_autocomplete": bool(lexicon.get("should_autocomplete")),
    }
    if not result["index_title"]:
        return result

    try:
        index = library.get_index(result["index_title"])
    except Exception as e:
        return {**result, "index_error": str(e)}
    # Same version choice as move_draft_lexicon.py's _copy_text()
    query = {"title": index.title, "versionTitle": result["version_title"]}
    if result["version_lang"]:
        query["language"] = result["version_lang"]
    result["versions_found"] = [v.language for v in VersionSet(query)] if result["version_title"] else []

    # Same queries move_draft_text.py uses for -l 1 and -l 2.
    ref_regex = Ref(index.title).regex()
    result["manual_link_count"] = LinkSet({"$and": [
        {"refs": {"$regex": ref_regex}},
        {"$or": [{"auto": False}, {"auto": 0}, {"auto": {"$exists": False}}]},
    ]}).count()
    result["all_link_count"] = LinkSet({"refs": {"$regex": ref_regex}}).count()
    return result


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"found": False, "error": "usage: inspect_local_lexicon.py 'Lexicon Name'"}))
        sys.exit(1)
    print(json.dumps(main(sys.argv[1]), ensure_ascii=False))
