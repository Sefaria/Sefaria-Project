from __future__ import annotations
from typing import Union, List, Optional

import strawberry

from sefaria.graphql.models.links import get_links_inner_query, GraphLink
from sefaria.model import TextChunk, Ref


@strawberry.interface
class GraphTextChunk:  # not sure if this is necessary
    reference: str
    versionTitle: str
    language: str
    prev_ref: Optional[str]
    next_ref: Optional[str]


@strawberry.type
class GraphTextSegment:
    """
    Object representation of at text segment. Can be used to query links and sheets
    """
    reference: str
    segment_text: str
    verse_number: int

    @strawberry.field
    def links(self) -> List[GraphLink]:
        return get_links_inner_query(self.reference)


@strawberry.type
class GraphTextSection:
    """
    Represents a Section (Chapter) of text. Will adapt the input to the nearest chapter
    """
    reference: str
    versionTitle: str
    language: str
    prev_ref: Optional[str]
    next_ref: Optional[str]
    text_array: List[str]

    @strawberry.field
    def object_array(self, start: Optional[int] = None, end: Optional[int] = None) -> List[GraphTextSegment]:
        if not start or start < 0:
            start = 0
        else:
            start -= 1
        if not end:
            end = len(self.text_array)
        else:
            end -= 1
        segment_list = [
            GraphTextSegment(
                verse_number=segment_number,
                segment_text=segment,
                reference=f"{self.reference}:{str(segment_number)}"
            ) for segment_number, segment in enumerate(self.text_array, 1)]
        return segment_list[start:end]


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
        text_array=tc.remove_html(tc.text) if remove_html else tc.text,
        prev_ref=prev_ref,
        next_ref=next_ref
    )

