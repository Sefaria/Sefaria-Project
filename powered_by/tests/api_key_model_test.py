"""
ApiKey.allowed_origins: the database refuses anything but an array of strings (Postgres), and
model validation refuses anything but a list of domains.
"""
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.test import TestCase

from powered_by.models import ApiKey, ApiProject, Project, SubmissionSource


class AllowedOriginsTest(TestCase):
    databases = "__all__"

    def setUp(self):
        profile = Project.objects.create(
            submission_source=SubmissionSource.MANUAL, project_name="Origins", is_published=False)
        self.project = ApiProject.objects.create(profile=profile)

    def make(self, origins):
        return ApiKey(project=self.project, label="k", allowed_origins=origins)

    def test_valid_values_are_stored(self):
        for origins in ([], ["a.example"], ["a.example", "[::1]"]):
            with transaction.atomic():
                self.make(origins).save()

    def test_the_database_rejects_values_that_are_not_an_array_of_strings(self):
        if connection.vendor != "postgresql":
            self.skipTest("The CHECK constraint exists on Postgres only.")
        for bad in ([1], ["a", {}], "x", [None], {"a": 1}):
            with self.subTest(bad=bad), self.assertRaises(IntegrityError), transaction.atomic():
                self.make(bad).save()

    def test_full_clean_rejects_bad_values(self):
        for bad in ([1], ["a", {}], "x", ["not a domain"], ["https://a.example"], ["a.example/path"], ["a.example:8080"], ["A.example"], [""]):
            with self.subTest(bad=bad), self.assertRaises(ValidationError) as ctx:
                self.make(bad).full_clean(exclude=["key"])
            self.assertIn("allowed_origins", ctx.exception.message_dict)

    def test_full_clean_accepts_domains(self):
        self.make(["a.example", "xn--bcher-kva.example", "127.0.0.1", "[::1]"]).full_clean()
        self.make([]).full_clean()
