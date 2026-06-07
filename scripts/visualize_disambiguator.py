"""
Visualizations of disambiguator analysis data.
Reads CSVs from disambiguator_analysis/ and outputs PNGs to the same dir.
No Django required — run directly: python scripts/visualize_disambiguator.py
"""
import csv
import os
from collections import Counter, defaultdict

import matplotlib
matplotlib.use("Agg")
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import numpy as np

INPUT_DIR = os.path.join(os.path.dirname(__file__), "../disambiguator_analysis")
OUTPUT_DIR = INPUT_DIR


def load_csv(name: str) -> list[dict]:
    with open(os.path.join(INPUT_DIR, name)) as f:
        return list(csv.DictReader(f))


def load_metadata() -> dict[str, dict]:
    """Returns {book: {primary_category, collective_title, word_count}}."""
    return {r["book"]: r for r in load_csv("book_metadata.csv")}


def is_commentary(book: str, meta: dict[str, dict]) -> bool:
    return "Commentaries" in meta.get(book, {}).get("primary_category", "")


def group_name(book: str, meta: dict[str, dict]) -> str:
    ct = meta.get(book, {}).get("collective_title", "")
    return ct if ct else book


def word_count(book: str, meta: dict[str, dict]) -> int:
    return int(meta.get(book, {}).get("word_count", 0) or 0)


# ── Donut helper ─────────────────────────────────────────────────────────────

def _donut_ax(ax, labels: list, sizes: list, title: str, unit: str = ""):
    N_SHOW = 20
    paired = sorted(zip(sizes, labels), reverse=True)
    sizes_s = [p[0] for p in paired]
    labels_s = [p[1] for p in paired]

    if len(labels_s) > N_SHOW:
        other = sum(sizes_s[N_SHOW:])
        labels_s = labels_s[:N_SHOW] + ["Other"]
        sizes_s = sizes_s[:N_SHOW] + [other]

    colors = plt.cm.tab20c(np.linspace(0, 1, len(labels_s)))
    wedges, _ = ax.pie(
        sizes_s,
        labels=None,
        startangle=90,
        colors=colors,
        wedgeprops=dict(width=0.5),
    )
    legend_labels = [
        f"{l}  ({s:,.1f}{unit})" for l, s in zip(labels_s, sizes_s)
    ]
    ax.legend(
        wedges, legend_labels,
        loc="center left", bbox_to_anchor=(1.0, 0.5),
        fontsize=7.5, frameon=False,
    )
    ax.set_title(title, fontsize=10, pad=8)


# ── 1 + 2 + 3. Four donut charts (2×2 grid) ──────────────────────────────────

