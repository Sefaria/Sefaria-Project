from typing import List

import strawberry


@strawberry.type
class GraphVersion:
    pass


def get_versions(tref: str) -> List[GraphVersion]:
    pass
