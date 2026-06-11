"""
Compare old (existing) vs new (disambiguator-resolved) link counts,
grouped by corpus / collective_title / index of the SOURCE ref of each
disambiguator resolution (the "ref" field in db.linker_disambiguation_tmp).

"old links": total number of distinct existing db.links documents that have
             at least one side (refs[0] or refs[1]) belonging to a given
             group, regardless of whether that ref appears anywhere in
             db.linker_disambiguation_tmp. A link with both sides in the same
             group is counted only once for that group (deduped by link _id).
"new links": resolutions from db.linker_disambiguation_tmp (mutc pairs) whose
             (source, target) pair is NOT already connected by any existing
             link (exact or broader/ranged) — a genuinely new connection.
             Counted under the SOURCE ref's group.
"modified links": resolutions whose (source, target) pair is already
             connected by an existing link, but only via a broader/ranged
             link — the disambiguator's resolution is MORE SPECIFIC than the
             existing link. Counted under the SOURCE ref's group. Exact
             (segment-to-segment) duplicates are excluded from all three
             counts.

Adjacency is computed at the segment level via expandedRefs0/expandedRefs1:
a link's side is "broad" if its expandedRefs has more than one segment
(i.e. the stored ref is a range), "specific" if it has exactly one.

--bavli-only: restrict to links where one side is in the Bavli corpus
(checked via Index.get_primary_corpus() == "Bavli", not Index.is_bavli()).
For new/modified links, only the target ref needs to be in Bavli — the
source can be anything.

Output: disambiguator_analysis/link_counts_comparison.csv (or
disambiguator_analysis/link_counts_comparison_bavli.csv with --bavli-only)
Columns: title, old links, new links, modified links
"""
import argparse
import csv
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
django.setup()

from sefaria.model import library, Ref
from sefaria.system.database import db
from collections import Counter, defaultdict
import tqdm

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "../disambiguator_analysis")
os.makedirs(OUTPUT_DIR, exist_ok=True)

parser = argparse.ArgumentParser()
parser.add_argument("--bavli-only", action="store_true",
                     help="Only include links where one side is in the Bavli corpus. "
                          "For new/modified links, only the target ref is checked.")
args = parser.parse_args()

coll = db.linker_disambiguation_tmp
links_coll = db.links


# ── Helpers ────────────────────────────────────────────────────────────────

_index_cache: dict = {}  # ref_str -> index title or None


def get_index_title(ref_str: str):
    if ref_str not in _index_cache:
        try:
            _index_cache[ref_str] = Ref(ref_str).index.title
        except Exception:
            _index_cache[ref_str] = None
    return _index_cache[ref_str]


_corpus_cache: dict = {}  # index title -> primary corpus or None


def get_corpus(index_title: str):
    if index_title not in _corpus_cache:
        try:
            _corpus_cache[index_title] = library.get_index(index_title).get_primary_corpus()
        except Exception:
            _corpus_cache[index_title] = None
    return _corpus_cache[index_title]


def is_bavli_ref(ref_str: str) -> bool:
    title = get_index_title(ref_str)
    return bool(title) and get_corpus(title) == "Bavli"


_group_cache: dict = {}  # index title -> group name


def get_group(index_title: str) -> str:
    if index_title in _group_cache:
        return _group_cache[index_title]
    group = index_title
    try:
        idx = library.get_index(index_title)
        corpus = idx.get_primary_corpus()
        if corpus:
            group = corpus
        else:
            ct = getattr(idx, "collective_title", None)
            if ct:
                group = ct
    except Exception:
        pass
    _group_cache[index_title] = group
    return group


# ── 1. Load mutc docs, build (source, target) pairs ─────────────────────────

print("Loading mutc docs...")
mutc_pairs = set()  # {(source_ref, target_ref)}

mutc_total = coll.count_documents({"type": "mutc"})
cursor = coll.find(
    {"type": "mutc"},
    {"ref": 1, "resolution_type": 1,
     "llm_resolved_ref_non_segment": 1, "llm_resolved_ref_ambiguous": 1},
)
for doc in tqdm.tqdm(cursor, total=mutc_total, desc="mutc docs"):
    source = doc.get("ref", "")
    rtype = doc.get("resolution_type", "")
    if rtype == "non_segment":
        target = doc.get("llm_resolved_ref_non_segment", "")
    elif rtype == "ambiguous":
        target = doc.get("llm_resolved_ref_ambiguous", "")
    else:
        target = ""
    if source and target:
        if args.bavli_only and not is_bavli_ref(target):
            continue
        mutc_pairs.add((source, target))

