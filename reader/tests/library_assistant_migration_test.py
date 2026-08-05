# -*- coding: utf-8 -*-
"""
The opt-out flip and its undo: `scripts/migrations/migrate_experiments_to_library_assistant.py`
and `scripts/migrations/rollback_library_assistant_migration.py`.

Running the migration is the launch, so the cohort rules are the highest-stakes logic in
the change: a user who deliberately left the beta must stay off, and a user who never
chose must come on. Both scripts reach Mongo only through their module-level `db`, so
these tests point that at a scratch database and drive the real functions — the assertions
are about what the scripts actually write, not about a reimplementation of their rules.

The Postgres side is the real `UserExperimentSettings` table on the Django test database.
"""

import importlib.util
import io
import os
import sys
from contextlib import redirect_stdout
from pathlib import Path

from django.test import TestCase

from reader.conftest import create_test_user
from reader.models import UserExperimentSettings
from sefaria.helper.library_assistant import SETTING_KEY
from sefaria.system.database import client

# Per process: `setUp` drops this database outright, so a fixed name lets two concurrent
# runs against one Mongo server destroy each other's fixtures mid-test.
SCRATCH_DB = f"sefaria_test_library_assistant_migration_{os.getpid()}"
MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "scripts" / "migrations"


def _load_script(name):
    """Import a `scripts/migrations` module by path — the directory is not a package."""
    if str(MIGRATIONS_DIR) not in sys.path:
        # The rollback script imports the migration script by bare name, exactly as it
        # resolves when run as `python scripts/migrations/rollback_...py`.
        sys.path.insert(0, str(MIGRATIONS_DIR))
    spec = importlib.util.spec_from_file_location(name, MIGRATIONS_DIR / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


migrate_script = _load_script("migrate_experiments_to_library_assistant")
rollback_script = _load_script("rollback_library_assistant_migration")


class MigrationTestCase(TestCase):
    databases = "__all__"

    def setUp(self):
        # The shared client, so the scratch database is reached however this deployment
        # reaches Mongo — bare host, authenticated, or replica set alike.
        client.drop_database(SCRATCH_DB)
        self.db = client[SCRATCH_DB]
        # Both scripts reach Mongo only through their module-level `db`. Pointing that at
        # a scratch database keeps the real `profiles` collection — a restored public dump
        # of a quarter-million real people — entirely out of the test's path.
        #
        # Registered as cleanups rather than done in `tearDown`, which unittest skips
        # entirely when a subclass `setUp` raises after the globals are already repointed.
        self._real_dbs = (migrate_script.db, rollback_script.db)
        self.addCleanup(client.drop_database, SCRATCH_DB)
        self.addCleanup(self._restore_script_dbs)
        migrate_script.db = self.db
        rollback_script.db = self.db

    def _restore_script_dbs(self):
        migrate_script.db, rollback_script.db = self._real_dbs

    # -- fixtures ---------------------------------------------------------------

    def make_profile(self, settings=None, experiments=None):
        """A profile document in the scratch collection, owned by a synthetic user."""
        user = create_test_user("la-migration")
        doc = {"id": user.id, "slug": f"user-{user.id}", "settings": settings or {}}
        if experiments is not None:
            doc["experiments"] = experiments
        self.db.profiles.insert_one(doc)
        return user

    def enroll(self, user, experiments):
        """The whitelist row every deliberate beta choice went through."""
        return UserExperimentSettings.objects.create(user=user, experiments=experiments)

    # -- assertions -------------------------------------------------------------

    def stored(self, user):
        profile = self.db.profiles.find_one({"id": user.id}) or {}
        return profile.get("settings", {}).get(SETTING_KEY, "<absent>")

    def archive_for(self, user):
        return list(self.db[migrate_script.ARCHIVE_COLLECTION].find({"uid": user.id}))

    def run_migration(self, **kwargs):
        out = io.StringIO()
        with redirect_stdout(out):
            migrate_script.migrate(**kwargs)
        return out.getvalue()

    def run_rollback(self, **kwargs):
        out = io.StringIO()
        with redirect_stdout(out):
            rollback_script.rollback(**kwargs)
        return out.getvalue()


class CohortTest(MigrationTestCase):
    """
    Who ends up on and who ends up off. Postgres rows are the only record of a
    deliberate choice; the Mongo `experiments` field is not a signal.
    """

    def test_whitelist_row_on_stays_on(self):
        user = self.make_profile(experiments=True)
        self.enroll(user, True)

        self.run_migration()

        self.assertIs(self.stored(user), True)

    def test_whitelist_row_off_stays_off(self):
        user = self.make_profile(experiments=False)
        self.enroll(user, False)

        self.run_migration()

        self.assertIs(self.stored(user), False)

    def test_no_whitelist_row_is_turned_on(self):
        user = self.make_profile()

        self.run_migration()

        self.assertIs(self.stored(user), True)

    def test_experiments_false_without_a_row_is_not_an_opt_out(self):
        """
        `UserProfile` defaults `experiments` to False and serializes it on every save, so
        most never-enrolled profiles carry it. Reading that as a choice would leave the
        bulk of the userbase off.
        """
        user = self.make_profile(experiments=False)

        self.run_migration()

        self.assertIs(self.stored(user), True)

    def test_the_postgres_row_wins_over_the_mongo_field(self):
        """A row saying off beats a Mongo field saying on, and vice versa."""
        contradicts_on = self.make_profile(experiments=True)
        self.enroll(contradicts_on, False)
        contradicts_off = self.make_profile(experiments=False)
        self.enroll(contradicts_off, True)

        self.run_migration()

        self.assertIs(self.stored(contradicts_on), False)
        self.assertIs(self.stored(contradicts_off), True)


class ExistingKeyTest(MigrationTestCase):
    """A profile that already carries the key has an answer already — leave it alone."""

    def test_existing_true_is_untouched(self):
        user = self.make_profile(settings={SETTING_KEY: True})
        self.enroll(user, False)

        self.run_migration()

        self.assertIs(self.stored(user), True)
        self.assertEqual(self.archive_for(user), [])

    def test_existing_false_is_untouched(self):
        user = self.make_profile(settings={SETTING_KEY: False})

        self.run_migration()

        self.assertIs(self.stored(user), False)
        self.assertEqual(self.archive_for(user), [])

    def test_rerunning_writes_nothing_and_archives_nothing_new(self):
        user = self.make_profile()
        self.run_migration()
        archived_after_first = len(self.archive_for(user))

        output = self.run_migration()

        self.assertEqual(archived_after_first, 1)
        self.assertEqual(len(self.archive_for(user)), 1)
        self.assertIn("Profiles written: 0", output)

    def test_a_catch_up_run_reaches_only_the_stragglers(self):
        """Phase 3's pre-step: re-run, and only profiles still missing the key change."""
        migrated = self.make_profile()
        self.run_migration()
        straggler = self.make_profile()

        output = self.run_migration()

        self.assertIs(self.stored(straggler), True)
        self.assertEqual(len(self.archive_for(migrated)), 1)
        self.assertIn("Profiles written: 1", output)


class UntouchedStateTest(MigrationTestCase):
    """The migration writes one key and nothing else."""

    def test_mongo_experiments_field_is_not_modified(self):
        on = self.make_profile(experiments=True)
        self.enroll(on, True)
        off = self.make_profile(experiments=False)

        self.run_migration()

        self.assertIs(self.db.profiles.find_one({"id": on.id})["experiments"], True)
        self.assertIs(self.db.profiles.find_one({"id": off.id})["experiments"], False)

    def test_the_whitelist_table_is_not_modified(self):
        user = self.make_profile()
        row = self.enroll(user, False)

        self.run_migration()

        row.refresh_from_db()
        self.assertIs(row.experiments, False)
        self.assertEqual(UserExperimentSettings.objects.count(), 1)

    def test_other_settings_survive(self):
        user = self.make_profile(settings={"interface_language": "hebrew"})

        self.run_migration()

        settings = self.db.profiles.find_one({"id": user.id})["settings"]
        self.assertEqual(settings["interface_language"], "hebrew")
        self.assertIs(settings[SETTING_KEY], True)

    def test_a_row_without_a_profile_document_is_skipped_quietly(self):
        """Enrolled users whose profile doc is gone must not abort the run."""
        ghost = create_test_user("la-migration-ghost")
        self.enroll(ghost, True)
        present = self.make_profile()

        self.run_migration()

        self.assertIsNone(self.db.profiles.find_one({"id": ghost.id}))
        self.assertIs(self.stored(present), True)


class DuplicateProfileDocumentTest(MigrationTestCase):
    """
    A few user ids own more than one document in `db.profiles` — 15 of them in the public
    dump. Counting documents instead of users made `left alone` come out negative.
    """

    def make_duplicated_profile(self):
        user = self.make_profile()
        self.db.profiles.insert_one({"id": user.id, "slug": f"user-{user.id}-duplicate", "settings": {}})
        return user

    def test_every_document_for_the_user_gets_the_setting(self):
        user = self.make_duplicated_profile()

        self.run_migration()

        values = [d.get("settings", {}).get(SETTING_KEY) for d in self.db.profiles.find({"id": user.id})]
        self.assertEqual(values, [True, True])

    def test_the_user_is_counted_and_archived_once(self):
        user = self.make_duplicated_profile()

        output = self.run_migration()

        self.assertIn("Profiles written: 1", output)
        self.assertEqual(len(self.archive_for(user)), 1)

    def test_rollback_reports_one_user_not_two_documents(self):
        self.make_duplicated_profile()
        self.run_migration()

        output = self.run_rollback()

        self.assertIn(f"{SETTING_KEY} unset on 1 users", output)
        self.assertIn("left alone (user changed it after the migration, or profile gone): 0", output)

    def test_rollback_dry_run_agrees_with_the_real_run(self):
        self.make_duplicated_profile()
        self.make_profile()
        self.run_migration()

        dry = self.run_rollback(dry_run=True)
        real = self.run_rollback()

        self.assertIn(f"{SETTING_KEY} unset on 2 users (dry run)", dry)
        self.assertIn(f"{SETTING_KEY} unset on 2 users", real)

    def test_migration_dry_run_counts_the_user_once(self):
        """
        The dry-run cohort sizes are what the runbook is sanity-checked against before
        anything is written, so they are the numbers that most need to mean users.
        """
        self.make_duplicated_profile()

        output = self.run_migration(dry_run=True)

        self.assertIn(f"no whitelist row (never chose)   -> {SETTING_KEY}=True :  1", output)

    def test_a_duplicated_opt_out_stays_off_in_every_document(self):
        """The whitelist cohorts run through the same writer, and an opt-out is the user
        the launch most has to not break."""
        user = self.make_duplicated_profile()
        self.enroll(user, False)

        self.run_migration()

        values = [d.get("settings", {}).get(SETTING_KEY) for d in self.db.profiles.find({"id": user.id})]
        self.assertEqual(values, [False, False])
        self.assertEqual([e["value"] for e in self.archive_for(user)], [False])


class DryRunTest(MigrationTestCase):
    """`--dry-run` is what the runbook sanity-checks the cohort sizes against."""

    def setUp(self):
        super().setUp()
        self.row_on = self.make_profile()
        self.enroll(self.row_on, True)
        self.row_off = self.make_profile()
        self.enroll(self.row_off, False)
        self.backfill = self.make_profile()

    def test_nothing_is_written(self):
        self.run_migration(dry_run=True)

        self.assertEqual(self.stored(self.row_on), "<absent>")
        self.assertEqual(self.stored(self.row_off), "<absent>")
        self.assertEqual(self.stored(self.backfill), "<absent>")

    def test_nothing_is_archived(self):
        self.run_migration(dry_run=True)

        self.assertEqual(self.db[migrate_script.ARCHIVE_COLLECTION].count_documents({}), 0)

    def test_the_three_cohort_counts_are_reported(self):
        output = self.run_migration(dry_run=True)

        self.assertIn(f"whitelist row, experiments=True  -> {SETTING_KEY}=True :  1", output)
        self.assertIn(f"whitelist row, experiments=False -> {SETTING_KEY}=False:  1", output)
        self.assertIn(f"no whitelist row (never chose)   -> {SETTING_KEY}=True :  1", output)

    def test_counts_exclude_profiles_that_already_carry_the_key(self):
        """A dry run before a catch-up must predict the catch-up, not the first run."""
        self.run_migration()

        output = self.run_migration(dry_run=True)

        self.assertIn(f"whitelist row, experiments=True  -> {SETTING_KEY}=True :  0", output)
        self.assertIn(f"whitelist row, experiments=False -> {SETTING_KEY}=False:  0", output)
        self.assertIn(f"no whitelist row (never chose)   -> {SETTING_KEY}=True :  0", output)


class ArchiveTest(MigrationTestCase):
    """The archive is the historical record and the rollback's only input."""

    def test_each_write_is_archived_with_its_value_and_cohort(self):
        row_off = self.make_profile()
        self.enroll(row_off, False)
        backfill = self.make_profile()

        self.run_migration()

        (row_entry,) = self.archive_for(row_off)
        self.assertIs(row_entry["value"], False)
        self.assertEqual(row_entry["cohort"], migrate_script.COHORT_ROW)
        (backfill_entry,) = self.archive_for(backfill)
        self.assertIs(backfill_entry["value"], True)
        self.assertEqual(backfill_entry["cohort"], migrate_script.COHORT_BACKFILL)

    def test_one_run_id_covers_the_whole_run(self):
        first = self.make_profile()
        self.enroll(first, False)
        second = self.make_profile()

        self.run_migration()

        run_ids = {e["run_id"] for e in self.db[migrate_script.ARCHIVE_COLLECTION].find()}
        self.assertEqual(len(run_ids), 1)

    def test_separate_runs_get_separate_run_ids(self):
        self.make_profile()
        self.run_migration()
        self.make_profile()

        self.run_migration()

        run_ids = {e["run_id"] for e in self.db[migrate_script.ARCHIVE_COLLECTION].find()}
        self.assertEqual(len(run_ids), 2)


class RollbackTest(MigrationTestCase):
    """
    Rollback unsets only what the migration wrote and only where it is unchanged — a
    preference the user expressed after the flip is a real choice and must survive.
    """

    def test_migrated_profiles_are_unset(self):
        backfill = self.make_profile()
        row_off = self.make_profile()
        self.enroll(row_off, False)
        self.run_migration()

        self.run_rollback()

        self.assertEqual(self.stored(backfill), "<absent>")
        self.assertEqual(self.stored(row_off), "<absent>")

    def test_a_choice_made_after_the_flip_survives(self):
        user = self.make_profile()
        self.run_migration()
        # The user found the assistant and turned it off themselves.
        self.db.profiles.update_one({"id": user.id}, {"$set": {f"settings.{SETTING_KEY}": False}})

        output = self.run_rollback()

        self.assertIs(self.stored(user), False)
        self.assertIn("left alone", output)

    def test_a_profile_the_migration_never_touched_is_left_alone(self):
        pre_existing = self.make_profile(settings={SETTING_KEY: True})
        self.run_migration()

        self.run_rollback()

        self.assertIs(self.stored(pre_existing), True)

    def test_run_id_scopes_the_rollback_to_one_run(self):
        first = self.make_profile()
        self.run_migration()
        second = self.make_profile()
        self.run_migration()
        second_run_id = self.archive_for(second)[0]["run_id"]

        self.run_rollback(run_id=second_run_id)

        self.assertIs(self.stored(first), True)
        self.assertEqual(self.stored(second), "<absent>")

    def test_dry_run_writes_nothing(self):
        user = self.make_profile()
        self.run_migration()

        output = self.run_rollback(dry_run=True)

        self.assertIs(self.stored(user), True)
        self.assertIn(f"{SETTING_KEY} unset on 1 users (dry run)", output)

    def test_nothing_archived_is_reported_not_crashed(self):
        self.make_profile()

        output = self.run_rollback()

        self.assertIn("Nothing archived", output)

    def test_a_profile_written_by_two_runs_is_unset_once(self):
        """
        Relaunching after a rollback archives the same profile twice. The counts have to
        stay per-profile, or a rollback that worked reports itself as one that did nothing.
        """
        backfill = self.make_profile()
        row_off = self.make_profile()
        self.enroll(row_off, False)
        self.run_migration()
        self.run_rollback()
        self.run_migration()

        output = self.run_rollback()

        self.assertIn(f"{SETTING_KEY} unset on 2 users", output)
        self.assertIn("left alone (user changed it after the migration, or profile gone): 0", output)
        self.assertEqual(self.stored(backfill), "<absent>")
        self.assertEqual(self.stored(row_off), "<absent>")

    def test_dry_run_counts_a_twice_written_profile_once(self):
        self.make_profile()
        self.run_migration()
        self.run_rollback()
        self.run_migration()

        output = self.run_rollback(dry_run=True)

        self.assertIn(f"{SETTING_KEY} unset on 1 users", output)

    def test_left_alone_counts_only_users_who_really_changed_it(self):
        changed = self.make_profile()
        untouched = self.make_profile()
        self.run_migration()
        self.run_rollback()
        self.run_migration()
        self.db.profiles.update_one({"id": changed.id}, {"$set": {f"settings.{SETTING_KEY}": False}})

        output = self.run_rollback(dry_run=True)

        self.assertIn("left alone (user changed it after the migration, or profile gone): 1", output)
        self.assertIn(f"{SETTING_KEY} unset on 1 users", output)
        self.assertIs(self.stored(untouched), True)

    def test_the_most_recently_written_value_is_the_one_rolled_back(self):
        """A user's cohort can change between runs; the latest write is what to undo."""
        user = self.make_profile()
        row = self.enroll(user, True)
        self.run_migration()
        self.run_rollback()
        row.experiments = False
        row.save()
        self.run_migration()
        self.assertIs(self.stored(user), False)

        self.run_rollback()

        self.assertEqual(self.stored(user), "<absent>")

    def test_rolling_back_then_re_migrating_restores_the_same_values(self):
        """The rollback window has to be genuinely re-enterable."""
        row_off = self.make_profile()
        self.enroll(row_off, False)
        backfill = self.make_profile()
        self.run_migration()
        self.run_rollback()

        self.run_migration()

        self.assertIs(self.stored(row_off), False)
        self.assertIs(self.stored(backfill), True)


class RollbackFidelityTest(MigrationTestCase):
    """
    The rollback's contract is not "the key is gone" — it is "the profile is what it was".

    Every other rollback assertion here reads a single key through `stored()`, so a
    rollback that removed the setting and left the document altered in any other way would
    satisfy all of them. These compare whole documents instead, which is the only form of
    the claim an operator is relying on when they reach for the script.
    """

    def snapshot(self):
        """Every profile document, keyed by the `_id` the scripts never write."""
        return {str(doc.pop("_id")): doc for doc in self.db.profiles.find()}

    def whitelist_rows(self):
        return sorted(UserExperimentSettings.objects.values_list("user_id", "experiments"))

    def make_population(self):
        """One profile per shape the migration encounters in the dump."""
        row_on = self.make_profile(experiments=True)
        self.enroll(row_on, True)
        row_off = self.make_profile(experiments=False)
        self.enroll(row_off, False)
        self.make_profile()
        self.make_profile(settings={SETTING_KEY: True})
        self.make_profile(settings={"interface_language": "hebrew"})

        duplicated = self.make_profile()
        self.db.profiles.insert_one(
            {"id": duplicated.id, "slug": f"user-{duplicated.id}-duplicate", "settings": {}}
        )

    def test_rollback_restores_every_profile_document_exactly(self):
        self.make_population()
        before = self.snapshot()

        self.run_migration()
        self.run_rollback()

        self.assertEqual(self.snapshot(), before)

    def test_rollback_leaves_the_whitelist_table_untouched(self):
        """The rollback's inputs live in Postgres; it must not write there."""
        self.make_population()
        before = self.whitelist_rows()

        self.run_migration()
        self.run_rollback()

        self.assertEqual(self.whitelist_rows(), before)

    def test_a_second_flip_and_rollback_still_restores_exactly(self):
        """The second rollback is the one an operator reaches for under pressure."""
        self.make_population()
        before = self.snapshot()

        self.run_migration()
        self.run_rollback()
        self.run_migration()
        self.run_rollback()

        self.assertEqual(self.snapshot(), before)

    def test_a_profile_with_no_settings_keeps_an_empty_one(self):
        """
        `$set settings.library_assistant` creates the subdocument, and unsetting the leaf
        leaves `settings: {}` rather than removing what it created. No profile in the dump
        has this shape — every one carries settings, because saving a profile serializes
        them with defaults — so this is pinned rather than fixed: the residue is inert,
        and a rollback that started deleting the whole subdocument would be the real risk.
        """
        user = create_test_user("la-migration-bare")
        self.db.profiles.insert_one({"id": user.id, "slug": f"user-{user.id}"})

        self.run_migration()
        self.run_rollback()

        self.assertEqual(self.db.profiles.find_one({"id": user.id})["settings"], {})
