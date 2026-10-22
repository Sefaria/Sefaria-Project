"""
ApiProject, ApiTier and ApiTierMeterLimit (migration 0006): the database refuses a second live
API project for one profile, an unknown tier, and a deleted owner leaves the project in place
with no owner. The three tiers are seeded by the migration.
"""
from django.contrib.auth.models import User
from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.utils import timezone

from powered_by.models import ApiProject, ApiTier, ApiTierMeterLimit, Project, SubmissionSource


class ApiProjectModelTest(TestCase):
    databases = "__all__"

    def setUp(self):
        self.profile = Project.objects.create(
            submission_source=SubmissionSource.MANUAL, project_name="Profile", is_published=False)

    def test_second_live_api_project_for_a_profile_is_refused(self):
        ApiProject.objects.create(profile=self.profile)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ApiProject.objects.create(profile=self.profile)

    def test_deleted_api_project_frees_the_profile(self):
        first = ApiProject.objects.create(profile=self.profile)
        first.deleted_at = timezone.now()
        first.save()
        second = ApiProject.objects.create(profile=self.profile)
        self.assertNotEqual(first.pk, second.pk)
        self.assertEqual(ApiProject.objects.filter(profile=self.profile, deleted_at__isnull=True).count(), 1)

    def test_tier_fk_refuses_unknown(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            ApiProject.objects.create(profile=self.profile, tier_id="nope")
            # The FK is deferred on Postgres, so force the check before the block exits.
            connection.check_constraints()

    def test_owner_delete_sets_null(self):
        user = User.objects.create_user(username="apiprojectowner", password="not-a-real-password")
        project = ApiProject.objects.create(profile=self.profile, owner=user)
        user.delete()
        project.refresh_from_db()
        self.assertIsNone(project.owner_id)
        self.assertTrue(ApiProject.objects.filter(pk=project.pk).exists())

    def test_seeded_tiers_exist(self):
        slugs = set(ApiTier.objects.values_list("id", flat=True))
        self.assertTrue({"developer", "partner", "internal"} <= slugs)
        for slug in ("developer", "partner", "internal"):
            with self.subTest(tier=slug):
                self.assertTrue(
                    ApiTierMeterLimit.objects.filter(tier_id=slug, meter="default").exists())
