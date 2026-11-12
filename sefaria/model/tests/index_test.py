import pytest

from sefaria.model import *
from sefaria.model.text import prepare_index_regex_for_dependency_process


def test_index_regex():
    assert Ref("Otzar Midrashim").regex() == prepare_index_regex_for_dependency_process(
        library.get_index("Otzar Midrashim")
    )
    assert Ref("Zohar").regex() == prepare_index_regex_for_dependency_process(library.get_index("Zohar"))
    assert Ref("Genesis").regex() == prepare_index_regex_for_dependency_process(library.get_index("Genesis"))
    assert Ref("Rashi on Exodus").regex() == prepare_index_regex_for_dependency_process(
        library.get_index("Rashi on Exodus")
    )

    assert Ref("Otzar Midrashim").regex(as_list=True) == prepare_index_regex_for_dependency_process(
        library.get_index("Otzar Midrashim"), as_list=True
    )
    assert Ref("Zohar").regex(as_list=True) == prepare_index_regex_for_dependency_process(
        library.get_index("Zohar"), as_list=True
    )
    assert Ref("Genesis").regex(as_list=True) == prepare_index_regex_for_dependency_process(
        library.get_index("Genesis"), as_list=True
    )
    assert Ref("Rashi on Exodus").regex(as_list=True) == prepare_index_regex_for_dependency_process(
        library.get_index("Rashi on Exodus"), as_list=True
    )


def test_contents_reports_null_first_section_ref_for_index_without_text():
    """
    Index.contents(with_content_counts=True) built firstSectionRef by calling .normal() on the
    result of first_available_section_ref(), which returns None when the index holds no text.
    The index contents endpoint must publish null for the field instead of raising.
    """
    title = "Contents Without Text Test Book"
    try:
        Index().load({"title": title}).delete()
    except Exception:
        pass
    idx = Index(
        {
            "title": title,
            "categories": ["Liturgy"],
            "schema": {
                "titles": [
                    {"lang": "en", "text": title, "primary": True},
                    {"lang": "he", "text": "ספר בלי טקסט", "primary": True},
                ],
                "nodeType": "JaggedArrayNode",
                "depth": 2,
                "sectionNames": ["Chapter", "Verse"],
                "addressTypes": ["Integer", "Integer"],
                "key": title,
            },
        }
    )
    idx.save()
    try:
        assert Ref(title).first_available_section_ref() is None
        contents = idx.contents(with_content_counts=True)
        assert contents["firstSectionRef"] is None
    finally:
        idx.delete()
