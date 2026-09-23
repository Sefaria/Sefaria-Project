import pytest
from sefaria.model.user_profile import sanitize_bio


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
    assert sanitize_bio(html) == expected


@pytest.mark.parametrize("css_prop,css_val", [
    ("color",            "red"),
    ("background-color", "yellow"),
    ("font-family",      "Arial"),
    ("font-size",        "14pt"),
    ("text-align",       "center"),
    ("direction",        "rtl"),
])
def test_allowed_css_preserved(css_prop, css_val):
    assert css_prop in sanitize_bio(f'<span style="{css_prop}: {css_val}">text</span>')


def test_dir_attr():
    assert 'dir="rtl"' in sanitize_bio('<p dir="rtl">text</p>')


def test_link():
    result = sanitize_bio('<a href="https://sefaria.org" target="_blank">link</a>')
    assert 'href="https://sefaria.org"' in result
    assert 'target="_blank"' in result
    assert 'nofollow' in result


def test_image():
    result = sanitize_bio('<img src="https://example.com/img.png" alt="x" height="100" width="100">')
    assert 'src="https://example.com/img.png"' in result
    assert 'alt="x"' in result


# --- Security: disallowed tags are stripped ---

@pytest.mark.parametrize("html,absent", [
    ("<script>alert('xss')</script>",           "<script>"),
    ('<iframe src="https://evil.com"></iframe>', "<iframe"),
    ("<style>body { display: none }</style>",   "<style>"),
    ("<object data='evil'></object>",           "<object"),
])
def test_disallowed_tags_stripped(html, absent):
    assert absent not in sanitize_bio(html)


# --- Security: disallowed attributes are stripped ---

@pytest.mark.parametrize("html,absent", [
    ('<p onclick="alert(1)">text</p>',          "onclick"),
    ('<img src="x" onerror="alert(1)">',        "onerror"),
    ('<a href="javascript:alert(1)">click</a>', 'href="javascript:'),
    ('<span data-custom="evil">text</span>',    "data-custom"),
])
def test_disallowed_attrs_stripped(html, absent):
    assert absent not in sanitize_bio(html)


# --- Security: disallowed CSS properties are stripped ---

@pytest.mark.parametrize("style", [
    "display: none",
    "position: fixed; top: 0",
    "width: expression(alert(1))",
])
def test_disallowed_css_stripped(style):
    result = sanitize_bio(f'<p style="{style}">text</p>')
    for declaration in style.split(";"):
        if ":" in declaration:
            assert declaration.split(":")[0].strip() not in result


# --- Security: reverse-tabnabbing protection ---

def test_target_blank_gets_noopener():
    result = sanitize_bio('<a href="https://sefaria.org" target="_blank">link</a>')
    assert 'noopener' in result or 'noreferrer' in result
