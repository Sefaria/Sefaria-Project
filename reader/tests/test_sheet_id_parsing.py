"""Tests for parsing a sheet URL id into a sheet id and a highlighted node.

A sheet URL is `/sheets/<sheet_id>[.<node>]`. A truncated link can carry a
trailing dot (`/sheets/129389.`), which used to reach
`make_sheet_panel_dict` and raise `ValueError: invalid literal for int()` on
the empty segment after the dot, answering HTTP 500.
"""

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


def test_make_sheet_panel_dict_trailing_dot_is_handled():
    """A trailing-dot id resolves the sheet and 404s when it does not exist.

    Before the fix this raised `ValueError` (an unhandled 500) instead of
    reaching the sheet lookup.
    """
    with pytest.raises(Http404):
        make_sheet_panel_dict("129389.", None)
