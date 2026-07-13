"""
Analyze the linker_disambiguation_tmp collection.
All outputs are CSV files in disambiguator_analysis/.
"""
import csv
import os
import sys
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
django.setup()

from sefaria.model import library, Ref
from sefaria.system.database import db
from sefaria.helper.linker.disambiguator import _normalize_for_llm
from collections import Counter, defaultdict
import tqdm

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "../disambiguator_analysis")
os.makedirs(OUTPUT_DIR, exist_ok=True)

coll = db.linker_disambiguation_tmp
links_coll = db.links


# ── 1. Load all mutc docs and build deduped (source_ref, target_ref) pairs ──

print("Loading mutc docs...")
# Dedup: same source ref contributing to the same target ref counts once.
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
        mutc_pairs.add((source, target))

print(f"  Unique (source, target) pairs: {len(mutc_pairs):,}")

# Count resolutions per target ref
target_counter = Counter(t for _, t in mutc_pairs)


CAULDRON = "https://disambig3.cauldron.sefaria.org"

def cauldron_url(ref_str: str) -> str:
    try:
        return f"{CAULDRON}/{Ref(ref_str).url()}"
    except Exception:
        return ""


def get_segment_texts(ref_str: str):
    """Return (he_text, en_text) normalized via the linker normalizer."""
    try:
        r = Ref(ref_str)
        he = _normalize_for_llm(r.text("he").text, lang="he") or ""
        en = _normalize_for_llm(r.text("en").text, lang="en") or ""
        # text() may return a list for some refs — flatten to string
        if isinstance(he, list):
            he = " ".join(he) if he else ""
        if isinstance(en, list):
            en = " ".join(en) if en else ""
        return he, en
    except Exception:
        return "", ""


# ── 2. Build existing link counter (raw docs → Counter) ─────────────────────

print("\nLoading existing links...")
link_counter = Counter()  # ref_str -> number of links
link_total = links_coll.count_documents({})
cursor = links_coll.find({}, {"refs": 1})
for doc in tqdm.tqdm(cursor, total=link_total, desc="link docs"):
    for r in doc.get("refs") or []:
        link_counter[r] += 1

print(f"  Loaded {sum(link_counter.values()):,} ref-mentions across {link_total:,} links")


# ── 3. Top 1000 refs resolved to ────────────────────────────────────────────

print("\nWriting top_1000_resolved_refs.csv...")
top_1000 = target_counter.most_common(1000)
out = os.path.join(OUTPUT_DIR, "top_1000_resolved_refs.csv")
with open(out, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["rank", "target_ref", "resolution_count", "existing_links", "he_text", "en_text", "cauldron_url"])
    for rank, (ref, cnt) in enumerate(tqdm.tqdm(top_1000, desc="fetching texts"), 1):
        existing = link_counter.get(ref, 0)
        he, en = get_segment_texts(ref)
        w.writerow([rank, ref, cnt, existing, he, en, cauldron_url(ref)])
print(f"  Wrote {out}")


# ── 4. Top 1000 by link increase ────────────────────────────────────────────

print("\nWriting top_1000_link_increase.csv...")
rows = []
for target_ref, new_cnt in target_counter.items():
    existing = link_counter.get(target_ref, 0)
    rows.append((target_ref, existing, new_cnt, existing + new_cnt))

rows.sort(key=lambda r: r[2], reverse=True)

out = os.path.join(OUTPUT_DIR, "top_1000_link_increase.csv")
with open(out, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["rank", "target_ref", "existing_links", "new_links", "total_after", "cauldron_url"])
    for rank, (ref, existing, new_cnt, total) in enumerate(rows[:1000], 1):
        w.writerow([rank, ref, existing, new_cnt, total, cauldron_url(ref)])
print(f"  Wrote {out}")


# ── 5. Category / book helpers ───────────────────────────────────────────────

_book_cache: dict = {}
_cat_cache: dict = {}


def get_book(ref_str: str) -> str:
    if ref_str not in _book_cache:
        try:
            _book_cache[ref_str] = Ref(ref_str).index.title
        except Exception:
            _book_cache[ref_str] = "[error]"
    return _book_cache[ref_str]


