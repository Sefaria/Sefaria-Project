"""
Visualizations for the "Old vs New Bavli" disambiguator post-analysis.
Reads disambiguator_analysis/Disambiguator Post Analysis - Old vs New Bavli.csv
and outputs PNGs to the same dir.
No Django required — run directly: python scripts/visualize_bavli_post_analysis.py
"""
import csv
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

INPUT_DIR = os.path.join(os.path.dirname(__file__), "../disambiguator_analysis")
OUTPUT_DIR = INPUT_DIR
CSV_NAME = "Disambiguator Post Analysis - Old vs New Bavli.csv"


def load_rows() -> list[dict]:
    rows = []
    with open(os.path.join(INPUT_DIR, CSV_NAME)) as f:
        for r in csv.DictReader(f):
            rows.append({
                "title": r["title"],
                "old": int(r["old links"].replace(",", "")),
                "added": int(r["added links"].replace(",", "")),
                "modified": int(r["modified links"].replace(",", "")),
                "total": int(r["total added+modified"].replace(",", "")),
            })
    return rows


# ── 1. Top contributors by total added+modified ──────────────────────────────

def viz_top_contributors(rows: list[dict], n: int = 25):
    top = sorted(rows, key=lambda r: r["total"], reverse=True)[:n][::-1]
    titles = [r["title"] for r in top]
    totals = [r["total"] for r in top]
    grand_total = sum(r["total"] for r in rows)

    fig, ax = plt.subplots(figsize=(12, 10))
    bars = ax.barh(titles, totals, color=plt.cm.viridis(np.linspace(0.85, 0.15, len(titles))))
    for bar, val in zip(bars, totals):
        ax.text(bar.get_width() + max(totals) * 0.005, bar.get_y() + bar.get_height() / 2,
                f"{val:,}", va="center", fontsize=8)

    ax.set_xlabel("New + modified links to Bavli", fontsize=12)
    ax.set_title(
        f"Top {n} Contributors of New/Modified Links to Bavli\n"
        f"Disambiguator added or modified {grand_total:,} links to Bavli across {len(rows):,} works",
        fontsize=13,
    )
    plt.tight_layout()
    out = os.path.join(OUTPUT_DIR, "bavli_top_contributors.png")
    plt.savefig(out, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  {out}")


# ── 2. Top contributors split into newly-added vs. modified-existing ─────────

def viz_added_vs_modified(rows: list[dict], n: int = 20):
    top = sorted(rows, key=lambda r: r["total"], reverse=True)[:n][::-1]
    titles = [r["title"] for r in top]
    added = np.array([r["added"] for r in top])
    modified = np.array([r["modified"] for r in top])
    totals = added + modified

    fig, ax = plt.subplots(figsize=(12, 10))
    ax.barh(titles, added, label="Newly added links", color="#4C72B0")
    ax.barh(titles, modified, left=added, label="Modified existing links", color="#DD8452")
    for i, total in enumerate(totals):
        ax.text(total + totals.max() * 0.005, i, f"{total:,}", va="center", fontsize=8)

    ax.set_xlabel("Links to Bavli", fontsize=12)
    ax.set_title(f"Top {n} Works: New vs. Modified Links to Bavli", fontsize=13)
    ax.legend(loc="lower right", fontsize=10)
    plt.tight_layout()
    out = os.path.join(OUTPUT_DIR, "bavli_added_vs_modified.png")
    plt.savefig(out, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  {out}")


# ── 3. Top contributors by relative growth (% of pre-existing links) ─────────

def viz_growth_pct(rows: list[dict], n: int = 20, min_old: int = 100):
    candidates = [r for r in rows if r["old"] >= min_old]
    for r in candidates:
        r["pct"] = r["total"] / r["old"] * 100
    top = sorted(candidates, key=lambda r: r["pct"], reverse=True)[:n][::-1]

    titles = [r["title"] for r in top]
    pcts = [r["pct"] for r in top]

    fig, ax = plt.subplots(figsize=(12, 10))
    bars = ax.barh(titles, pcts, color=plt.cm.magma(np.linspace(0.75, 0.25, len(titles))))
    for bar, r in zip(bars, top):
        ax.text(bar.get_width() + max(pcts) * 0.01, bar.get_y() + bar.get_height() / 2,
                f"+{r['pct']:.0f}%  ({r['total']:,} new/mod. of {r['old']:,} old)",
                va="center", fontsize=8)

    ax.set_xlabel("Growth in links to Bavli (% of pre-disambiguator total)", fontsize=12)
    ax.set_title(
        f"Top {n} Works by Relative Growth in Bavli Links\n"
        f"(works with ≥{min_old:,} pre-existing links to Bavli)",
        fontsize=13,
    )
    plt.tight_layout()
    out = os.path.join(OUTPUT_DIR, "bavli_growth_pct.png")
    plt.savefig(out, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  {out}")


if __name__ == "__main__":
    rows = load_rows()
    print("Generating Bavli post-analysis visualizations...")
    print("1/3 top contributors"); viz_top_contributors(rows)
    print("2/3 added vs modified"); viz_added_vs_modified(rows)
    print("3/3 growth pct"); viz_growth_pct(rows)
    print(f"\nDone. PNGs in {OUTPUT_DIR}")
