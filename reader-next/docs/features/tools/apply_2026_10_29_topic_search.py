"""The moderators' topic search in the sidebar's Topics view (the old TopicSearch). Idempotent."""
import json, os, pathlib
T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
IDS = ["CON-047"]
for i in IDS: print(i, by[i]["name"])
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("CON-047", [
    "Shown when Sefaria.is_moderator, which is request.user.is_staff — the same check the server makes on POST. Signed out or not staff, the Topics view is unchanged (owner's screenshot of Genesis 1:11 with=Topics, 2026-10-29).",
    "Placeholder: Sefaria.translation(contentLang, 'Search for a Topic') has no Hebrew entry, so the box reads 'Search for a Topic' in every language; 'Create a new topic: ' / 'יצירת נושא: ' follows the sidebar language; 'Add Topic' / 'הוספת נושא' the interface. Old getName passes no topic_pool, so every topic is searched (not only the library pool).",
    "Refs: a several-verse selection posts its range (normRef(srefs), 'Genesis 1:11-13'). The POST answer is the link annotated like /api/related's topics (ref_topic_link_prep + annotate_topic_link), so it can join the list without a refetch.",
    "BUILT 2026-10-29 (src/ui/TopicsView/TopicSearch, src/lib/user/topic-links.ts): for viewer.isStaff, above the Topics list (also above 'No known Topics Here.'): typing asks /api/name/<word>?type=Topic, lists four topics plus 'Create a new topic: <word>'; choosing fills the box (blue); Add Topic or Enter posts /api/ref-topic-links/<ref> {topic, interface_lang} with the CSRF token; the new link is filed into the section's resources cache under each verse it covers, so the list and the Resources count update at once. Differences: the two alert()s are spoken status lines under the box; the create row does not open the inline TopicEditor (not built) — it says so and links to the same view on sefaria.org. Not verified against a live moderator session (would write to production); covered by unit tests and the Storybook story Connections/TopicsView/Moderator.",
])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st["CON-047"] = {"status": "partial", "note": "Search and add a topic: done (moderators). Creating a topic (TopicEditor) links to sefaria.org", "by": "src/ui/TopicsView/TopicSearch.tsx"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