def viz_donuts():
    pairs = load_csv("book_pair_matrix.csv")
    talmud_rows = load_csv("resolutions_by_talmud_book.csv")
    meta = load_metadata()

    talmud_books = {r["book"] for r in talmud_rows}

    # Accumulators
    non_comm_raw: Counter = Counter()   # book -> raw count
    comm_raw: Counter = Counter()       # collective_title -> raw count

    for r in pairs:
        src, tgt, cnt = r["source_book"], r["target_book"], int(r["count"])
        if tgt not in talmud_books:
            continue
        g = group_name(src, meta)
        if is_commentary(src, meta):
            comm_raw[g] += cnt
        else:
            non_comm_raw[src] += cnt

    # Word-count maps for normalization
    non_comm_wc: dict[str, int] = {b: word_count(b, meta) for b in non_comm_raw}

    # For commentary groups: sum word counts of all member books
    comm_wc: Counter = Counter()
    for book, info in meta.items():
        if is_commentary(book, meta):
            g = group_name(book, meta)
            comm_wc[g] += int(info.get("word_count", 0) or 0)

    fig, axes = plt.subplots(2, 2, figsize=(22, 16))
    fig.suptitle("Citations Added to Talmud by Source", fontsize=14, y=1.01)

    # Row 0: raw counts
    _donut_ax(
        axes[0, 0],
        list(non_comm_raw.keys()), list(non_comm_raw.values()),
        "Non-commentaries → Talmud\n(raw new links)",
    )
    _donut_ax(
        axes[0, 1],
        list(comm_raw.keys()), list(comm_raw.values()),
        "Commentaries → Talmud\n(raw new links, grouped by collective title)",
    )

    # Row 1: normalized by word count
    nc_norm_labels, nc_norm_sizes = [], []
    for book, cnt in non_comm_raw.items():
        wc = non_comm_wc.get(book, 0)
        if wc > 0:
            nc_norm_labels.append(book)
            nc_norm_sizes.append(cnt / wc * 1000)

    c_norm_labels, c_norm_sizes = [], []
    for g, cnt in comm_raw.items():
        wc = comm_wc.get(g, 0)
        if wc > 0:
            c_norm_labels.append(g)
            c_norm_sizes.append(cnt / wc * 1000)

    _donut_ax(
        axes[1, 0],
        nc_norm_labels, nc_norm_sizes,
        "Non-commentaries → Talmud\n(per 1,000 Hebrew words)",
        unit="",
    )
    _donut_ax(
        axes[1, 1],
        c_norm_labels, c_norm_sizes,
        "Commentaries → Talmud\n(per 1,000 Hebrew words, by collective title)",
        unit="",
    )

    if not nc_norm_labels:
        axes[1, 0].text(0, 0, "word_count data unavailable", ha="center", va="center")
    if not c_norm_labels:
        axes[1, 1].text(0, 0, "word_count data unavailable", ha="center", va="center")

    plt.tight_layout()
    out = os.path.join(OUTPUT_DIR, "donuts_talmud_citations.png")
    plt.savefig(out, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  {out}")


# ── 4. Heatmap: commentary × commentary (by collective_title) ────────────────

def viz_heatmap(n_groups: int = 30):
    import pandas as pd
    import seaborn as sns

    pairs_df = pd.DataFrame(load_csv("book_pair_matrix.csv"))
    pairs_df["count"] = pairs_df["count"].astype(int)
    meta = load_metadata()

    pairs_df = pairs_df[
        pairs_df["source_book"].map(lambda b: is_commentary(b, meta)) &
        pairs_df["target_book"].map(lambda b: is_commentary(b, meta))
    ]

    if pairs_df.empty:
        print("  No commentary→commentary pairs found; skipping heatmap.")
        return

    pairs_df["source_group"] = pairs_df["source_book"].map(lambda b: group_name(b, meta))
    pairs_df["target_group"] = pairs_df["target_book"].map(lambda b: group_name(b, meta))

    agg = pairs_df.groupby(["source_group", "target_group"])["count"].sum().reset_index()

    src_totals = agg.groupby("source_group")["count"].sum()
    tgt_totals = agg.groupby("target_group")["count"].sum()
    combined = src_totals.add(tgt_totals, fill_value=0).sort_values(ascending=False)
    top_groups = combined.head(n_groups).index.tolist()

    agg = agg[agg["source_group"].isin(top_groups) & agg["target_group"].isin(top_groups)]
    matrix = agg.pivot_table(
        index="source_group", columns="target_group", values="count", fill_value=0
    )
    matrix = matrix.reindex(index=top_groups, columns=top_groups, fill_value=0)

    fig, ax = plt.subplots(figsize=(18, 16))
    sns.heatmap(
        np.log1p(matrix.values),
        ax=ax,
        cmap="YlOrRd",
        xticklabels=top_groups,
        yticklabels=top_groups,
        linewidths=0.2,
        linecolor="white",
        cbar_kws={"label": "log(1 + count)"},
    )
    ax.set_xlabel("Target Commentary (cited)", fontsize=12, labelpad=10)
    ax.set_ylabel("Source Commentary (cites)", fontsize=12, labelpad=10)
    ax.set_title(
        f"How Commentaries Cite Each Other  (top {n_groups} by collective title, log scale)",
        fontsize=14, pad=16,
    )
    plt.xticks(rotation=45, ha="right", fontsize=8)
    plt.yticks(rotation=0, fontsize=8)
    plt.tight_layout()

    out = os.path.join(OUTPUT_DIR, "heatmap_commentary_pairs.png")
    plt.savefig(out, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  {out}")


# ── 5. Scatter: existing vs. new links, grouped by collective_title ───────────

def viz_scatter():
    from matplotlib.colors import LogNorm

    rows = load_csv("new_vs_existing_per_book.csv")
    meta = load_metadata()

    # Aggregate by collective_title (or book if no collective_title)
    group_new: Counter = Counter()
    group_existing: Counter = Counter()
    for r in rows:
        n = int(r["new_links"])
        e = int(r["existing_links"])
        if n == 0:
            continue
        g = group_name(r["book"], meta)
        group_new[g] += n
        group_existing[g] += e

    groups = list(group_new.keys())
    new_links = [group_new[g] for g in groups]
    existing = [group_existing[g] for g in groups]

    fig, ax = plt.subplots(figsize=(14, 10))

    sc = ax.scatter(
        [e + 1 for e in existing],
        new_links,
        alpha=0.65,
        s=45,
        c=new_links,
        cmap="plasma",
        norm=LogNorm(vmin=1, vmax=max(new_links)),
        zorder=3,
    )

    lim_max = max(max(existing) + 1, max(new_links)) * 2
    ax.plot([1, lim_max], [1, lim_max], "k--", alpha=0.25, linewidth=1, label="New = Existing")

    # Label top 20 by new / (existing + 1) ratio
    ratios = [new_links[i] / (existing[i] + 1) for i in range(len(groups))]
    top_idx = sorted(range(len(ratios)), key=lambda i: ratios[i], reverse=True)[:20]
    for i in top_idx:
        ax.annotate(
            groups[i],
            (existing[i] + 1, new_links[i]),
            fontsize=6.5,
            xytext=(5, 3),
            textcoords="offset points",
            color="#333333",
        )

    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Existing links (before disambiguator)  [log scale]", fontsize=12)
    ax.set_ylabel("New links added by disambiguator  [log scale]", fontsize=12)
    ax.set_title(
        "Works: Existing vs. New Links  (grouped by collective title)\n"
        "Upper-left = newly illuminated by disambiguator",
        fontsize=13,
    )
    ax.legend(fontsize=10)
    plt.colorbar(sc, ax=ax, label="New link count")
    plt.tight_layout()

    out = os.path.join(OUTPUT_DIR, "scatter_dark_to_light.png")
    plt.savefig(out, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  {out}")


# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Generating visualizations...")
    print("1/3 donuts");  viz_donuts()
    print("2/3 heatmap"); viz_heatmap()
    print("3/3 scatter"); viz_scatter()
    print(f"\nDone. PNGs in {OUTPUT_DIR}")
