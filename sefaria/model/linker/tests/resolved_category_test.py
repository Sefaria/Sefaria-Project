import pytest
from unittest.mock import Mock
from sefaria.model.linker.category_resolver import ResolvedCategory


@pytest.fixture
def mock_raw_ref():
    return Mock()


@pytest.fixture
def mock_category():
    return Mock()


def test_is_ambiguous_with_single_category(mock_raw_ref, mock_category):
    # Test when there is exactly one category
    resolved_category = ResolvedCategory(mock_raw_ref, [mock_category])
    assert not resolved_category.is_ambiguous


def test_is_ambiguous_with_multiple_categories(mock_raw_ref, mock_category):
    # Test when there are multiple categories
    resolved_category = ResolvedCategory(mock_raw_ref, [mock_category, mock_category])
    assert resolved_category.is_ambiguous


def test_resolution_failed_with_no_categories(mock_raw_ref):
    # Test when there are no categories
    resolved_category = ResolvedCategory(mock_raw_ref, [])
    assert resolved_category.resolution_failed


def test_resolution_not_failed_with_categories(mock_raw_ref, mock_category):
    # Test when there are one or more categories
    resolved_category = ResolvedCategory(mock_raw_ref, [mock_category])
    assert not resolved_category.resolution_failed
