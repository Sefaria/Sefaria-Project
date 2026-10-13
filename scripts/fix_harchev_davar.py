import contextlib

from sefaria.model import *


def clean_segment_layer(index_title):
    """
    Goes through the segments and set anything that is not a basestring to u''
    :param index_title:
    :return:
    """

    index = Index().load({"title": index_title})
    assert isinstance(index, Index)

    version = index.versionSet()[0]
    ja = version.ja()

    assert ja.depth() == 2

    for chap_index, chapter in enumerate(ja.array()):
        for verse_index, verse in enumerate(chapter):
            if not isinstance(verse, str):
                assert isinstance(verse, list)
                assert len(verse) == 0

                ja.set_element([chap_index, verse_index], "")

    version.save()


for book in library.get_indexes_in_category("Torah"):
    title = f"Harchev Davar on {book}"
    index = library.get_index(title)
    index.categories = ["Commentary2", "Tanakh", "Haamek Davar"]
    with contextlib.suppress(AttributeError):
        del index.sectionNames
    index.save()
    clean_segment_layer(title)
    index.versionState().refresh()