print(f"  Unique (source, target) pairs: {len(mutc_pairs):,}")

unique_sources = set(s for s, _ in mutc_pairs)


# ── 2. Load existing link counts + segment-level adjacency maps ─────────────

print("\nLoading existing links...")
group_old: dict = defaultdict(set)  # group -> set of link _ids (deduped)
linked_specific: dict = defaultdict(set)  # segment ref -> segment refs linked via an exact (1-segment) link
# segment ref -> segment ref -> set of link _ids connecting them via a broader (ranged) link
linked_broad: dict = defaultdict(lambda: defaultdict(set))
link_total = links_coll.count_documents({})
cursor = links_coll.find({}, {"refs": 1, "expandedRefs0": 1, "expandedRefs1": 1})
for doc in tqdm.tqdm(cursor, total=link_total, desc="link docs"):
    refs = doc.get("refs") or []
    if args.bavli_only and not any(is_bavli_ref(r) for r in refs):
        continue
    link_id = doc["_id"]
    for r in refs:
        title = get_index_title(r)
        if title:
            group_old[get_group(title)].add(link_id)
    side0 = doc.get("expandedRefs0") or []
    side1 = doc.get("expandedRefs1") or []
    broad0 = len(side0) > 1
    broad1 = len(side1) > 1
    for a in side0:
        for b in side1:
            if broad1:
                linked_broad[a][b].add(link_id)
            else:
                linked_specific[a].add(b)
            if broad0:
                linked_broad[b][a].add(link_id)
            else:
                linked_specific[b].add(a)

print(f"  Groups with at least one old link: {len(group_old):,}")
print(f"  Specific adjacency map size: {len(linked_specific):,} refs")
print(f"  Broad adjacency map size: {len(linked_broad):,} refs")


# ── 3. Classify resolutions: new / modified / exact duplicate ───────────────

print("\nClassifying resolutions (new / modified / exact duplicate)...")
new_link_counter = Counter()
modified_link_counter = Counter()
duplicates = 0
redundant_modifications = 0  # would-be "modified" but its link was already claimed
consumed_broad_links: set = set()  # link _ids already counted as "modified"
for source, target in tqdm.tqdm(mutc_pairs, desc="mutc pairs"):
    if target in linked_specific.get(source, ()):
        duplicates += 1
        continue
    broad_ids = linked_broad.get(source, {}).get(target)
    if not broad_ids:
        new_link_counter[source] += 1
        continue
    available = broad_ids - consumed_broad_links
    if available:
        consumed_broad_links.add(next(iter(available)))
        modified_link_counter[source] += 1
    else:
        redundant_modifications += 1

print(f"  New links: {sum(new_link_counter.values()):,}")
print(f"  Modified (more specific than existing) links: {sum(modified_link_counter.values()):,}")
print(f"  Exact duplicates (excluded): {duplicates:,}")
print(f"  Redundant modifications (excluded, link already counted as modified): {redundant_modifications:,}")


# ── 4. Aggregate new / modified link counts by group (old links already done) ──

print("\nGrouping new/modified counts by corpus / collective_title / index...")
group_new: dict = defaultdict(int)
group_modified: dict = defaultdict(int)

for ref_str in tqdm.tqdm(unique_sources, desc="resolving source refs"):
    title = get_index_title(ref_str)
    if not title:
        continue
    group = get_group(title)
    group_new[group] += new_link_counter.get(ref_str, 0)
    group_modified[group] += modified_link_counter.get(ref_str, 0)


# ── 5. Write CSV ──────────────────────────────────────────────────────────────

filename = "link_counts_comparison_bavli.csv" if args.bavli_only else "link_counts_comparison.csv"
out = os.path.join(OUTPUT_DIR, filename)
all_groups = sorted(set(group_old) | set(group_new) | set(group_modified))
with open(out, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["title", "old links", "new links", "modified links"])
    for name in all_groups:
        w.writerow([name, len(group_old.get(name, ())), group_new.get(name, 0), group_modified.get(name, 0)])

print(f"\nWrote {out} ({len(all_groups):,} rows)")
