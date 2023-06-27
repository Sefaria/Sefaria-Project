from pytest import fixture
from sefaria.helper.linker import _FindRefsText, _create_find_refs_text


@fixture
def post_body():
    return {"text": {"title": "TITLE", "body": "BODY"}}


@fixture
def expected_find_refs_text(post_body):
    return _FindRefsText(post_body['text']['title'], post_body['text']['body'])


def test_create_find_refs_text(post_body: dict, expected_find_refs_text: _FindRefsText):
    actual_find_refs_text = _create_find_refs_text(post_body)
    assert expected_find_refs_text == actual_find_refs_text
