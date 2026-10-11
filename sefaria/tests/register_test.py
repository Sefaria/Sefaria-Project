"""
process_register_form (sefaria/views.py) creates a new email/password account,
for both web /register and the mobile api/register/.

These tests check the steps that run after the Django user is created. The form,
database, and network calls are replaced with mocks, so no database is needed.
"""
from unittest.mock import MagicMock, patch

from sefaria.views import process_register_form


@patch("sefaria.views.dispatch_copy_learning_level_from_ac")
@patch("sefaria.views.import_gravatar")
@patch("sefaria.views.auth_login")
@patch("sefaria.views.UserProfile")
@patch("sefaria.views.authenticate")
@patch("sefaria.views.transaction")
@patch("sefaria.views.SefariaNewUserForm")
def test_starts_learning_level_copy_after_the_last_profile_save(
    mock_form_cls,
    _mock_transaction,
    mock_authenticate,
    mock_profile_cls,
    _mock_login,
    _mock_gravatar,
    mock_dispatch_copy,
):
    form = mock_form_cls.return_value
    form.is_valid.return_value = True
    form.cleaned_data = {"email": "new@example.com", "password1": "a-password"}
    form.errors = {}
    mock_authenticate.return_value = MagicMock(id=42)
    profile = mock_profile_cls.return_value

    # Put both mocks under one parent so we can see the order they were called in.
    steps = MagicMock()
    steps.attach_mock(profile.save, "save")
    steps.attach_mock(mock_dispatch_copy, "dispatch_copy_learning_level_from_ac")

    process_register_form(MagicMock(spec=["POST"]))

    mock_dispatch_copy.assert_called_once_with(profile)
    # The copy only fills in an empty learning level, and a profile save writes the
    # whole profile. So it has to start after the last save, or that save would put
    # the empty value back.
    assert [name for name, _args, _kwargs in steps.mock_calls] == [
        "save",
        "save",
        "dispatch_copy_learning_level_from_ac",
    ]
