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


def test_value_is_redacted_through_the_next_ampersand_including_a_hash():
    cases = {
        "/api/texts?api_key=prefix#sfr_secret": "/api/texts?api_key=[REDACTED]",
        "/api/texts?api_key=prefix#sfr_secret&x=1": "/api/texts?api_key=[REDACTED]&x=1",
        "/api/texts?x=1&apikey=a#b#sfr_c&y=2": "/api/texts?x=1&apikey=[REDACTED]&y=2",
    }
    for raw, want in cases.items():
        got = scrub_api_key_query(raw)
        assert got == want, (raw, got)
        assert "sfr_" not in got


def test_hash_in_key_value_is_scrubbed_through_decompose_request_info():
    from django.test import RequestFactory

    from sefaria.system.logging import decompose_request_info

    request = RequestFactory().get("/api/texts", QUERY_STRING="api_key=prefix#sfr_secret")
    assert "sfr_secret" in request.get_full_path()
    event = decompose_request_info(None, "info", {"request": request})
    assert event["httpRequest"]["requestUrl"] == "/api/texts?api_key=[REDACTED]"


def test_names_count_only_at_the_start_of_the_query_or_after_an_ampersand():
    unchanged = [
        "/x?next=https://example.org/?apikey=public",
        "/x?a=1&next=https://example.org/?api_key=public",
    ]
    for raw in unchanged:
        assert scrub_api_key_query(raw) == raw
    assert (
        scrub_api_key_query("/x?apikey=sfr_test1&next=https://e.org/?q=1")
        == "/x?apikey=[REDACTED]&next=https://e.org/?q=1"
    )
    assert (
        scrub_api_key_query("/x?next=https://e.org/?q=1&apikey=sfr_test1")
        == "/x?next=https://e.org/?q=1&apikey=[REDACTED]"
    )


FULL_KEY = "sfr_" + "Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv"  # the real shape: sfr_ + 32 letters and digits


def test_a_full_key_is_redacted_in_any_parameter_the_path_or_a_referer():
    cases = {
        f"/admin/powered_by/apiproject/?q={FULL_KEY}": "/admin/powered_by/apiproject/?q=sfr_[REDACTED]",
        f"/admin/powered_by/apiproject/?o=1&q={FULL_KEY}&p=2": "/admin/powered_by/apiproject/?o=1&q=sfr_[REDACTED]&p=2",
        f"/api/{FULL_KEY}/texts": "/api/sfr_[REDACTED]/texts",
        f"https://www.sefaria.org/admin/powered_by/apiproject/?q={FULL_KEY}": (
            "https://www.sefaria.org/admin/powered_by/apiproject/?q=sfr_[REDACTED]"
        ),
        "/admin/?q=sfr%5FAb1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv": "/admin/?q=sfr_[REDACTED]",
        "/admin/?q=%73fr_Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv": "/admin/?q=sfr_[REDACTED]",
        f"/admin/?q=x&q={FULL_KEY}#top": "/admin/?q=x&q=sfr_[REDACTED]#top",
    }
    for raw, want in cases.items():
        got = scrub_api_key_query(raw)
        assert got == want, (raw, got)
        assert "Ab1Cd2" not in got


def test_the_displayed_key_prefix_is_not_a_secret_and_stays_searchable_in_logs():
    url = "/admin/powered_by/apiproject/?q=sfr_Ab1Cd2"  # sfr_ + the 6 characters the admin shows
    assert scrub_api_key_query(url) == url


def test_the_structlog_request_processor_redacts_a_full_key_in_any_parameter():
    from django.test import RequestFactory

    from sefaria.system.logging import decompose_request_info

    request = RequestFactory().get("/admin/powered_by/apiproject/", {"q": FULL_KEY})
    event = decompose_request_info(None, "info", {"request": request})

    assert "Ab1Cd2" not in str(event)
    assert "sfr_[REDACTED]" in event["httpRequest"]["requestUrl"]
