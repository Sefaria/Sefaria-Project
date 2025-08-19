# Commentary Scoring – README

**LLM-powered relevance scoring for Quoting Commentary links in Sefaria.**

This code discovers commentary–base-text pairs, asks an LLM to score how well each commentary explains the base text it cites, and then persists the score to `db.links.relevance_score`. It also supports bulk runs, single-link runs, and optional logging of LLM explanations.

---

## 📂 What’s in here

llm/
├─ tasks/\
│ └─ commentary_scoring.py # Celery task + producer that triggers LLM scoring and persists results\
├─ commentary_scoring.py # Interface: builds inputs, extracts texts, saves outputs (+ optional JSONL log)\
├─ commentary_scoring_all.py # CLI to scan DB and score all quoting-commentary refs\
├─ commentary_scoring_single.py # Helpers to score one link or all links under a specific base ref \
└─ commentary_scoring_tools.py # Utility: parse a link and return (commentary_ref, base_ref)


---

## 📦 Data model (IO)

### **Input to the LLM worker**

`CommentaryScoringInput` (from `sefaria_llm_interface.commentary_scoring`):

- `commentary_text: str` – full text of the commentary segment  
- `commentary_ref: str` – normalized ref of the commentary segment  
- `cited_refs: Dict[str, str]` – mapping `{base_ref_normalized: base_ref_text}`  

Built by: `make_commentary_scoring_input(commentary_ref: str)` in `llm/commentary_scoring.py`

---

### **Output from the LLM worker**

`CommentaryScoringOutput` (from `sefaria_llm_interface.commentary_scoring`):

- `commentary_ref: str`  
- `processed_datetime: str (ISO)`  
- `request_status: int` (non-zero ⇒ success)  
- `request_status_message: str`  
- `ref_scores: Dict[str, int]` – per cited base ref, relevance 0/1  
- `scores_explanation: Dict[str, str]` – per base ref, short rationale  

Persisted by: `save_commentary_scoring_output(...)` in `llm/commentary_scoring.py`

---

## ⚙️ Behavior

- For each `cited_ref_str`, finds the corresponding `db.links` document with `refs: {"$all":[commentary_ref, cited_ref_str]}` and sets `relevance_score`.
- When `save_score_explanations=True`, appends explanations to `commentary_scoring_logs/commentary_scoring.jsonl`.


---

## 🔁 Celery Flow

**Enqueues** `'llm.score_commentary'` on queue `llm` with the serialized `CommentaryScoringInput`.  
**Chains** to local task `'web.save_commentary_score'` on queue `tasks`.

### **Consumer Flow**
- `llm.score_commentary` (external LLM worker) returns a `CommentaryScoringOutput`-shaped `dict`.
- `web.save_commentary_score` (defined here) validates & persists it.

---

## 🧵 Task Names & Queues

| **Task**                   | **Queue** |
|---------------------------|-----------|
| `llm.score_commentary`    | `llm`     |
| `web.save_commentary_score` | `tasks` |


## 🛠️ Scripts & How to Run

### 1. Score One Specific Link by ObjectId

Useful for retries or debugging:

```python
from commentary_scoring_single import grade_single_link
grade_single_link("4fde272eedbab43f7f000022", force_update=True)
```

What it does:
- Finds the db.links doc by _id 
- Determines (commentary_ref, base_ref) via parse_link_for_base 
- Skips if relevance_score exists (unless force_update=True)
- Calls generate_and_save_commentary_scoring(commentary_ref)

### 2. Score All Quoting-Commentary Links Under a Base Ref
```python
from commentary_scoring_single import grade_sefaria_commentary_links_optimized
grade_sefaria_commentary_links_optimized("Exodus 6:14", force_update=False)
```
What it does:
- Pulls all "Quoting Commentary" links for the given base ref 
- Sends each commentary segment for scoring (respects force_update)

### 3. Bulk Run Across the Whole DB
```python
python commentary_scoring_all.py \
  --force-update        # optional  
  --limit 1000          # optional: cap number of unique commentary refs  
  --dry-run             # optional: scan only, don’t enqueue  
  --sleep 0.1           # optional: throttle between enqueues  
```
What it does:
- Scans db.links where exactly one side is a commentary 
- Gathers unique commentary_refs 
- Skips already scored refs (unless --force-update)
- Calls generate_and_save_commentary_scoring(...) per ref

## 📝 Logging

- **File:** `commentary_scoring_logs/commentary_scoring.jsonl`  
- **Condition:** Written only if `save_score_explanations=True`

**Each line includes:**
- `commentary_ref`
- `processed_datetime`
- `request_status`
- `request_status_message`
- `explanations: {base_ref: explanation_text}` (only for newly updated refs)

---

## ✅ Things to Improve 

### `llm/commentary_scoring.py`
- `save_commentary_scoring_output(result: CommentaryScoringOutput, save_score_explanations: bool) -> bool` Logs score explanations to log file 

### `llm/commentary_scoring_all.py`
- `iter_all_quoting_commentary_refs(limit: Optional[int] = None) -> Set[str]` may score commentaries which are not of the type "Quoting"

---