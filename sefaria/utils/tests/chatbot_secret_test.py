import pytest
from django.test import override_settings

from sefaria.utils.chatbot import is_usable_chatbot_user_id_secret


@pytest.mark.parametrize("debug", [True, False])
@pytest.mark.parametrize("secret", [None, "", "insert your chatbot user id secret here"])
def test_unusable_secret_is_rejected_whatever_debug_is(secret, debug):
    with override_settings(DEBUG=debug):
        assert not is_usable_chatbot_user_id_secret(secret)


def test_literal_secret_is_allowed_only_under_debug():
    with override_settings(DEBUG=True):
        assert is_usable_chatbot_user_id_secret("secret")
    with override_settings(DEBUG=False):
        assert not is_usable_chatbot_user_id_secret("secret")


@pytest.mark.parametrize("debug", [True, False])
def test_real_secret_is_usable(debug):
    with override_settings(DEBUG=debug):
        assert is_usable_chatbot_user_id_secret("a-long-random-value")
