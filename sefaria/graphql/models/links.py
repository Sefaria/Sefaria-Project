from enum import Enum
from typing import List

import strawberry

from sefaria.model import Ref, LinkSet
from sefaria.system.exceptions import InputError

MAX_RESULTS = 100


class LinkQueryInfo(Enum):
    ALL = "Query returned all results"
    TOO_MANY_LINKS = "Too many links. Try and query on a smaller reference to get all results."
    INVALID_REF = "Supplied reference is not recognized by Sefaria. Try an Index query to get help on spelling"


@strawberry.type
class GraphLink:
    refs: List[str]


@strawberry.type
class GraphLinkSet:
    links: List[GraphLink]
    query_info: str


def get_links_outer_query(reference: str) -> GraphLinkSet:
    try:
        oref = Ref(reference)
    except InputError:
        return GraphLinkSet(links=[], query_info=LinkQueryInfo.INVALID_REF.value)
    ls = oref.linkset()
    if ls.count() > MAX_RESULTS:
        ls = LinkSet(oref, limit=MAX_RESULTS)
        helper = LinkQueryInfo.TOO_MANY_LINKS.value
    else:
        helper = LinkQueryInfo.ALL.value
    links = [GraphLink(link.refs) for link in ls.array()]
    return GraphLinkSet(links=links, query_info=helper)


def get_links_inner_query(reference: str) -> List[GraphLink]:
    """
    simplified query method to be used in nested queries.
    Nested queries strictly limit the scope of the query, thus avoiding bad names and large results
    """
    oref = Ref(reference)
    ls = oref.linkset()
    return [GraphLink(link.refs) for link in ls.array()]
