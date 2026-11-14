"""Tests for parsing a sheet URL id into a sheet id and a highlighted node.

A sheet URL is `/sheets/<sheet_id>[.<node>]`. A truncated link can carry a
trailing dot (`/sheets/129389.`), which used to reach
`make_sheet_panel_dict` and raise `ValueError: invalid literal for int()` on
the empty segment after the dot, answering HTTP 500.
"""

from types import SimpleNamespace

import pytest
from django.http import Http404

from reader.views import _split_sheet_id_and_node, make_sheet_panel_dict


@pytest.mark.parametrize(
    "sheet_id,expected",
    [
        ("129389", (129389, None)),
        (129389, (129389, None)),
        ("129389.", (129389, None)),
        ("129389.5", (129389, 5)),
        ("129389..5", (129389, 5)),
        ("1..2", (1, 2)),
    ],
)
def test_split_sheet_id_and_node(sheet_id, expected):
    assert _split_sheet_id_and_node(sheet_id) == expected


def test_split_sheet_id_and_node_rejects_empty():
    with pytest.raises(Http404):
        _split_sheet_id_and_node(".")


def test_make_sheet_panel_dict_trailing_dot_reaches_sheet_lookup(monkeypatch):
    """A trailing-dot id looks up the sheet instead of raising ValueError.

    Before the fix, `make_sheet_panel_dict("129389.")` raised `ValueError` while
    parsing the id, so the sheet lookup below was never reached. This stubs the
    lookup and the counter write, because the CI sandbox Mongo holds production
    data: a real sheet id may exist there, and a test must not increment a real
    sheet's view count.
    """
    looked_up = []

    def fake_get_sheet_for_panel(sheet_id):
        looked_up.append(sheet_id)
        return {"error": "Sheet not found."}

    fake_db = SimpleNamespace(sheets=SimpleNamespace(update_one=lambda *args, **kwargs: None))
    monkeypatch.setattr("reader.views.db", fake_db)
    monkeypatch.setattr("reader.views.get_sheet_for_panel", fake_get_sheet_for_panel)

    with pytest.raises(Http404):
        make_sheet_panel_dict("129389.", None)

    assert looked_up == [129389]
