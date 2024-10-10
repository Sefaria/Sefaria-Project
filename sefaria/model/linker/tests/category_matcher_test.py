import pytest
from unittest.mock import Mock
from sefaria.model.category import Category
from sefaria.model.linker.category_resolver import CategoryMatcher


def make_title(text, lang):
    return {"text": text, "lang": lang}


@pytest.fixture
def mock_category():
    return Category({
        "titles": [make_title("Title1", "en"), make_title("Title2", "en")]
    })


@pytest.fixture
def mock_category_2():
    return Category({
        "titles": [make_title("Title1", "en"), make_title("Title4", "en")]
    })


@pytest.fixture
def mock_raw_ref():
    raw_ref = Mock()
    raw_ref.text = "Title2"
    return raw_ref


@pytest.fixture
def category_matcher(mock_category, mock_category_2):
    return CategoryMatcher(lang="en", category_registry=[mock_category, mock_category_2])


def test_match_single_title(category_matcher, mock_raw_ref, mock_category):
    # Test matching for a valid title in mock_raw_ref
    matched_categories = category_matcher.match(mock_raw_ref)
    assert len(matched_categories) == 1
    assert mock_category in matched_categories


def test_match_no_match(category_matcher, mock_raw_ref):
    # Test case where the raw_ref title does not match any category
    mock_raw_ref.text = "NonexistentTitle"
    matched_categories = category_matcher.match(mock_raw_ref)
    assert matched_categories == []


def test_match_multiple_titles(category_matcher, mock_raw_ref, mock_category, mock_category_2):
    # Test case where multiple categories match the same title
    mock_raw_ref.text = "Title1"

    matched_categories = category_matcher.match(mock_raw_ref)
    assert len(matched_categories) == 2
    assert mock_category in matched_categories
    assert mock_category_2 in matched_categories
