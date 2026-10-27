"""
Unit tests for webhooks/adapters/svix_signature.py.

The first class pins the code to the worked example in Svix's "verify manually" guide
(https://docs.svix.com/receiving/verifying-payloads/how-manual). Every other test signs with
our own svix_signature_for, so without that example the suite would only show the code
agrees with itself.
"""

import binascii

import pytest

from webhooks.adapters.svix_signature import TIMESTAMP_TOLERANCE_SECONDS, is_valid_svix_signature, svix_signature_for

# Svix's published example, copied exactly.
EXAMPLE_SECRET = "whsec_plJ3nmyCDGBKInavdOK15jsl"
EXAMPLE_MESSAGE_ID = "msg_loFOjxBNrRLzqYUf"
EXAMPLE_TIMESTAMP = 1731705121
EXAMPLE_BODY = b'{"event_type":"ping","data":{"success":true}}'
EXAMPLE_SIGNATURE = "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0="

SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
BODY = b'{"eventType":"transaction.created"}'
NOW = 1_800_000_000


def headers_for(
    body=BODY, message_id="msg_1", timestamp=NOW, secret=SECRET, prefix="svix"
):
    return {
        f"{prefix}-id": message_id,
        f"{prefix}-timestamp": str(timestamp),
        f"{prefix}-signature": svix_signature_for(secret, message_id, timestamp, body),
    }


def is_valid(headers, body=BODY, now: float = NOW, secret=SECRET):
    return is_valid_svix_signature(secret, body, headers, now=now)


class TestSvixPublishedExample:

    def test_signs_the_example_exactly_as_svix_does(self):
        """The independent check: Svix's documented signature for Svix's documented inputs."""
        assert (
            svix_signature_for(
                EXAMPLE_SECRET, EXAMPLE_MESSAGE_ID, EXAMPLE_TIMESTAMP, EXAMPLE_BODY
            )
            == EXAMPLE_SIGNATURE
        )

    def test_accepts_the_example_delivery(self):
        """The documented headers verify, checked at the documented time."""
        headers = {
            "svix-id": EXAMPLE_MESSAGE_ID,
            "svix-timestamp": str(EXAMPLE_TIMESTAMP),
            "svix-signature": EXAMPLE_SIGNATURE,
        }
        assert is_valid(
            headers, body=EXAMPLE_BODY, now=EXAMPLE_TIMESTAMP, secret=EXAMPLE_SECRET
        )


class TestWhatTheSignatureCovers:

    def test_a_changed_body_is_rejected(self):
        assert not is_valid(headers_for(), body=BODY + b" ")

    def test_a_changed_message_id_is_rejected(self):
        """The id is signed too, so a valid signature can't be reused under another id."""
        headers = {**headers_for(), "svix-id": "msg_2"}
        assert not is_valid(headers)

    def test_another_secret_is_rejected(self):
        assert not is_valid(headers_for(secret="whsec_" + "A" * 32))

    def test_a_body_that_is_not_utf8_is_checked_not_crashed_on(self):
        """The raw bytes are signed as they arrived; nothing tries to decode them."""
        body = b"\xff\xfe not utf-8"
        assert is_valid(headers_for(body=body), body=body)


class TestHeaders:

    def test_header_names_are_case_insensitive(self):
        """Django delivers Title-Case names; a plain dict would otherwise miss them."""
        headers = {name.title(): value for name, value in headers_for().items()}
        assert is_valid(headers)

    def test_the_standard_webhooks_names_are_accepted(self):
        """webhook-id / webhook-timestamp / webhook-signature are the same headers under the spec's names."""
        assert is_valid(headers_for(prefix="webhook"))

    def test_svix_names_win_when_both_are_present(self):
        """The svix library looks for svix-* first; a stale webhook-* value must not override it."""
        # The webhook-* values are wrong, so this only passes if the svix-* ones are used.
        headers = {
            **headers_for(),
            "webhook-id": "msg_other",
            "webhook-timestamp": "0",
            "webhook-signature": "v1,AAAA",
        }
        assert is_valid(headers)

    @pytest.mark.parametrize("missing", ["svix-id", "svix-timestamp", "svix-signature"])
    def test_a_missing_header_is_rejected(self, missing):
        headers = {
            name: value for name, value in headers_for().items() if name != missing
        }
        assert not is_valid(headers)


