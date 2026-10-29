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
