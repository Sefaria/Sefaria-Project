import django
django.setup()
from sefaria.model import *


def get_simple_indexes(indexes=None, reverse=False):
    indexes = indexes or library.all_index_records()
    simple_indexes = []
    for index in indexes:
        if (not index.is_complex()) ^ reverse:
            simple_indexes.append(index)
    return simple_indexes


def linker_supported_indexes(indexes=None, reverse=False):
    """
    Linker isn't supported if there is no "match_temples" field on the root node of the schema
    @return:
    """
    indexes = indexes or library.all_index_records()
    unsupported = []
    for index in indexes:
        root = index.nodes
        if bool(getattr(root, 'match_templates', None)) ^ reverse:
            unsupported.append(index)
    return unsupported


def indexes_with_alt_struct(indexes=None, reverse=False):
    indexes = indexes or library.all_index_records()
    with_alt = []
    for index in indexes:
        if bool(index.get_alt_structures()) ^ reverse:
            with_alt.append(index)
    return with_alt


def indexes_with_keyword(kw, indexes=None, reverse=False):
    indexes = indexes or library.all_index_records()
    without_kw = []
    for index in indexes:
        if (kw in index.title.lower()) ^ reverse:
            without_kw.append(index)
    return without_kw


def where_term_is_used(slug):
    indexes = IndexSet({"schema.match_templates.term_slugs": slug})
    for index in indexes:
        print(index.title)


if __name__ == '__main__':
    # print(len(get_simple_indexes()))
    # print("All", len(library.all_index_records()))
    # print("Not linker", len(linker_supported_indexes(reverse=True)))
    # print("Not linker simple", len(linker_supported_indexes(get_simple_indexes(), reverse=True)))
    # yo = indexes_with_alt_struct(linker_supported_indexes(get_simple_indexes(), reverse=True), reverse=True)
    # yo = indexes_with_keyword(" on ", yo, reverse=False)
    # for x in yo:
    #     print(x.title)
    # print(len(yo))
    where_term_is_used("mekhilta-derabbi-yishmael")

"""
of
on
if ends in number suspect that works can be combined
to
by
check if there's alt struct
"""
