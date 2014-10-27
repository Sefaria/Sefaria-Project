import pytest
import sefaria.counts as c

@pytest.mark.deep
def test_get_link_counts():
    a = c.get_link_counts("Tanach", "Bavli")
    assert len(a) > 970
