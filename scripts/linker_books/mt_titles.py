import re

import django
django.setup()
from sefaria.model import *
import csv
from tqdm import tqdm
from langchain.prompts import ChatPromptTemplate
from langchain_anthropic import ChatAnthropicMessages
from scripts.linker_books.linker_books_utils import run_parallel

from langchain.globals import set_llm_cache
from langchain_community.cache import SQLiteCache

set_llm_cache(SQLiteCache(database_path=".langchain.db"))


def get_corresponding_title(title):
    prompt = ChatPromptTemplate.from_template("""
    You are an expert on the Mishneh Torah and on the structure of Sefaria’s canonical titles.

    You are given:
    - A list of the canonical Mishneh Torah book titles on Sefaria.
    - A new title that may be a variant, alternate spelling, or translation of one of them.

    Your goal:
    Return **only** the exact canonical title from the list that best matches the new title.
    Do not explain your reasoning or output multiple candidates — return just the single canonical title.

    If there is no plausible match, return "No match".

    Canonical Sefaria titles:
    {sefaria_titles}

    New title to match:
    "{new_title}"

    Respond with exactly one of the canonical titles (or "No match").
    """)
    llm = ChatAnthropicMessages(model="claude-sonnet-4-5-20250929", temperature=0)

    sefaria_titles = [title.replace("Mishneh Torah, ", "") for title in library.get_indexes_in_category_path(["Halakhah", "Mishneh Torah"]) if title.startswith("Mishneh Torah")]

    response = llm.invoke(prompt.format_messages(
        sefaria_titles="\n".join(sefaria_titles),
        new_title=title
    ))

    return response.content



def run():
    """
    Loop through all english Mishneh Torah indexes and look for the words "<i>Hilchot (.*)</i>"
    Save all of these to a CSV
    :return:
    """
    rows = []

    def action(s, en_tref, he_tref, v):
        nonlocal rows
        for match in re.finditer("<i>Hilchot ([ a-zA-Z'\-]+)", s):
            rows.append({
                "Ref": en_tref,
                "Hilchot": match.group(1)
            })

    for index in tqdm(library.get_indexes_in_category_path(["Halakhah", "Mishneh Torah"], full_records=True)):
        if not index.title.startswith("Mishneh Torah"): continue
        version = Version().load({"title": index.title, "language": "en", "versionTitle": "Mishneh Torah, trans. by Eliyahu Touger. Jerusalem, Moznaim Pub. c1986-c2007"})
        if not version:
            continue
        version.walk_thru_contents(action)
    with open("/Users/nss/sefaria/project/data/private/mt_en_hilchot.csv", "w") as fout:
        cin = csv.DictWriter(fout, ["Ref", "Text", "Hilchot"])
        cin.writeheader()
        cin.writerows(rows)


def match_titles():
    out_rows = []
    with open("/Users/nss/sefaria/project/data/private/Untitled spreadsheet - Sheet2.csv", "r") as fin:
        cin = csv.DictReader(fin)
        titles = [row["Title"] for row in cin]
        matching_titles = run_parallel(titles, get_corresponding_title, 25)
        for title, match in zip(titles, matching_titles):
            out_rows.append({
                "Sefaria": "Mishneh Torah, " + match,
                "Other": title
            })
    with open("/Users/nss/sefaria/project/data/private/mt_title_matches.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=out_rows[0].keys())
        cout.writeheader()
        cout.writerows(out_rows)


def import_mt_titles():
    from collections import defaultdict
    by_title = defaultdict(list)
    with open("/Users/nss/sefaria/project/data/private/mt_title_matches.csv", "r") as fin:
        cin = csv.DictReader(fin)
        for row in cin:
            by_title[row["Sefaria"]].append(row["Other"])
    for sefaria_title, other_titles in by_title.items():
        if "No match" in sefaria_title: continue
        index = library.get_index(sefaria_title)
        if not index:
            print(f"Could not find index for {sefaria_title}")
            continue
        slug = list(list(index.nodes.get_match_templates())[0].get_terms())[-1].slug
        print(slug)
        term = NonUniqueTerm.init(slug)
        for title in other_titles:
            term.add_title(title, "en")
        term.save()
        print(f"Saved alt titles for {sefaria_title}: {', '.join(other_titles)}")




if __name__ == "__main__":
    # run()
    # match_titles()
    import_mt_titles()
