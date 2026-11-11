"""
sefaria/system/varnish/wrapper.py invalidate_ref: the new reader's /api/related purge and ban must never stop the existing
purges and bans. Ref and the Varnish calls are stubbed, so no library data or Varnish is needed.
"""

from unittest.mock import MagicMock, patch

import pytest

from sefaria.model import Ref
from sefaria.system.varnish import wrapper

LEGACY_BANS = [
    "/api/texts/RE",
    "/api/v3/texts/RE",
    "/api/links/RE",
    "/api/related/RE",
]


def _ref():
    oref = MagicMock(spec=Ref)
    oref.index_node.depth = 0  # already a section ref: no section_ref() call
    oref.url.return_value = "Genesis.1"
    oref.normal.return_value = "Genesis 1"
    oref.is_range.return_value = False
    return oref


@pytest.fixture
def varnish():
    with (
        patch.object(wrapper, "ban_url") as ban,
        patch.object(wrapper, "purge_url") as purge,
        patch.object(wrapper, "url_regex", return_value="RE"),
    ):
        yield ban, purge


def test_new_reader_urls_are_purged_and_banned_after_the_legacy_ones(varnish):
    ban, purge = varnish
    wrapper.invalidate_ref(_ref(), purge=True)
    banned = [c.args[0] for c in ban.call_args_list]
    assert banned[:4] == LEGACY_BANS
    assert len(banned) == 5 and banned[4].startswith("/api/related/(Genesis%201")
    purged = [c.args[0] for c in purge.call_args_list]
    assert purged[-1].endswith("/api/related/Genesis%201?with_links=0&sheets=count")


@pytest.mark.parametrize("failing", ["related_client_sections", "client_url_regex", "encode_uri_component"])
def test_a_failure_in_the_new_reader_part_still_runs_every_legacy_purge_and_ban(varnish, failing):
    ban, purge = varnish
    with patch.object(wrapper, failing, side_effect=RuntimeError("odd ref")):
        wrapper.invalidate_ref(_ref(), purge=True)
    assert [c.args[0] for c in ban.call_args_list] == LEGACY_BANS
    purged = [c.args[0] for c in purge.call_args_list]
    assert any(u.endswith("/api/related/Genesis.1?with_sheet_links=0") for u in purged)
    assert any(u.endswith("/api/links/Genesis.1?with_text=1") for u in purged)
