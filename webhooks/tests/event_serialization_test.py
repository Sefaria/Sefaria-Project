"""
Unit tests for webhooks/event_serialization.py.

Celery arguments must be JSON, so every event crosses the queue as a dict. A round trip must
return an equal event, and the dict must survive json.dumps.
"""

import json
from datetime import datetime, timezone

import pytest

from sefaria.donors.types import (
    DonationReceivedFromClassy,
    NormalizedEmailAddress,
    PersonAsIdentifiedByClassy,
    PersonAsIdentifiedBySalesforce,
    UserBecameDonorAccordingToSalesforce,
)
from webhooks.event_serialization import deserialize_event, serialize_event

OCCURRED_AT = datetime(2026, 10, 22, 14, 3, 11, tzinfo=timezone.utc)

EVENTS = [
    DonationReceivedFromClassy("msg_1", OCCURRED_AT, PersonAsIdentifiedByClassy(5827, None), 99),
    DonationReceivedFromClassy("msg_2", OCCURRED_AT, PersonAsIdentifiedByClassy(5827, NormalizedEmailAddress("donor@example.org")), 100),
    UserBecameDonorAccordingToSalesforce("003:UserBecameDonor:x", OCCURRED_AT, PersonAsIdentifiedBySalesforce(NormalizedEmailAddress("donor@example.org"), "003", None)),
    UserBecameDonorAccordingToSalesforce("003:UserBecameDonor:y", OCCURRED_AT, PersonAsIdentifiedBySalesforce(NormalizedEmailAddress("donor@example.org"), "003", 5827)),
]


# ============================================================================
# serialize_event / deserialize_event
# ============================================================================

class TestEventSerialization:

    @pytest.mark.parametrize("event", EVENTS)
    def test_round_trip_returns_an_equal_event(self, event):
        """What the worker rebuilds is exactly what the endpoint parsed."""
        assert deserialize_event(json.loads(json.dumps(serialize_event(event)))) == event

    def test_an_unknown_serialized_event_type_raises(self):
        """A message from a newer deploy must fail loudly, not be silently dropped."""
        with pytest.raises(ValueError):
            deserialize_event({"event_type": "SomethingNew"})
