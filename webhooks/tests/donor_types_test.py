"""
Unit tests for sefaria/donors/types.py — the value types every other donor module relies on.

No database, no Django models: types.py imports only the standard library.
"""

from datetime import datetime, timedelta, timezone

import pytest

from sefaria.donors.types import DonorStatus, NormalizedEmailAddress, as_utc_datetime


# ============================================================================
# NormalizedEmailAddress.parse
# ============================================================================

class TestNormalizedEmailAddressParse:

    @pytest.mark.parametrize("raw, expected", [
        ("donor@example.org", "donor@example.org"),
        ("  Donor@Example.ORG \n", "donor@example.org"),
        # The shape check is deliberately loose: the address is only a lookup key.
        ("a@b@c", "a@b@c"),
    ])
    def test_strips_and_lowercases(self, raw, expected):
        """The matching key is case- and whitespace-insensitive, so it is normalized once."""
        assert NormalizedEmailAddress.parse(raw) == NormalizedEmailAddress(expected)

    @pytest.mark.parametrize("raw", [None, "", "   ", "no-at-sign", "@example.org", "donor@", "a b@example.org", 42])
    def test_rejects_values_that_cannot_be_an_address(self, raw):
        """Anything that cannot identify a person returns None rather than a half-valid key."""
        assert NormalizedEmailAddress.parse(raw) is None


# ============================================================================
# DonorStatus.from_stored_value
# ============================================================================

class TestDonorStatusFromStoredValue:

    @pytest.mark.parametrize("stored, expected", [
        ("donor", DonorStatus.DONOR),
        ("non_donor", DonorStatus.NON_DONOR),
        ("unknown", DonorStatus.UNKNOWN),
    ])
    def test_decodes_each_persisted_value(self, stored, expected):
        """Every value the backend can write decodes to its own member."""
        assert DonorStatus.from_stored_value(stored) is expected

    @pytest.mark.parametrize("stored", [None, "", "DONOR", "yes", 1])
    def test_missing_or_unrecognized_values_decode_to_unknown(self, stored):
        """A profile saved before the field existed, or holding garbage, must render as unknown — never crash."""
        assert DonorStatus.from_stored_value(stored) is DonorStatus.UNKNOWN


# ============================================================================
# as_utc_datetime
# ============================================================================

class TestAsUtcDatetime:

    def test_naive_datetimes_are_read_as_utc(self):
        """pymongo here returns naive datetimes that are UTC by construction."""
        naive = datetime(2026, 10, 22, 14, 3, 11)
        assert as_utc_datetime(naive) == datetime(2026, 10, 22, 14, 3, 11, tzinfo=timezone.utc)

    def test_aware_datetimes_are_converted_to_utc(self):
        """An offset timestamp keeps its instant; only the zone changes."""
        eastern = datetime(2026, 10, 22, 10, 3, 11, tzinfo=timezone(timedelta(hours=-4)))
        assert as_utc_datetime(eastern) == datetime(2026, 10, 22, 14, 3, 11, tzinfo=timezone.utc)
        assert as_utc_datetime(eastern).tzinfo is timezone.utc
