from __future__ import annotations
from typing import List, Union

import strawberry

from sefaria.model import VersionSet, Version


@strawberry.type
class GraphVersion:
    title: str
    language: str
    versionTitle: str
    versionSource: str
    versionTitleInHebrew: str

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

    query = {
        'title': title,
        'language': language,
    }
    if version_title:
        query['versionTitle'] = version_title
    vs = VersionSet(query)
    return [GraphVersion.from_version_obj(v) for v in vs.array()]
