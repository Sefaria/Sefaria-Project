"""Topic TOC endpoint (owner decision 2026-10-06) and the topic crumb on search cards. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
for fid in ["SRC-070"]: print(fid, by[fid]["name"])
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("SRC-070", ["OWNER DECISION 2026-10-06: add a public endpoint. BUILT: Sefaria-Project GET /api/topics-toc (reader/views.py topics_toc_api → library.get_topic_toc_json(); branch reader-next) and src/lib/topics/topic-toc.ts (topicParents = the old displayTopicTocCategory: the category directly above a topic, none for top-level ones); Author and Topic cards show it as a crumb linking to /topics/category/<slug>. Until the endpoint reaches sefaria.org the request 404s and the crumb is simply absent."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st["SRC-070"] = {"status": "done", "note": "Parent-category crumb from /api/topics-toc (cauldron reader-next; absent where the endpoint is not deployed)", "by": "src/lib/topics/topic-toc.ts"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
