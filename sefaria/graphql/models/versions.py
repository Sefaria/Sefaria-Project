from __future__ import annotations
from typing import List, Union, Optional

import strawberry

from sefaria.model import VersionSet, Version, library
from sefaria.graphql.models.graph_text import load_graph_text, GraphTextSection


@strawberry.type
class GraphVersion:
    title: str
    language: str
    version_title: str
    version_source: str
    version_title_in_hebrew: str

    @strawberry.field
    def text_section(self, section_number: int, remove_html: bool = False) -> Optional[GraphTextSection]:
        """
        Load a text section from a version. Does not support complex texts at this time
        """
        index = library.get_index(self.title)
        if index.is_complex():
            return
        reference = f'{self.title}:{str(section_number)}'
        return load_graph_text(reference, self.version_title, self.language, remove_html)

    @classmethod
    def from_version_obj(cls, version: Version) -> GraphVersion:
        return cls(
            version.title,
            version.language,
            version.versionTitle,
            version.versionTitle,
            getattr(version, 'versionTitleInHebrew', '')
        )


def get_versions(
        title: str,
        language: Union[str, None] = None,
        version_title: Union[str, None] = None
) -> List[GraphVersion]:

    query_outline = {
        'title': title,
        'version_title': version_title,
        'language': language
    }
    # remove None values from query
    query = {key: value for key, value in query_outline.items() if value}
    vs = VersionSet(query)
    return [GraphVersion.from_version_obj(v) for v in vs.array()]
