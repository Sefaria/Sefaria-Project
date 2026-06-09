"""
Compare link counts before vs after the disambiguator, grouped by corpus / base text / index.

Run once on local (before) and once on prod (after); combine the two output CSVs manually.

Usage: ./run scripts/link_count_comparison.py [local|prod]
"""
import argparse
import csv
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
django.setup()

from sefaria.model import library, Ref
from sefaria.system.database import db
from collections import defaultdict
import tqdm

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "../disambiguator_analysis")
os.makedirs(OUTPUT_DIR, exist_ok=True)

parser = argparse.ArgumentParser()
parser.add_argument("env", choices=["local", "prod"],
                    help="'local' → before_link_count column; 'prod' → after_link_count column")
args = parser.parse_args()

col_name = "before_link_count" if args.env == "local" else "after_link_count"
out_file = os.path.join(OUTPUT_DIR, f"link_counts_{args.env}.csv")

print(f"Env: {args.env}  →  column '{col_name}'  →  {out_file}")

# ── Helpers ───────────────────────────────────────────────────────────────────

_index_cache: dict = {}  # ref_str → index title or None


def get_index_title(ref_str: str):
    if ref_str not in _index_cache:
        try:
            _index_cache[ref_str] = Ref(ref_str).index.title
        except Exception:
            _index_cache[ref_str] = None
    return _index_cache[ref_str]


_group_cache: dict = {}  # index title → group name


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


# ── 1. Count link endpoints per index ────────────────────────────────────────

print("\nLoading links...")
links_coll = db.links
total = links_coll.count_documents({})
index_counts: dict = defaultdict(int)  # index title → total link-endpoint count

cursor = links_coll.find({}, {"refs": 1})
for doc in tqdm.tqdm(cursor, total=total, desc="links"):
    for r in doc.get("refs") or []:
        title = get_index_title(r)
        if title:
            index_counts[title] += 1

print(f"  {len(index_counts):,} unique indexes")

# ── 2. Group by corpus / base_text_titles[0] / index title ───────────────────

print("Grouping...")
group_counts: dict = defaultdict(int)
for index_title, count in index_counts.items():
    group_counts[get_group(index_title)] += count

# ── 3. Write CSV ──────────────────────────────────────────────────────────────

with open(out_file, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["name", col_name])
    for name in sorted(group_counts):
        w.writerow([name, group_counts[name]])

print(f"\nWrote {out_file} ({len(group_counts):,} rows)")
