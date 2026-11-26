import http.client
from unittest.mock import MagicMock, patch

from sefaria.system.varnish import common


def purge_request_target(url):
    connection = MagicMock()
    connection.getresponse.return_value = MagicMock(status=200)
    with patch.object(common, "HTTPConnection", return_value=connection):
        common.purge_url(url)
    return connection.request.call_args.args[1]


def test_purge_encodes_spaces_in_titles():
    target = purge_request_target("http://varnish/api/links/bare/Bava Batra/Mishneh Torah")
    assert target == "/api/links/bare/Bava%20Batra/Mishneh%20Torah"


def test_purge_keeps_commas_and_existing_escapes():
    target = purge_request_target("http://varnish/api/links/bare/Shulchan Arukh, Choshen Mishpat/Tanakh")
    assert target == "/api/links/bare/Shulchan%20Arukh,%20Choshen%20Mishpat/Tanakh"
    assert purge_request_target("http://varnish/api/texts/Genesis.1.1/he/Rashi%20on%20Genesis.1.1?commentary=0") == (
        "/api/texts/Genesis.1.1/he/Rashi%20on%20Genesis.1.1?commentary=0"
    )


def test_purge_encodes_non_ascii_titles():
    assert purge_request_target("http://varnish/api/index/בראשית") == "/api/index/%D7%91%D7%A8%D7%90%D7%A9%D7%99%D7%AA"


def test_request_target_is_a_valid_request_line():
    target = common.request_target("/api/counts/links/Mishneh Torah/Shulchan Arukh")
    connection = http.client.HTTPConnection("varnish")
    connection.putrequest("PURGE", target)
