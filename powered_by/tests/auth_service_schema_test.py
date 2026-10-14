"""
N-E7: the auth service's Go test fixture (auth-service/internal/registry/testdata/schema.sql)
matches what the Django migrations build, for everything the auth service reads: the key table's
columns and CHECK constraints, the project columns it selects, the NOTIFY function and its
triggers. Postgres only.

Tests whose name ends in known_gap_<id> assert the desired behaviour and fail today. They carry
the `failing` marker, so the default CI run (-m "not failing") leaves them out.
"""
import re
import unittest
from pathlib import Path

import pytest
from django.conf import settings
from django.db import connection
from django.test import TestCase

FIXTURE = Path(settings.BASE_DIR) / "auth-service" / "internal" / "registry" / "testdata" / "schema.sql"
FIXTURE_SCHEMA = "authsvc_fixture"
TABLES = ("powered_by_apikey", "powered_by_project")


def normalise(sql):
    return re.sub(r"\s+", " ", sql or "").strip()


def describe(cursor, schema):
    """The parts of the schema the auth service depends on, in a comparable shape."""
    cursor.execute("SET LOCAL search_path TO " + schema)
    cursor.execute("""
        SELECT table_name, column_name, data_type, character_maximum_length, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema = %s AND table_name = ANY(%s)
    """, [schema, list(TABLES)])
    columns = {(t, c): {"type": dt, "length": length, "nullable": nullable, "default": default}
               for t, c, dt, length, nullable, default in cursor.fetchall()}
    cursor.execute("""
        SELECT rel.relname, pg_get_constraintdef(con.oid)
        FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        WHERE ns.nspname = %s AND rel.relname = ANY(%s) AND con.contype = 'c'
    """, [schema, list(TABLES)])
    checks = {(t, normalise(d)) for t, d in cursor.fetchall()}
    cursor.execute("""
        SELECT tg.tgname, pg_get_triggerdef(tg.oid)
        FROM pg_trigger tg JOIN pg_class rel ON rel.oid = tg.tgrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        WHERE ns.nspname = %s AND rel.relname = ANY(%s) AND NOT tg.tgisinternal
    """, [schema, list(TABLES)])
    triggers = {name: normalise(definition.replace(schema + ".", "")) for name, definition in cursor.fetchall()}
    cursor.execute("""
        SELECT p.prosrc FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = %s AND p.proname = 'apikeys_notify'
    """, [schema])
    function = [normalise(src) for (src,) in cursor.fetchall()]
    return {"columns": columns, "checks": checks, "triggers": triggers, "function": function}


@unittest.skipUnless(connection.vendor == "postgresql", "the triggers and CHECK constraints exist on Postgres only")
class AuthServiceFixtureSchemaTest(TestCase):
    databases = "__all__"

    @classmethod
    def setUpTestData(cls):
        with connection.cursor() as cursor:
            cursor.execute("CREATE SCHEMA " + FIXTURE_SCHEMA)
            cursor.execute("SET LOCAL search_path TO " + FIXTURE_SCHEMA)
            cursor.execute(FIXTURE.read_text())
            cls.fixture = describe(cursor, FIXTURE_SCHEMA)
            cls.django = describe(cursor, "public")
            cursor.execute("SET LOCAL search_path TO public")

    def fixture_columns(self, table):
        return {c: v for (t, c), v in self.fixture["columns"].items() if t == table}

    def django_columns(self, table, names):
        return {c: v for (t, c), v in self.django["columns"].items() if t == table and c in names}

    @staticmethod
    def without_defaults(columns):
        return {c: {k: v for k, v in d.items() if k != "default"} for c, d in columns.items()}

    def test_N_E7_the_key_table_has_the_same_columns(self):
        fixture = self.fixture_columns("powered_by_apikey")
        django = self.django_columns("powered_by_apikey", set(fixture) | {
            c for (t, c) in self.django["columns"] if t == "powered_by_apikey"})

        self.assertEqual(self.without_defaults(fixture), self.without_defaults(django))

    def test_N_E7_the_project_columns_the_auth_service_reads_match(self):
        fixture = self.fixture_columns("powered_by_project")
        django = self.django_columns("powered_by_project", set(fixture))

        self.assertEqual(set(django), set(fixture))
        self.assertEqual(self.without_defaults(fixture), self.without_defaults(django))

    def test_N_E7_every_database_default_django_sets_is_in_the_fixture(self):
        for (table, column), django in self.django["columns"].items():
            fixture = self.fixture["columns"].get((table, column))
            if fixture is None or django["default"] is None or "nextval(" in django["default"]:
                continue
            self.assertEqual(fixture["default"], django["default"], (table, column))

    @pytest.mark.failing
    def test_N_E7_the_key_table_has_the_same_check_constraints_known_gap_N_E7(self):
        self.assertEqual(
            {d for t, d in self.fixture["checks"] if t == "powered_by_apikey"},
            {d for t, d in self.django["checks"] if t == "powered_by_apikey"},
        )

    def test_N_E7_the_notify_triggers_are_identical(self):
        self.assertTrue(self.fixture["triggers"])
        self.assertEqual(self.fixture["triggers"], self.django["triggers"])

    def test_N_E7_the_notify_function_is_identical(self):
        self.assertEqual(len(self.django["function"]), 1)
        self.assertEqual(self.fixture["function"], self.django["function"])
