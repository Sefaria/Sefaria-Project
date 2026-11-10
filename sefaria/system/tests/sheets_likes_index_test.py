# sefaria/system/tests/sheets_likes_index_test.py
"""`sheets.likes` must be a registered index.

delete_user_account() runs db.sheets.update_many({"likes": uid}, {"$pull": ...}).
Without an index on `likes` that is a scan of every sheet, which made admin user
deletion take 92-202s and time out at the proxy.
"""

from sefaria.system.tests.ref_data_index_test import _registered_indices


def test_sheets_likes_index_is_registered():
    indices = _registered_indices()
    assert any(col == "sheets" and args and args[0] == "likes" for col, args, _kwargs in indices), (
        "sheets.likes is not in ensure_indices(); delete_user_account()'s likes $pull "
        "becomes a full scan of the sheets collection"
    )
