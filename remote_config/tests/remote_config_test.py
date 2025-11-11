from django.core.exceptions import ValidationError
from django.test import TestCase

from remote_config import get as rc_get, get_all as rc_get_all, reload_cache
from remote_config.models import RemoteConfigEntry, ValueType


class RemoteConfigParsingTest(TestCase):
    def setUp(self):
        reload_cache()

    def test_parse_value_types(self):
        string_entry = RemoteConfigEntry(key="string_key", raw_value="hello", value_type=ValueType.STRING)
        int_entry = RemoteConfigEntry(key="int_key", raw_value="42", value_type=ValueType.INT)
        bool_entry_true = RemoteConfigEntry(key="bool_key", raw_value="TrUe", value_type=ValueType.BOOL)
        bool_entry_false = RemoteConfigEntry(key="bool_key_false", raw_value="0", value_type=ValueType.BOOL)
        json_entry = RemoteConfigEntry(key="json_key", raw_value='{"a": 1}', value_type=ValueType.JSON)

        self.assertEqual(string_entry.parse_value(), "hello")
        self.assertEqual(int_entry.parse_value(), 42)
        self.assertTrue(bool_entry_true.parse_value())
        self.assertFalse(bool_entry_false.parse_value())
        self.assertEqual(json_entry.parse_value(), {"a": 1})

    def test_clean_validates_raw_value(self):
        bad_int = RemoteConfigEntry(key="bad_int", raw_value="not-int", value_type=ValueType.INT)
        bad_json = RemoteConfigEntry(key="bad_json", raw_value="{bad json}", value_type=ValueType.JSON)

        with self.assertRaises(ValidationError):
            bad_int.clean()
        with self.assertRaises(ValidationError):
            bad_json.clean()


class RemoteConfigCacheTest(TestCase):
    def setUp(self):
        reload_cache()

    def test_cache_updates_on_save_and_delete(self):
        entry = RemoteConfigEntry.objects.create(
            key="feature_enabled",
            raw_value="true",
            value_type=ValueType.BOOL,
            is_active=True,
        )

        self.assertTrue(rc_get("feature_enabled"))

        entry.is_active = False
        entry.save()
        self.assertFalse(rc_get("feature_enabled"))

        entry.delete()
        self.assertNotIn("feature_enabled", rc_get_all())

    def test_cache_uses_default_for_missing_keys(self):
        RemoteConfigEntry.objects.create(
            key="timeout",
            raw_value="10",
            value_type=ValueType.INT,
            is_active=True,
        )
        self.assertEqual(rc_get("timeout"), 10)
        self.assertEqual(rc_get("missing_key", default="fallback"), "fallback")
