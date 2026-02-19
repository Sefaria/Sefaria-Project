"""
Commentary Scoring Interface for Sefaria
"""

import os
import logging
import sys
import pathlib
from typing import Any, Dict, List, Optional
import django
import json
import os
from pathlib import Path
from sefaria.system.database import db
from datetime import datetime
import json
from pathlib import Path
from collections import defaultdict
from sefaria.model import Ref
from sefaria_llm_interface.commentary_scoring import (
    CommentaryScoringInput,
    CommentaryScoringOutput,
)

logger = logging.getLogger(__name__)

LOG_DIR = Path("commentary_scoring_logs")
LOG_FILE = LOG_DIR / "commentary_scoring.jsonl"
LOG_DIR.mkdir(exist_ok=True)


def _build_log_index():
    """
    Build an index of what's already logged:
    { commentary_ref: { cited_ref_norm, ... } }
    """
    idx = defaultdict(set)
    if LOG_FILE.exists():
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                cref = obj.get("commentary_ref")
                if not cref:
                    continue
                for cited in (obj.get("explanations") or {}).keys():
                    try:
                        idx[cref].add(Ref(cited).normal())
                    except Exception:
                        idx[cref].add(cited)  # fall back to raw
    return idx


def extract_text_from_ref(ref: Ref, prefer_english: bool = True) -> Optional[
    str]:
    """
    Extract text from a Sefaria reference, with language preference.
    """
    if ref.is_empty():
        logger.warning(f"Ref is empty {ref}")
        return None

    primary_lang = 'en' if prefer_english else 'he'
    fallback_lang = 'he' if prefer_english else 'en'

    def process_text(text) -> Optional[str]:
        """Helper function to handle both list and string text."""
        if not text:
            return None

        # Handle list case - join segments with space
        if isinstance(text, list):
            # Filter out empty/None elements and join
            text_segments = [str(segment).strip() for segment in text if
                             segment]
            if text_segments:
                return ' '.join(text_segments)
            return None

        # Handle string case
        if isinstance(text, str) and len(text.strip()) > 0:
            return text.strip()

        return None

    try:
        # Try primary language first
        text = ref.text(primary_lang).text
        processed_text = process_text(text)
        if processed_text:
            return processed_text

        logger.info(
            f"No {primary_lang} text for {ref}, trying {fallback_lang}"
        )

        # Try fallback language
        text = ref.text(fallback_lang).text
        processed_text = process_text(text)
        if processed_text:
            return processed_text

        logger.warning(f"No text found in either language for {ref}")
        return None

    except Exception as e:
        logger.error(f"Error retrieving text for {ref}: {e}")
        return None


def save_commentary_scoring_output(result: CommentaryScoringOutput,
                                   save_score_explanations=True) -> bool:
    """
    Save commentary scoring results:
      - Update DB only for cited refs that are NOT already in the log.
      - Append a JSONL record containing ONLY the new explanations (no rewrites).
      - Return True if at least one new ref was saved/updated.
    """
    commentary_ref_str = result.commentary_ref

    if result.request_status == 0:
        logger.info(
            f"LLM's grading for {commentary_ref_str} "
            f"failed due to the {result.request_status_message}"
        )
        return False

    # Build index once to know what's already persisted
    if save_score_explanations:
        log_entry = {
            "commentary_ref": commentary_ref_str,
            "processed_datetime": result.processed_datetime,
            "request_status": result.request_status,
            "request_status_message": result.request_status_message,
            "explanations": {}
        }
    success_new = 0

    for cited_ref_str, score in result.ref_scores.items():
        explanation = result.scores_explanation.get(cited_ref_str, "")
        try:
            link_doc = db.links.find_one({"refs": {"$all": [commentary_ref_str, cited_ref_str]}})
            if not link_doc:
                logger.warning(f"No link found between '{commentary_ref_str}' and '{cited_ref_str}'")
                continue
            link_id = link_doc["_id"]
            update_result = db.links.update_one(
                {"_id": link_id},
                {"$set": {"relevance_score": score}}
            )
            if update_result.matched_count > 0:
                success_new += 1
                if save_score_explanations:
                    log_entry["explanations"][cited_ref_str] = explanation
            else:
                logger.warning(f"Failed to update link {link_id}")

        except Exception as e:
            logger.error(
                f"Error updating link for '{commentary_ref_str}' -> '{cited_ref_str}': {e}"
            )
            continue

    # Append to JSONL only if we actually persisted something new
    if save_score_explanations and log_entry["explanations"]:
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(log_entry) + "\n")
            logger.debug(f"Logged {len(log_entry['explanations'])} new explanations to: {LOG_FILE}")
        except Exception as e:
            logger.error(f"Error logging explanations for '{commentary_ref_str}': {e}")

    logger.info(
        f"Score saving completed for {commentary_ref_str}: "
        f"{success_new}/{len(result.ref_scores.items())} newly-updated links "
    )
    logger.info(
        f"Log entry: {log_entry}: "
    )
    return success_new > 0


def find_other_ref(refs: List[str], base: Ref) -> Ref:
    """
    Find the reference in a link that is not the base commentary reference.
    """
    base_norm = base.normal()

    for ref_str in refs:
        try:
            ref_obj = Ref(ref_str)
            if ref_obj.normal() != base_norm:
                return ref_obj
        except Exception as e:
            logger.warning(f"Could not parse ref '{ref_str}': {e}")
            continue

    # Fallback: return the last ref if no different one found
    logger.warning(f"No different ref found for base {base}, using fallback")
    return Ref(refs[-1])


def extract_all_refs_from_commentary(commentary_obj: Ref) -> Dict[str, str]:
    """
    Extract all non-commentary references cited by a commentary.
    """
    out: Dict[str, str] = {}
    link_count = 0

    for link in commentary_obj.linkset():
        link_count += 1
        try:
            other = find_other_ref(link.refs, commentary_obj)
            # Skip other commentaries - only include primary texts
            if other.primary_category != "Commentary":
                text = extract_text_from_ref(other, prefer_english=True)
                if text:
                    out[str(other)] = text
                else:
                    logger.warning(f"Couldn't load text for {other}")
        except Exception as e:
            logger.warning(
                f"Error processing link in commentary extraction: {e}"
            )
            continue

    logger.info(
        f"Extracted {len(out)} cited references from {commentary_obj} "
        f"({link_count} total links processed)"
    )
    return out


def make_commentary_scoring_input(commentary_ref: str) -> Optional[
    CommentaryScoringInput]:
    """
    Create input data structure for commentary scoring.
    """
    base = Ref(commentary_ref)
    cited_refs = extract_all_refs_from_commentary(base)
    base_text = extract_text_from_ref(base, prefer_english=True)

    if not base_text:
        logger.error(f"No text could be retrieved for {commentary_ref}")
        return CommentaryScoringInput(
            commentary_text='',
            commentary_ref='',
            cited_refs={}
        )
    return CommentaryScoringInput(
        commentary_text=base_text,
        commentary_ref=commentary_ref,
        cited_refs=cited_refs
    )