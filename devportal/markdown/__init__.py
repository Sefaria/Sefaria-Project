"""The portal's Markdown renderer (contract C4, devportal/contracts/DIALECT.md). Pure Python; no Django import."""

from .frontmatter import parse_front_matter, split_front_matter
from .links import rewrite_link, rewrite_markdown_links
from .plaintext import extract_text
from .renderer import RenderResult, render
from .sanitize import sanitize
from .slugger import Slugger, slugify

__all__ = [
    "RenderResult",
    "Slugger",
    "extract_text",
    "parse_front_matter",
    "render",
    "rewrite_link",
    "rewrite_markdown_links",
    "sanitize",
    "slugify",
    "split_front_matter",
]