class TestSignatureEntries:

    def test_any_matching_entry_is_enough(self):
        """While a secret is being rotated, Svix sends one entry per secret."""
        headers = headers_for()
        headers["svix-signature"] = (
            f"v1,c29tZXRoaW5nIGVsc2U= {headers['svix-signature']}"
        )
        assert is_valid(headers)

    def test_a_correct_digest_under_another_version_is_rejected(self):
        """Only v1 (HMAC-SHA256) is understood; anything else must not count as a match."""
        headers = headers_for()
        headers["svix-signature"] = headers["svix-signature"].replace("v1,", "v1a,")
        assert not is_valid(headers)

    @pytest.mark.parametrize(
        "entry", ["", " ", "v1", "v1,", "v1,!!not base64!!", "v1,AAAA", "v1,ünïcode"]
    )
    def test_garbled_entries_are_rejected_without_raising(self, entry):
        """Malformed input is a 401 (rejected), never a 500."""
        headers = {**headers_for(), "svix-signature": entry}
        assert not is_valid(headers)


class TestTimestamp:

    @pytest.mark.parametrize(
        "offset", [-TIMESTAMP_TOLERANCE_SECONDS, 0, TIMESTAMP_TOLERANCE_SECONDS]
    )
    def test_accepted_within_five_minutes_either_way(self, offset):
        assert is_valid(headers_for(timestamp=NOW + offset))

    @pytest.mark.parametrize(
        "offset", [-TIMESTAMP_TOLERANCE_SECONDS - 1, TIMESTAMP_TOLERANCE_SECONDS + 1]
    )
    def test_rejected_outside_five_minutes(self, offset):
        """Too old is a replay; too far ahead means the clock or the header is wrong."""
        assert not is_valid(headers_for(timestamp=NOW + offset))

    @pytest.mark.parametrize(
        "timestamp_text",
        [
            "soon",
            " 1800000000",
            "+1800000000",
            "1800000000.0",
            "1_800_000_000",
            "١٨٠٠٠٠٠٠٠٠",  # Arabic-Indic digits: str.isdigit() and int() both accept these
        ],
    )
    def test_a_timestamp_that_is_not_plain_digits_is_rejected(self, timestamp_text):
        headers = {**headers_for(), "svix-timestamp": timestamp_text}
        assert not is_valid(headers)

    @pytest.mark.parametrize(
        "digit_count",
        [
            400,  # int() works, but `now - timestamp` raises OverflowError (too big for a float)
            5000,  # int() itself raises ValueError (Python's 4300-digit limit)
        ],
    )
    def test_an_oversized_timestamp_is_rejected_without_raising(self, digit_count):
        headers = {**headers_for(), "svix-timestamp": "9" * digit_count}
        # A float, as time.time() gives in production: NOW is an int, and int minus int never
        # overflows, so with NOW the 400-digit case would pass even without the fix.
        assert not is_valid(headers, now=float(NOW))


class TestSecret:

    def test_the_whsec_prefix_is_optional(self):
        """Svix's own libraries accept the secret either way."""
        assert is_valid(headers_for(), secret=SECRET.removeprefix("whsec_"))

    def test_a_secret_that_is_not_base64_raises(self):
        """A configuration mistake fails loudly instead of rejecting every delivery as a bad signature."""
        # A space, as a bad copy-paste leaves. Lenient base64 decoding would drop it silently and
        # sign with a different key, so every delivery would look forged with no hint why.
        with pytest.raises(binascii.Error):
            is_valid(headers_for(), secret="whsec_abcd efgh")
