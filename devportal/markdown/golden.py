"""Markdown goldens: devportal/contracts/fixtures/markdown/*.md -> devportal/contracts/golden/markdown/*.html.

Each golden is the renderer's sanitized HTML for its fixture, rendered with `revision="1"`, then normalized
(NORMALIZE.md) and pretty-printed one block per line so diffs are readable. A test compares
`normalize(render(fixture))` with `normalize(golden)`, so the pretty-printing never matters.

Regenerating is a reviewed change, never a way to make a test pass:

    python -m devportal.markdown.golden          # check: exit 1 if any golden differs
    python -m devportal.markdown.golden --write  # rewrite the goldens
"""

import pathlib
import re
import sys

from devportal.contracts.normalize import normalize
from devportal.markdown import render

CONTRACTS = pathlib.Path(__file__).resolve().parents[1] / "contracts"
FIXTURES = CONTRACTS / "fixtures" / "markdown"
GOLDEN = CONTRACTS / "golden" / "markdown"
REVISION = "1"

_BREAK_BEFORE = re.compile(
    r"(?<=>)(?=<(?:/?(?:div|table|thead|tbody|tr|ul|ol|blockquote|figure)\b|(?:p|h[1-6]|li|th|td|pre|hr|iframe|figcaption)\b))"
)


def fixtures():
    return sorted(FIXTURES.glob("*.md"))


def render_fixture(path):
    return render(path.read_text(encoding="utf-8"), revision=REVISION)


def pretty(html):
    """Normalized HTML with a newline before block tags (outside <pre>)."""
    norm = normalize(html)
    out = []
    for part in re.split(r"(<pre\b.*?</pre>)", norm, flags=re.DOTALL):
        out.append(part if part.startswith("<pre") else _BREAK_BEFORE.sub("\n", part))
    return "".join(out).strip() + "\n"


def golden_path(fixture):
    return GOLDEN / (fixture.stem + ".html")


def main(argv):
    write = "--write" in argv
    stale = []
    for fixture in fixtures():
        expected = pretty(render_fixture(fixture).html)
        target = golden_path(fixture)
        current = target.read_text(encoding="utf-8") if target.exists() else None
        if current != expected:
            stale.append(target.name)
            if write:
                GOLDEN.mkdir(parents=True, exist_ok=True)
                target.write_text(expected, encoding="utf-8")
    verb = "rewrote" if write else "differ"
    sys.stdout.write(f"{len(stale)} golden(s) {verb}: {', '.join(stale)}\n" if stale else "goldens up to date\n")
    return 1 if stale and not write else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
