import datetime
import io
from types import SimpleNamespace

from gunicorn.config import Config

from sefaria.system.gunicorn_logger import ScrubbingLogger

SECRET_URL = "sfr_test123"
SECRET_REFERER = "sfr_test456"


def _build(raw_uri, referer, query):
    cfg = Config()
    cfg.set("accesslog", "-")
    logger = ScrubbingLogger(cfg)
    environ = {
        "REMOTE_ADDR": "10.0.0.1",
        "REQUEST_METHOD": "GET",
        "RAW_URI": raw_uri,
        "SERVER_PROTOCOL": "HTTP/1.1",
        "PATH_INFO": raw_uri.partition("?")[0],
        "QUERY_STRING": query,
        "HTTP_REFERER": referer,
        "HTTP_USER_AGENT": "agent",
    }
    resp = SimpleNamespace(status="200 OK", sent=5, headers=[])
    req = SimpleNamespace(headers=[("Referer", referer)])
    atoms = logger.atoms(resp, req, environ, datetime.timedelta(seconds=1))
    line = cfg.access_log_format % atoms
    return atoms, line


def test_access_log_line_has_no_secret_and_keeps_other_params():
    query = "a=1&API_KEY=%s&b=2" % SECRET_URL
    referer = "https://www.sefaria.org/x?apikey=%s" % SECRET_REFERER
    atoms, line = _build("/api/texts?" + query, referer, query)
    assert SECRET_URL not in line and SECRET_REFERER not in line
    assert "a=1" in line and "b=2" in line
    assert '"GET /api/texts?a=1&API_KEY=[REDACTED]&b=2 HTTP/1.1"' in line
    assert '"https://www.sefaria.org/x?apikey=[REDACTED]"' in line
    for key in ("r", "q", "f", "{referer}i", "{raw_uri}e", "{query_string}e", "{http_referer}e"):
        assert SECRET_URL not in str(atoms[key]) and SECRET_REFERER not in str(atoms[key]), key


def test_request_without_query_or_referer_is_unchanged():
    atoms, line = _build("/api/texts", "-", "")
    assert '"GET /api/texts HTTP/1.1"' in line
    assert '"-"' in line


def test_a_full_key_pasted_into_an_admin_search_never_reaches_the_access_log():
    key = "sfr_" + "Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv"
    query = "q=" + key
    referer = "https://www.sefaria.org/admin/powered_by/apiproject/?" + query
    atoms, line = _build("/admin/powered_by/apiproject/?" + query, referer, query)
    assert "Ab1Cd2" not in line
    assert '"GET /admin/powered_by/apiproject/?q=sfr_[REDACTED] HTTP/1.1"' in line
    assert '"https://www.sefaria.org/admin/powered_by/apiproject/?q=sfr_[REDACTED]"' in line
    for atom in ("r", "q", "f", "{referer}i", "{raw_uri}e", "{query_string}e", "{http_referer}e"):
        assert "Ab1Cd2" not in str(atoms[atom]), atom


def test_a_key_with_a_percent_encoded_body_never_reaches_any_access_log_atom():
    for key, tail in (
        ("sfr_%41" + "A" * 31, "AAAAAAAA"),
        ("sfr_Ab%31Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv", "Cd2Ef3Gh4"),
        ("sfr_" + "%41" * 32, "%41%41%41%41"),
        ("sfr_%2541b12Cd34Ef56Gh78Ij90Kl12Mn34Op", "Cd34Ef56"),
    ):
        query = "q=" + key
        referer = "https://www.sefaria.org/admin/powered_by/apikey/?" + query
        atoms, line = _build("/admin/powered_by/apikey/?" + query + "&x=1", referer, query + "&x=1")
        assert tail not in line, line
        assert '"GET /admin/powered_by/apikey/?q=sfr_[REDACTED]&x=1 HTTP/1.1"' in line
        assert '"https://www.sefaria.org/admin/powered_by/apikey/?q=sfr_[REDACTED]"' in line
        for atom in ("r", "q", "f", "{referer}i", "{raw_uri}e", "{query_string}e", "{http_referer}e"):
            assert tail not in str(atoms[atom]), atom

    path_key = "sfr_%41" + "A" * 31
    atoms, line = _build("/" + path_key + "/x", "-", "")
    assert "AAAAAAAA" not in line and "/sfr_[REDACTED]/x" in line
