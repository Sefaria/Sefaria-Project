"""
Goal is to sample segments from our library and find places where we aren't matching citations
"""
import csv
import django
django.setup()
import logging, os

# Turn off Anthropic and HTTPX debug logs
os.environ["ANTHROPIC_LOG_LEVEL"] = "error"
os.environ["HTTPX_LOG_LEVEL"] = "error"

logging.getLogger("anthropic").setLevel(logging.ERROR)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
from sefaria.model import *
from sefaria.utils.hebrew import strip_cantillation
from scripts.linker_books.linker_books_utils import run_parallel
import random
import re
from tqdm import tqdm
import sys
from dataclasses import dataclass
from typing import Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import BaseOutputParser
from langchain_anthropic import ChatAnthropicMessages
csv.field_size_limit(sys.maxsize)

from langchain.globals import set_llm_cache
from langchain_community.cache import SQLiteCache

set_llm_cache(SQLiteCache(database_path=".langchain.db"))


def sample_segments():
    all_segment_refs = []

    def action(s, en_tref, he_tref, v):
        nonlocal all_segment_refs
        all_segment_refs.append({
            "Ref": en_tref,
            "VTitle": v.versionTitle,
            "Language": v.language,
            "Text": s,
        })
    for version in tqdm(VersionSet({}).array()):
        try:
            version.walk_thru_contents(action)
        except Exception as e:
            print("Skip", version.title, version.versionTitle)

    rows = random.sample(all_segment_refs, 100000)

    with open('../../data/private/all_segment_refs.csv', 'w') as fout:
        cout = csv.DictWriter(fout, fieldnames=rows[0].keys())
        cout.writeheader()
        cout.writerows(rows)


def batch_link(curr_linker, inputs, batch_size):
    all_docs = []
    for i in tqdm(list(range(0, len(inputs), batch_size))):
        curr_inputs = inputs[i:i+batch_size]
        curr_docs = curr_linker.bulk_link(curr_inputs, with_failures=True, type_filter='citation')
        all_docs += curr_docs
    return all_docs


def find_failed_resolutions():
    linker_map = {
        'en': library.get_linker('en'),
        'he': library.get_linker('he'),
    }
    inputs_by_lang = {'en': [], 'he': []}
    rows_by_lang = {'en': [], 'he': []}

    with open('../../data/private/all_segment_refs.csv', 'r') as fin:
        cin = csv.DictReader(fin)
        rows = list(cin)
    for row in rows:
        if row['Language'] == 'en':
            inputs_by_lang['en'].append(row['Text'])
            rows_by_lang['en'].append(row)
        else:
            inputs_by_lang['he'].append(row['Text'])
            rows_by_lang['he'].append(row)
    for lang in ('he',):
        out_rows = []
        docs = batch_link(linker_map[lang], inputs_by_lang[lang], 2000)
        for doc, row in zip(docs, rows_by_lang[lang]):
            for ref in doc.resolved_refs:
                if ref.resolution_failed:
                    ent = ref.raw_entity
                    start, end = ent.span.range
                    context = row['Text'][max(0, start - 20):end + 20]
                    out_rows.append({
                        'Ref': row['Ref'],
                        'VTitle': row['VTitle'],
                        'Language': row['Language'],
                        'Context': context,
                        'Resolution': ref.raw_entity.span.text,
                    })
        with open(f'../../data/private/failed_resolutions_{lang}.csv', 'w') as fout:
            cout = csv.DictWriter(fout, fieldnames=out_rows[0].keys())
            cout.writeheader()
            cout.writerows(out_rows)


def post_process_failed_resolutions():
    unique_citations = {}
    with open('../../data/private/failed_resolutions_en.csv', 'r') as fin:
        cin = csv.DictReader(fin)
        rows = list(cin)
    with open('../../data/private/failed_resolutions_he.csv', 'r') as fin:
        cin = csv.DictReader(fin)
        rows = rows + list(cin)
    for row in rows:
        cit = row['Resolution']
        cit = re.sub(r'<[^>]+>', ' ', cit).strip()
        if cit not in unique_citations:
            if re.search(r'\[.{2,4}]$', row["VTitle"].strip()):
                continue
            if "BDB" in row["Ref"] or "Jastrow" in row["Ref"]:
                continue
            short_cit = re.sub(r'[ ,:;v.V\-§]', '', cit)
            if len(short_cit) < 3 or re.match(r'[0-9ab]+$', short_cit):
                continue
            if len(strip_cantillation(cit, strip_vowels=True)) > 70:
                continue
            row['Resolution'] = cit
            unique_citations[cit] = row
    with open('../../data/private/failed_resolutions_unique.csv', 'w') as fout:
        cout = csv.DictWriter(fout, fieldnames=rows[0].keys())
        cout.writeheader()
        cout.writerows(unique_citations.values())