def get_search_category(book: str) -> str:
    """Return a search-style category that distinguishes commentaries from base texts
    and Bavli from Yerushalmi."""
    if book not in _cat_cache:
        try:
            idx = library.get_index(book)
            primary = idx.get_primary_category()
            cats = idx.categories

            if primary == "Commentary":
                bt = getattr(idx, "base_text_titles", None)
                if bt:
                    try:
                        base_idx = library.get_index(bt[0])
                        base_primary = base_idx.get_primary_category()
                        base_cats = base_idx.categories
                        if base_primary == "Talmud" and len(base_cats) >= 2:
                            _cat_cache[book] = f"Talmud {base_cats[1]} Commentaries"
                        else:
                            _cat_cache[book] = f"{base_primary} Commentaries"
                        return _cat_cache[book]
                    except Exception:
                        pass
                # Fallback: infer from commentary's own categories
                if cats and len(cats) >= 2:
                    if cats[0] == "Talmud" and len(cats) >= 2:
                        _cat_cache[book] = f"Talmud {cats[1]} Commentaries"
                    else:
                        _cat_cache[book] = f"{cats[0]} Commentaries"
                else:
                    _cat_cache[book] = "Commentaries"
            elif primary == "Talmud" and len(cats) >= 2:
                _cat_cache[book] = f"Talmud {cats[1]}"
            else:
                _cat_cache[book] = primary or "Unknown"
        except Exception:
            _cat_cache[book] = "Unknown"
    return _cat_cache[book]


# ── 6. Resolutions by book ───────────────────────────────────────────────────

print("\nBuilding book and category counts...")
book_counter: Counter = Counter()
cat_counter: Counter = Counter()

unique_targets = set(t for _, t in mutc_pairs)
unique_sources = set(s for s, _ in mutc_pairs)

# Pre-warm book cache for all unique refs (sources + targets)
all_unique_refs = unique_targets | unique_sources
for ref_str in tqdm.tqdm(all_unique_refs, desc="parsing refs"):
    get_book(ref_str)

# Pre-warm category cache for all unique books
unique_books = set(_book_cache.values()) - {"[error]"}
for book in tqdm.tqdm(unique_books, desc="looking up categories"):
    get_search_category(book)

# Now tally counts
for source, target in tqdm.tqdm(mutc_pairs, desc="tallying pairs"):
    target_book = _book_cache.get(target, "[error]")
    book_counter[target_book] += 1
    cat_counter[get_search_category(target_book)] += 1

print(f"  Unique target books:   {len(book_counter):,}")
print(f"  Unique categories:     {len(cat_counter):,}")


# ── 7. Write resolutions_by_book.csv ────────────────────────────────────────

out = os.path.join(OUTPUT_DIR, "resolutions_by_book.csv")
with open(out, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["book", "resolution_count"])
    for book, cnt in book_counter.most_common():
        w.writerow([book, cnt])
print(f"\nWrote {out} ({len(book_counter)} rows)")


# ── 8. Write resolutions_by_category.csv ────────────────────────────────────

out = os.path.join(OUTPUT_DIR, "resolutions_by_category.csv")
with open(out, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["category", "resolution_count"])
    for cat, cnt in cat_counter.most_common():
        w.writerow([cat, cnt])
print(f"Wrote {out} ({len(cat_counter)} rows)")


# ── 9. Resolutions to Bavli and Yerushalmi books ────────────────────────────

print("\nWriting resolutions_by_talmud_book.csv (Bavli + Yerushalmi targets)...")
talmud_rows = []
for book, cnt in book_counter.items():
    cat = get_search_category(book)
    if cat in ("Talmud Bavli", "Talmud Yerushalmi"):
        talmud_rows.append((book, cat, cnt))

talmud_rows.sort(key=lambda r: r[2], reverse=True)

out = os.path.join(OUTPUT_DIR, "resolutions_by_talmud_book.csv")
with open(out, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["book", "talmud", "resolution_count"])
    for book, cat, cnt in talmud_rows:
        talmud_label = "Bavli" if cat == "Talmud Bavli" else "Yerushalmi"
        w.writerow([book, talmud_label, cnt])
print(f"Wrote {out} ({len(talmud_rows)} rows)")


print("\nDone. All CSVs in", OUTPUT_DIR)
