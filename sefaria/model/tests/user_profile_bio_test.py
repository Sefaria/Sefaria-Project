import bleach
import pytest
from sefaria.model.user_profile import _BIO_ALLOWED_TAGS, _BIO_ALLOWED_ATTRS, _BIO_CSS_SANITIZER


def clean(html):
    return bleach.linkify(bleach.clean(html, tags=_BIO_ALLOWED_TAGS, attributes=_BIO_ALLOWED_ATTRS, css_sanitizer=_BIO_CSS_SANITIZER, strip=True))


# --- Allowed formatting is preserved ---

@pytest.mark.parametrize("html,expected", [
    ("<strong>hi</strong>",   "<strong>hi</strong>"),
    ("<em>hi</em>",           "<em>hi</em>"),
    ("<u>hi</u>",             "<u>hi</u>"),
    ("<s>hi</s>",             "<s>hi</s>"),
    ("<ul><li>item</li></ul>", "<ul><li>item</li></ul>"),
    ('<table><tbody><tr><td colspan="2">cell</td></tr></tbody></table>',
     '<table><tbody><tr><td colspan="2">cell</td></tr></tbody></table>'),
])
def test_allowed_tags_preserved(html, expected):
    assert clean(html) == expected


@pytest.mark.parametrize("css_prop,css_val", [
    ("color",            "red"),
    ("background-color", "yellow"),
    ("font-family",      "Arial"),
    ("font-size",        "14pt"),
    ("text-align",       "center"),
    ("direction",        "rtl"),
])
def test_allowed_css_preserved(css_prop, css_val):
    result = clean(f'<span style="{css_prop}: {css_val}">text</span>')
    assert css_prop in result


def test_dir_attr():
    assert 'dir="rtl"' in clean('<p dir="rtl">text</p>')


def test_link():
    result = clean('<a href="https://sefaria.org" target="_blank">link</a>')
    assert 'href="https://sefaria.org"' in result
    assert 'target="_blank"' in result
    assert 'rel="nofollow"' in result  # bleach.linkify adds this by default


def test_image():
    result = clean('<img src="https://example.com/img.png" alt="x" height="100" width="100">')
    assert 'src="https://example.com/img.png"' in result
    assert 'alt="x"' in result


# --- Security: disallowed tags are stripped ---

@pytest.mark.parametrize("html,absent", [
    ("<script>alert('xss')</script>",          "<script>"),
    ('<iframe src="https://evil.com"></iframe>', "<iframe"),
    ("<style>body { display: none }</style>",   "<style>"),
    ("<object data='evil'></object>",           "<object"),
])
def test_disallowed_tags_stripped(html, absent):
    assert absent not in clean(html)


# --- Security: disallowed attributes are stripped ---

@pytest.mark.parametrize("html,absent", [
    ('<p onclick="alert(1)">text</p>',          "onclick"),
    ('<img src="x" onerror="alert(1)">',        "onerror"),
    ('<a href="javascript:alert(1)">click</a>', 'href="javascript:'),
    ('<span data-custom="evil">text</span>',    "data-custom"),
])
def test_disallowed_attrs_stripped(html, absent):
    assert absent not in clean(html)


# --- Security: disallowed CSS properties are stripped ---

@pytest.mark.parametrize("style", [
    "display: none",
    "position: fixed; top: 0",
    "width: expression(alert(1))",
])
def test_disallowed_css_stripped(style):
    tag, prop = style.split(":")[0].strip(), style.split(":")[0].strip()
    result = clean(f'<p style="{style}">text</p>')
    assert prop not in result