class YesNoParser(BaseOutputParser[str]):
    def parse(self, text: str) -> str:
        t = (text or "").strip().lower()
        # keep only first character that is y/n
        for ch in t:
            if ch in ("y", "n"):
                return ch
        # If model misbehaves, default to 'n'
        return "n"


def classify_citation(inn):
    citation, context = inn
    system_prompt = """
    You are a precise citation classifier for Jewish and general texts.
Input: (a) a raw citation string; (b) optional context (surrounding text).
Task: Return only one character:

y if the citation is fully qualified (contains all info needed for a reader to locate the exact passage without relying on earlier citations).

n if not fully qualified (including ibid/ibid-style, ambiguous, malformed, or not a citation).

What “fully qualified” means (corpus-aware rules)

A citation is fully qualified when it uniquely identifies the exact location in a standard reference system without relying on earlier text. Accept standard abbreviations and Hebrew/English variants when they are conventional and unambiguous. Nikud, punctuation, and parentheticals do not harm qualification.

General rules (apply to all corpora):
Must include the work/source name (or unambiguous standard abbreviation).
Ranges are okay only if the start point itself is fully qualified and the range belongs to the same work (e.g., “Bava Metzia 21a–22b” is y; “23:27–24:11” with no book is n).

“s.v.” (sub verbo / ד״ה) is okay only if the standard base location is complete (e.g., work + daf/side + s.v. “lemma”). Lemma alone is n.

Edition-dependent page numbers are y only when the work has a widely recognized canonical pagination (e.g., many classic sefarim/ journals with standard pageings). Otherwise, page-only without edition is n.

Ibid-style or dependency on earlier citations (always n):

“ibid.”, “ib.”, “idem”, “op. cit.”, “loc. cit.”

Hebrew equivalents: “שם”, “שם שם”, “כנ״ל”, “וכו׳” when they stand in place of full details

Bare ranges/follow-ons that assume a previous work mention (e.g., “23:27–24:11” without the work)

Not a citation (always n):

Dictionary/gloss entries, parts of speech, nouns with morphology (e.g., “חִזָּיוֹן m.n.”)

Generic phrases or entities (e.g., “CHILDREN OF ISRAEL”)

Work names alone with no locator (e.g., “Bava Metzia” without daf/side)

Pure section names without hierarchical context when that’s ambiguous (e.g., “Parashat Noach” by itself)

Language & formatting tolerance:

Accept Hebrew or English names, common abbreviations (e.g., “BM” for Bava Metzia), roman numerals for volumes, and Hebrew numerals/otiyot.

Ignore harmless punctuation, nikud, and diacritics.

Output format: Return exactly one character: y or n (lowercase, no quotes, no explanation).

Few-shot guidance (model must learn the labels):
citation="חִזָּיוֹן m.n.", context="" → n
citation="CHILDREN OF ISRAEL", context="" → n
citation="23:27–24:11", context="…" → n
citation="Elu Metziot (Bava Metzia 21a)", context="" → y
citation="Tur Choshen Mishpat section 228", context="" → y
citation="קובץ הערות סג, ג", context="" → y
Reminder: Decide only from the provided citation string itself (and the context string if present). Do not infer missing details from any “previous” citation not present in the input. Output only y or n.
    """

    user_prompt = """citation: {citation}
    context: {context}

    Return only one character: y or n.
    """

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            ("user", user_prompt),
        ]
    )
    llm = ChatAnthropicMessages(model="claude-sonnet-4-5-20250929", temperature=0)
    parser = YesNoParser()
    chain = prompt | llm | parser
    return chain.invoke({"citation": citation, "context": context})


