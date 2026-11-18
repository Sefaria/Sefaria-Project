"""A /texts/ URL whose last segment names a text, not a category, goes to the text itself."""

from django.test import RequestFactory


def _toc_tree():
    """
    A small TOC in the shape the view resolves against: Tanakh/Torah/Genesis ends at a text, and
    Mishnah/Pirkei Avot holds both a category and a text, which `TocTree` keys as the text.
    """
    from sefaria.model.category import TocCategory, TocTextIndex

    def category(*titles):
        node = TocCategory()
        node.add_primary_titles(*titles)
        return node

    def text(*titles):
        node = TocTextIndex()
        node.add_primary_titles(*titles)
        return node

    root = category("TOC", "שרש")
    tanakh = category("Tanakh", "תנ״ך")
    torah = category("Torah", "תורה")
    genesis = text("Genesis", "בראשית")
    mishnah = category("Mishnah", "משנה")
    avot_category = category("Pirkei Avot", "פרקי אבות")
    avot_text = text("Pirkei Avot", "פרקי אבות")

    root.append(tanakh)
    tanakh.append(torah)
    torah.append(genesis)
    root.append(mishnah)
    mishnah.append(avot_category)
    mishnah.append(avot_text)

    paths = {
        ("Tanakh",): tanakh,
        ("Tanakh", "Torah"): torah,
        ("Tanakh", "Torah", "Genesis"): genesis,
        ("Mishnah",): mishnah,
        ("Mishnah", "Pirkei Avot"): avot_text,
        # A path segment that `lookup` matches although it is spelled unlike the TOC title.
        ("Mishnah", "Pirkei_Avot"): avot_text,
    }

    class FakeTocTree:
        def lookup(self, cats, title=None):
            return paths.get(tuple(cats))

    return FakeTocTree()


def test_text_path_has_no_ending_category():
    from reader.views import _toc_category_at

    tree = _toc_tree()

    assert _toc_category_at(tree, ["Tanakh", "Torah", "Genesis"]) is None


def test_text_path_redirects_and_keeps_the_query_string(monkeypatch):
    tree = _toc_tree()
    monkeypatch.setattr("reader.views.library.get_toc_tree", lambda **kwargs: tree)

    from reader.views import texts_category_list

    request = RequestFactory().get("/texts/Tanakh/Torah/Genesis?p=Genesis.2.3")
    response = texts_category_list(request, "Tanakh/Torah/Genesis")

    assert response.status_code == 302
    assert response["Location"] == "/Genesis?p=Genesis.2.3"


def test_category_path_keeps_its_category_page():
    from reader.views import _toc_category_at

    tree = _toc_tree()

    assert _toc_category_at(tree, ["Tanakh", "Torah"]) is tree.lookup(["Tanakh", "Torah"])
    # Both a category and a text are keyed at this path; the category page still renders, also
    # when the URL segment is spelled unlike the TOC title.
    for cats in (["Mishnah", "Pirkei Avot"], ["Mishnah", "Pirkei_Avot"]):
        ending = _toc_category_at(tree, cats)
        assert ending is not tree.lookup(cats)
        assert ending.get_primary_title() == "Pirkei Avot"
