from typing import List, Optional

import strawberry

from sefaria.model import Ref
from sefaria.system.database import db
from sefaria.utils.util import strip_tags


@strawberry.type
class SheetRefText:
    reference: str
    en: str
    he: str


@strawberry.type
class SheetNode:
    outside_text: Optional[str]
    quoted_text: Optional[SheetRefText]

    @classmethod
    def from_mongo_node(cls, sheet_node: dict):
        if 'ref' in sheet_node:
            sheet_ref_text = SheetRefText(
                reference=sheet_node['ref'],
                en=sheet_node['text']['en'],
                he=sheet_node['text']['he']
            )
        else:
            sheet_ref_text = None

        return cls(
            outside_text=sheet_node.get('outsideText', None),
            quoted_text=sheet_ref_text
        )


@strawberry.type
class GraphSheet:
    sheet_id: str
    title: str
    sheet_url: str
    summary: Optional[str]
    is_featured: bool
    sources: List[SheetNode]


def load_sheets_from_ref(reference: str) -> List[GraphSheet]:
    oref = Ref(reference)
    segment_refs = [r.normal() for r in oref.all_segment_refs()]
    query = {"expandedRefs": {"$in": segment_refs}}

    sheet_cursor = db.sheets.find(query)
    sheet_cursor.hint("expandedRefs_1")
    sheets = [s for s in sheet_cursor]

    return [
        GraphSheet(
            sheet_id=str(sheet['id']),
            title=strip_tags(sheet["title"]),
            sheet_url=f"/sheets/{str(sheet['id'])}",
            summary=sheet.get("summary", None),
            is_featured=sheet.get("is_featured", False),
            sources=[SheetNode.from_mongo_node(node) for node in sheet.get("sources", [])]
        ) for sheet in sheets
    ]