def classify_all_citations():
    with open('../../data/private/failed_resolutions_unique.csv', 'r') as fin:
        cin = csv.DictReader(fin)
        rows = list(cin)
    classifier_input = [(row['Resolution'], row['Context']) for row in rows]
    results = run_parallel(classifier_input, classify_citation, 100)
    out_rows = [r[0] for r in filter(lambda r: r[1] == 'y', zip(rows, results))]
    with open('../../data/private/failed_resolutions_explicit_only.csv', 'w') as fout:
        cout = csv.DictWriter(fout, fieldnames=out_rows[0].keys())
        cout.writeheader()
        cout.writerows(out_rows)


def classify_index_of_citation():

    system_prompt = """
    You map noisy citations to the **canonical Sefaria English title** of the work.
    Return exactly one line containing either:
    - the exact Sefaria **index title** (canonical English title), or
    - UNKNOWN
    Do not add quotes, punctuation, or any extra text.

    Scope:
    - Input includes a raw `citation` string and optional `context`. Your job is to guess the work (book) only.
    - Ignore all locators (chapter/verse, siman, daf, se’if, ot, page, etc.). Identify the underlying work title.
    - Prefer the most specific Sefaria index title that corresponds to how Sefaria organizes the corpus:
      - For Talmudic tractates, return the tractate name (e.g., “Bava Metzia”).
      - For Tanakh, return the book (e.g., “Isaiah”).
      - For Shulchan Arukh or Tur, return “Shulchan Arukh, <Section>” or “Tur, <Section>”.
      - For Mishneh Torah, if the citation clearly names a specific Hilchot book with a standalone Sefaria index, return that index title (e.g., “Mishneh Torah, Repentance”). If unclear, return “Mishneh Torah”.
      - For Rambam’s **Sefer HaMitzvot**, return “Sefer HaMitzvot”.
      - For common standalones (e.g., “Zohar”, “Sefer HaChinukh”, “Kuzari”, “Moreh Nevukhim”/“Guide for the Perplexed”), return that canonical English title.
    - Accept Hebrew/English names, common abbreviations, and standard rabbinic shorthand:
      - רמב״ם → Rambam (Maimonides)
      - סה״מ, סהמ, ספר המצוות להרמב״ם → Sefer HaMitzvot
      - שו״ע / שולחן ערוך → Shulchan Arukh
      - טור → Tur
      - ב״מ / בבא מציעא → Bava Metzia
      - בב״ל / תלמוד בבלי + tractate → that tractate’s title
    - If multiple works are plausible and you cannot confidently pick the Sefaria title, output UNKNOWN.
    - If it’s not actually a citation/work name, output UNKNOWN.

    Output format:
    - Exactly the canonical Sefaria index title **or** UNKNOWN (uppercase), with no quotes or explanation.

    Few-shot guidance:
    - citation="בסה\"מ להרמב\"ם עשין ע\"ג" → Sefer HaMitzvot
    - citation="Elu Metziot (Bava Metzia 21a)" → Bava Metzia
    - citation="Tur Choshen Mishpat 228" → Tur, Choshen Mishpat
    - citation="Shulchan Aruch Yoreh De'ah 89:1" → Shulchan Arukh, Yoreh De'ah
    - citation="Hilchot Teshuva 3:4" (Rambam, unspecified) → Mishneh Torah, Repentance
    - citation="Guide III:17" → Guide for the Perplexed
    - citation="CHILDREN OF ISRAEL" → UNKNOWN
    - citation="חִזָּיוֹן m.n." → UNKNOWN
    """

    user_prompt = """citation: {citation}
    context: {context}

    Return only the canonical Sefaria English title or UNKNOWN.
    """

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM_PROMPT),
            ("user", USER_PROMPT),
        ]
    )

    # Use your existing `llm` object from above
    parser = StrOutputParser()
    guess_title_chain = prompt | llm | parser

    def guess_sefaria_title(citation: str, context: str = "") -> str:
        """
        Returns the canonical Sefaria English title (exact index title) or 'UNKNOWN'.
        """
        out = (guess_title_chain.invoke({"citation": citation, "context": context}) or "").strip()
        # Normalize accidental quotes/spaces just in case
        out = out.strip().strip('"').strip("'")
        if not out:
            return "UNKNOWN"
        # Keep a hard guard: if the model rambles, try to salvage first line, else UNKNOWN
        first = out.splitlines()[0].strip()
        return first if first and len(first.split()) < 20 else "UNKNOWN"


if __name__ == '__main__':
    # sample_segments()
    # find_failed_resolutions()
    # post_process_failed_resolutions()
    classify_all_citations()


"""
Make citations unique
remove HTML
"""
