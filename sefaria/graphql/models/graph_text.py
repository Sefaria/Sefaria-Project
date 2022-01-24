from __future__ import annotations
from typing import Union, List, Optional

import strawberry

from sefaria.model import TextChunk, Ref


@strawberry.type
class GraphTextSection:
    """
    Represents a Section (Chapter) of text. Will adapt the input to the nearest chapter
    """
    reference: str
    versionTitle: str
    language: str
    text: List[str]
    prev_ref: Optional[str]
    next_ref: Optional[str]


def load_graph_text(
        reference: str,
        version_title: Union[str, None] = None,
        language: str = 'en',
        remove_html: bool = False
) -> GraphTextSection:
    # todo: make sure textchunks do not span sections
    oref = Ref(reference)

    if oref.is_segment_level():
        oref = oref.context_ref()
    elif not oref.is_section_level():
        oref = oref.first_available_section_ref()

    if oref.is_spanning():
        oref = oref.first_spanned_ref()

    prev_ref = oref.prev_section_ref()
    next_ref = oref.next_section_ref()
    tc = oref.text(vtitle=version_title, lang=language)

    return GraphTextSection(
        reference=oref.normal(),
        versionTitle=version_title,
        language=language,
        text=tc.remove_html(tc.text) if remove_html else tc.text,
        prev_ref=prev_ref,
        next_ref=next_ref
    )

