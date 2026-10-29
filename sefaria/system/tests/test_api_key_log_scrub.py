from sefaria.system.logging import scrub_api_key_query


def test_every_key_parameter_is_redacted_and_the_rest_kept():
    cases = {
        "/api/texts?api_key=sfr_test123": "/api/texts?api_key=[REDACTED]",
        "/api/texts?a=1&api_key=sfr_test123&b=2": "/api/texts?a=1&api_key=[REDACTED]&b=2",
        "/api/texts?API_KEY=sfr_test123": "/api/texts?API_KEY=[REDACTED]",
        "/api/texts?apikey=sfr_test123&x=1": "/api/texts?apikey=[REDACTED]&x=1",
        "/api/texts?api%5Fkey=sfr_test123": "/api/texts?api%5Fkey=[REDACTED]",
        "/api/texts?a=1&api_key=sfr_a&api_key=sfr_b": "/api/texts?a=1&api_key=[REDACTED]&api_key=[REDACTED]",
        "/api/texts?a=1&b=2": "/api/texts?a=1&b=2",
        "/api/texts?xapi_key=keep": "/api/texts?xapi_key=keep",
    }
    for raw, want in cases.items():
        got = scrub_api_key_query(raw)
        assert got == want, (raw, got)
        assert "sfr_" not in got


def test_encoded_parameter_names_are_redacted():
    cases = {
        "/api/texts?%61pi_key=sfr_secret": "/api/texts?%61pi_key=[REDACTED]",
        "/api/texts?api_%6bey=sfr_secret": "/api/texts?api_%6bey=[REDACTED]",
        "/api/texts?api_%4Bey=sfr_secret&x=1": "/api/texts?api_%4Bey=[REDACTED]&x=1",
        "/api/texts?%41PI%5FKEY=sfr_secret": "/api/texts?%41PI%5FKEY=[REDACTED]",
        "/api/texts?x=1&api%5fkey=sfr_secret": "/api/texts?x=1&api%5fkey=[REDACTED]",
        "/api/texts?%61%70%69%6b%65%79=sfr_secret": "/api/texts?%61%70%69%6b%65%79=[REDACTED]",
    }
    for raw, want in cases.items():
        got = scrub_api_key_query(raw)
        assert got == want, (raw, got)
        assert "sfr_" not in got


def test_only_the_query_part_is_scrubbed():
    for raw in ("/path&apikey=ordinary", "/path&apikey=ordinary#frag"):
        assert scrub_api_key_query(raw) == raw
    assert scrub_api_key_query("/path&apikey=ordinary?x=1") == "/path&apikey=ordinary?x=1"
    assert scrub_api_key_query("/path&apikey=ordinary?apikey=sfr_secret") == "/path&apikey=ordinary?apikey=[REDACTED]"
