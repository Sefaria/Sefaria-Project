from __future__ import annotations
from typing import Optional, Union, List

import strawberry
from sefaria.model import Index, library
from dataclasses import dataclass
from sefaria.graphql.utils import JSONScalar
from sefaria.system.exceptions import BookNameError


@strawberry.type
class SchemaTitle:
    text: str
    lang: str
    primary: bool = False


@strawberry.type
class JaNode:
    depth: int
    sectionNames: List[str]
    lengths: List[int]
    titles: List[SchemaTitle]

    @classmethod
    def from_index(cls, index_obj: Index) -> Union[JaNode, None]:
        if index_obj.is_complex():  # todo: handle complex texts
            return None
        schema = index_obj.schema
        return cls(
            depth=schema['depth'],
            sectionNames=schema['sectionNames'],
            lengths=schema['lengths'],
            titles=[SchemaTitle(**t) for t in schema['titles']]
        )


@strawberry.type
class GraphIndex:
    title: str
    categories: List[str]
    node: Optional[JaNode]
    schema: JSONScalar
    altStructs: Optional[JSONScalar]


def get_index(title: str) -> Union[GraphIndex, None]:
    try:
        index_obj = library.get_index(title)
    except BookNameError:
        return None
    return GraphIndex(
        title=index_obj.title,
        categories=index_obj.categories,
        node=JaNode.from_index(index_obj),
        schema=index_obj.schema,
        altStructs=getattr(index_obj, 'alt_structs', None)
    )
