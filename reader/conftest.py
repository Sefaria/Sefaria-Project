import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture(autouse=True)
def _block_salesforce_webhook():
    """
    Prevent any test from making real HTTP calls to the Salesforce webhook.

    Mirrors the fixture in sefaria/conftest.py; autouse fixtures only apply to tests
    under their own conftest's directory, and these tests exercise the profile write
    paths that dispatch the webhook.
    """
    with patch("sefaria.helper.crm.tasks.requests.post") as mock_post:
        mock_post.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"success": True}),
            raise_for_status=MagicMock(),
        )
        yield mock_post
