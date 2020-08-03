import pytest
import json

import sefaria.system.decorators as d
import sefaria.system.exceptions as e


@d.catch_error_as_json
def call_user_error():
    return raise_user_error()


def raise_user_error():
    raise e.InputError("You really shouldn't do that")


@d.catch_error_as_json
def call_exception():
    return raise_exception()


def raise_exception():
    raise Exception("System Error!")

@pytest.mark.xfail(reason="unknown")
def test_catch_error():
    httpr = call_user_error()
    assert getattr(httpr, "content")
    r = json.loads(httpr.content)
    assert "error" in r
    assert r["error"] == "You really shouldn't do that"


def test_pass_exception():
    with pytest.raises(Exception):
        r = call_exception()
