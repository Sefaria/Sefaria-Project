import pytest
from sefaria.model.link import get_link_counts


@pytest.mark.deep
def test_get_link_counts():
    a = get_link_counts("Tanakh", "Bavli")
    assert len(a) > 970
