"""
remote_config/migrations/0005_client_web_vitals.py: `webVitals` (off) in `feature.client.remote_config_json`, idempotent, never
overwriting what an admin set.
"""

import importlib
import json

from django.apps import apps
from django.test import TestCase

from remote_config.models import RemoteConfigEntry

migration = importlib.import_module("remote_config.migrations.0005_client_web_vitals")
KEY = migration.KEY
OFF = {"enabled": 0, "sampleRate": 0.1}


class ClientWebVitalsMigrationTestCase(TestCase):
    def setUp(self):
        RemoteConfigEntry.objects.filter(key=KEY).delete()

    def run_migration(self, times=1):
        for _ in range(times):
            migration.add_web_vitals(apps, None)
        return RemoteConfigEntry.objects.get(key=KEY)

    def row(self, raw, value_type="json"):
        return RemoteConfigEntry.objects.create(key=KEY, raw_value=raw, value_type=value_type, is_active=True)

    def test_missing_row_is_created_off(self):
        entry = self.run_migration()
        self.assertEqual(entry.value_type, "json")
        self.assertEqual(json.loads(entry.raw_value), {"webVitals": OFF})
        self.assertTrue(entry.is_active)

    def test_existing_object_keeps_its_keys_and_gains_web_vitals(self):
        self.row(json.dumps({"showPromo": True, "nested": {"a": 1}}))
        entry = self.run_migration()
        self.assertEqual(json.loads(entry.raw_value), {"showPromo": True, "nested": {"a": 1}, "webVitals": OFF})

    def test_the_admins_text_is_kept_as_written(self):
        pretty = '{\n    "promo": "שבת שלום",\n    "b": [1, 2]\n}'
        self.row(pretty)
        self.assertEqual(
            self.run_migration().raw_value,
            '{\n    "promo": "שבת שלום",\n    "b": [1, 2],\n    "webVitals": {"enabled": 0, "sampleRate": 0.1}\n}',
        )
        compact = '{"z": 1, "a": "אור"}'
        RemoteConfigEntry.objects.filter(key=KEY).delete()
        self.row(compact)
        self.assertEqual(
            self.run_migration().raw_value, '{"z": 1, "a": "אור", "webVitals": {"enabled": 0, "sampleRate": 0.1}}'
        )
        RemoteConfigEntry.objects.filter(key=KEY).delete()
        self.row("{ }")
        self.assertEqual(json.loads(self.run_migration().raw_value), {"webVitals": OFF})

    def test_admin_web_vitals_never_overwritten(self):
        raw = json.dumps({"webVitals": {"enabled": 1, "sampleRate": 0.5}})
        self.row(raw)
        self.assertEqual(self.run_migration().raw_value, raw)

    def test_idempotent(self):
        once = self.run_migration().raw_value
        self.assertEqual(self.run_migration(times=2).raw_value, once)
        self.assertEqual(RemoteConfigEntry.objects.filter(key=KEY).count(), 1)

    def test_rows_that_are_not_json_objects_are_left_alone(self):
        for raw, value_type in (("[1, 2]", "json"), ('{"a": 1}', "string")):
            with self.subTest(raw=raw, value_type=value_type):
                RemoteConfigEntry.objects.filter(key=KEY).delete()
                self.row(raw, value_type)
                entry = self.run_migration()
                self.assertEqual((entry.raw_value, entry.value_type), (raw, value_type))
