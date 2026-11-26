"""Front matter: a YAML block between a first line `---` and a closing `---` line.

Many source files have no newline after the closing fence, so the closing fence is matched with `\\n---(\\n|$)`.
"""

import re

import yaml

_CLOSE = re.compile(r"\n---(\n|$)")


def split_front_matter(text):
    """Return `(front_matter_yaml, body)`. `front_matter_yaml` is `None` when the text has no front matter."""
    if not text.startswith(("---\n", "---\r\n")):
        return None, text
    start = text.index("\n")
    m = _CLOSE.search(text, start)
    if m is None:
        return None, text
    return text[start + 1 : m.start() + 1], text[m.end() :]


def parse_front_matter(text):
    """Return `(dict, body)`; the dict is empty when there is no front matter."""
    raw, body = split_front_matter(text)
    if raw is None:
        return {}, body
    data = yaml.safe_load(raw) or {}
    if not isinstance(data, dict):
        msg = "front matter is not a mapping"
        raise ValueError(msg)
    return data, body
