from __future__ import annotations
from typing import List, Optional
from enum import Enum
from collections import Counter
import json
import csv
from tqdm import tqdm
from scripts.linker_books.linker_books_utils import run_parallel

from pydantic import BaseModel, Field, ValidationError
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI  # pip install langchain-openai
from langchain.globals import set_llm_cache
from langchain_community.cache import SQLiteCache

set_llm_cache(SQLiteCache(database_path=".langchain.db"))


# ---------------- Pydantic validation models ----------------

class Delimiter(str, Enum):
    NO_DELIM = "no delimiter"
    BOLD = "bold"
    DASH = "dash"
    PERIOD = "period"
    COLON = "colon"
    OTHER = "other"


class SnippetDecision(BaseModel):
    has_dibur: bool = Field(..., description="Whether the snippet contains a dibbur hamatchil.")
    delimiter: Delimiter = Field(..., description='One of: "no delimiter", "bold", "dash", "period", "colon", "other".')
    details: Optional[str] = Field(
        None, description='If delimiter is "other", briefly describe (e.g., quotes, colon).'
    )

# ---------------- Helper: final selection ----------------

def pick_final_delimiter(decisions: List[SnippetDecision]) -> Delimiter:
    labeled = [d.delimiter for d in decisions if d.has_dibur and d.delimiter != Delimiter.NO_DELIM]
    if not labeled:
        return Delimiter.NO_DELIM
    counts = Counter(labeled)
    # Most frequent; tie-break by earliest occurrence
    best = max(labeled, key=lambda x: (counts[x], -labeled.index(x)))
    return best

# ---------------- Prompt ----------------

SYSTEM = """You annotate Jewish commentaries.
For each snippet decide:
- has_dibur: true/false (does it have a dibbur hamatchil?)
- delimiter: one of "bold", "dash", "period", "colon", "no delimiter", "other"
- details: required only when delimiter="other" (e.g., quotes, colon)
Your final decision should be based on the majority of the 3 snippets.

Definitions:
- "bold": <b>…</b>, <strong>…</strong>, or **…** encloses the opening citation.
- "dash": —, –, or - separates the opening citation from the comment.
- "period": a period (.) clearly ends a short citation before the comment begins.
- "colon": a colon (:) clearly ends a short citation before the comment begins. Only use colon if it delimits the dibur hamatchil. if it's just the last character in the snippet, use "no delimiter".
- "no delimiter": no obvious dibbur hamatchil.
- "other": any other clear boundary (quotes, parentheses, brackets, colon, etc.).

If the snippet is just a list of citations with no commentary, use "no delimiter".

prefer "bold" > "dash" > "period" > "colon" > "other" > "no delimiter" when multiple delimiters are present.

Output STRICT JSON only in the following format, no prose:
  {{"has_dibur": true|false, "delimiter": "...", "details": "..."?}},
"""

USER = """Analyze exactly these 3 snippets and return a JSON object. See system message for definitions and output format. Below are the snippets:

[1] {s1}

[2] {s2}

[3] {s3}
"""

prompt = ChatPromptTemplate.from_messages([("system", SYSTEM), ("user", USER)])

# ---------------- Main entrypoint ----------------


def detect_dibur_delimiter(snippets: List[str], model_name: str = "gpt-4o"):
    if len(snippets) != 3:
        raise ValueError("Please provide exactly 3 snippets.")

    llm = ChatOpenAI(model=model_name, temperature=0.0).bind(
        response_format={"type": "json_object"}
    )

    msg = prompt.format_messages(s1=snippets[0], s2=snippets[1], s3=snippets[2])
    raw = llm.invoke(msg).content

    # Accept either a raw array or an object with a key holding the array
    try:
        data = json.loads(raw)
        if isinstance(data, dict):  # tolerate {"decisions":[...]}
            data = data.get("decisions", data.get("items", data.get("results", data.get("result", data))))
        if not isinstance(data, dict):
            raise ValueError("Model did not return a JSON dict.")
    except Exception as e:
        raise ValueError(f"Failed to parse model JSON: {e}\nRaw: {raw[:500]}")

    # Validate each item with Pydantic
    try:
        decision = SnippetDecision.model_validate(data)
    except ValidationError as ve:
        raise ValueError(f"Invalid decision structure: {ve}")

    return {
        "has_dibur": decision.has_dibur,
        "delimiter": decision.delimiter,
        "details": decision.details,
    }


def bulk_detect_dibur_delimiter():
    out_rows = []
    with open("../../data/private/commentary_on.csv", "r") as fin:
        cin = list(csv.DictReader(fin))
        snippet_input = [[
            row['Sample Text 1'][:200],
            row['Sample Text 2'][:200],
            row['Sample Text 3'][:200],
        ] for row in cin]
        results = run_parallel(snippet_input, detect_dibur_delimiter, 50, desc="Detecting delimiters")
        for result, row in zip(results, cin):
            out_rows.append({
                "Title": row['Title'],
                "Delimiter": result['delimiter'],
                "Has Dibur": result['has_dibur'],
                "Details": result.get('details', ''),
            })
    with open("../../data/private/commentary_on_delimiters.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=out_rows[0].keys())
        cout.writeheader()
        cout.writerows(out_rows)
# ---------------- Example ----------------
def example():
    snippets = [
        '... <b>ויאמר ה׳ אל משה</b> מלמד שמדבר עמו בלשון ...',
        'ויאמר פרעה — פירוש, שכיוון ...',
        'בפירוש זה המחבר מאריך לבאר עניין המצוה ...',
    ]
    result = detect_dibur_delimiter(snippets)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    # example()
    bulk_detect_dibur_delimiter()
