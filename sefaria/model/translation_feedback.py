"""
translation_feedback.py
Writes to MongoDB Collection: translation_feedback

POC (discovery): reader feedback on a single word of a translation. A reader double-clicks a
word in a translation (non-primary version) and may suggest a replacement and/or leave a comment.
An LLM then rates the feedback (see sefaria.helper.llm.translation_feedback) and staff can accept
a suggestion, which rewrites that exact word instance through sefaria.tracker.modify_text.

The word is located by its occurrence index among whole-word matches in the segment's *visible*
text (HTML tags removed, entities decoded), which is exactly what the reader sees in the DOM
(`textContent`). The same matching rule is implemented in static/js/TranslationFeedback.jsx.
"""
import html
import time

import regex

from sefaria.model.abstract import AbstractMongoRecord, AbstractMongoSet

STATUS_NEW = "new"
STATUS_ACCEPTED = "accepted"
STATUSES = (STATUS_NEW, STATUS_ACCEPTED)

# "1".."4" rate a suggestion, "C" = comment only, "?" = the LLM could not be reached / parsed
ASSESSMENT_VALUES = ("1", "2", "3", "4", "C", "?")
ASSESSMENT_LEGEND = [
    ("1", "Excellent suggestion, worthy of quickly updating translation"),
    ("2", "Good suggestion, suggest human review"),
    ("3", "Not likely a good suggestion, suggest human review"),
    ("4", "Bad suggestion, not worth considering"),
    ("C", "(comment only)"),
]

MAX_WORD_LEN = 100
MAX_SUGGESTION_LEN = 300
MAX_COMMENT_LEN = 5000


class TranslationFeedback(AbstractMongoRecord):
    collection = "translation_feedback"
    required_attrs = ["ref", "version_title", "language", "word", "occurrence", "created", "status"]
    optional_attrs = [
        "actual_language",   # Version.actualLanguage (ISO code), used for the tracker write on accept
        "language_family",   # Version.languageFamilyName, for reader links (?ven=family|title)
        "char_offset",       # offset of the word in the visible text, informational only
        "suggestion",
        "comment",
        "user_id",           # None -> anonymous
        "segment_text",      # snapshot of the raw translation segment when the feedback was given
        "llm_assessment",    # one of ASSESSMENT_VALUES, None while pending
        "llm_note",
        "llm_model",
        "llm_started",       # epoch seconds when an assessment attempt was claimed
        "llm_assessed",      # epoch seconds when the assessment finished
        "accepted_by",
        "accepted_at",
    ]
    attr_schemas = {
        "ref": {"type": "string", "required": True},
        "version_title": {"type": "string", "required": True},
        "language": {"type": "string", "required": True},
        "word": {"type": "string", "required": True, "maxlength": MAX_WORD_LEN},
        "occurrence": {"type": "integer", "required": True, "min": 0},
        "created": {"type": "integer", "required": True},
        "status": {"type": "string", "allowed": list(STATUSES), "required": True},
        "suggestion": {"type": "string", "nullable": True, "maxlength": MAX_SUGGESTION_LEN},
        "comment": {"type": "string", "nullable": True, "maxlength": MAX_COMMENT_LEN},
        "user_id": {"type": "integer", "nullable": True},
        "llm_assessment": {"type": "string", "nullable": True, "allowed": list(ASSESSMENT_VALUES)},
    }

    def _sanitize(self):
        # Every user-supplied field here is plain text, never rendered as HTML: the dashboard
        # template autoescapes, and accept() HTML-escapes the suggestion before it is written into
        # the text. Bleaching would turn "&" into "&amp;" and double-escape on display.
        pass

    def has_suggestion(self):
        return bool((getattr(self, "suggestion", None) or "").strip())


class TranslationFeedbackSet(AbstractMongoSet):
    recordClass = TranslationFeedback


# ---------------------------------------------------------------------------
# Word location helpers (pure functions, no DB)
# ---------------------------------------------------------------------------

_ENTITY_RE = regex.compile(r"&(?:#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);")
_WORD_CHAR = r"[\p{L}\p{N}\p{M}_]"


def visible_text_with_map(raw):
    """
    Strip HTML tags and decode entities from `raw`, the way a browser's textContent would.
    Returns (visible_text, spans) where spans[i] = (raw_start, raw_end) of visible char i.
    """
    chars = []
    spans = []
    i = 0
    n = len(raw)
    while i < n:
        c = raw[i]
        if c == "<":
            close = raw.find(">", i)
            if close == -1:
                # unterminated "<" is displayed literally
                chars.append(c)
                spans.append((i, i + 1))
                i += 1
                continue
            i = close + 1
            continue
        if c == "&":
            m = _ENTITY_RE.match(raw, i)
            if m:
                decoded = html.unescape(m.group(0))
                for ch in decoded:
                    chars.append(ch)
                    spans.append((m.start(), m.end()))
                i = m.end()
                continue
        chars.append(c)
        spans.append((i, i + 1))
        i += 1
    return "".join(chars), spans


def word_pattern(word):
    """Whole-word match for `word`. Mirrors wordRegex() in static/js/TranslationFeedback.jsx."""
    return regex.compile(r"(?<!{w}){word}(?!{w})".format(w=_WORD_CHAR, word=regex.escape(word)))


def locate_word(raw, word, occurrence):
    """
    Find the `occurrence`th (0-based) whole-word match of `word` in the visible text of `raw`.
    Returns (raw_start, raw_end) or None.
    """
    if not isinstance(raw, str) or not word or occurrence is None or occurrence < 0:
        return None
    visible, spans = visible_text_with_map(raw)
    for idx, m in enumerate(word_pattern(word).finditer(visible)):
        if idx == occurrence:
            return spans[m.start()][0], spans[m.end() - 1][1]
    return None


def occurrence_at_offset(raw, word, char_offset):
    """
    Given a visible-text character offset, return the occurrence index of the match of `word`
    that contains it (or None).
    """
    visible, _ = visible_text_with_map(raw)
    for idx, m in enumerate(word_pattern(word).finditer(visible)):
        if m.start() <= char_offset < m.end():
            return idx
    return None


class WordReplacementError(Exception):
    pass


def replace_word(raw, word, occurrence, replacement):
    """
    Replace the `occurrence`th whole-word instance of `word` in `raw` with `replacement` (plain
    text, HTML-escaped on insertion). Raises WordReplacementError if the word isn't there or spans
    markup (e.g. "<b>Go</b>d"), which we refuse to rewrite automatically.
    """
    loc = locate_word(raw, word, occurrence)
    if loc is None:
        raise WordReplacementError(
            "The segment no longer contains \"{}\" at that position (occurrence #{}). "
            "The translation may have changed since this feedback was given.".format(word, occurrence + 1))
    start, end = loc
    if "<" in raw[start:end]:
        raise WordReplacementError("The word \"{}\" spans HTML markup; please edit it manually.".format(word))
    return raw[:start] + html.escape(replacement, quote=False) + raw[end:]


def now_epoch():
    return int(time.time())
