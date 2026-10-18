"""
ApiKey.allowed_origins: the database refuses anything but an array of strings (Postgres), and
model validation refuses anything but a list of origins.
"""
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction
from django.test import TestCase

from powered_by.models import ApiKey, Project, SubmissionSource


class AllowedOriginsTest(TestCase):
    databases = "__all__"

    def setUp(self):
        self.project = Project.objects.create(
            submission_source=SubmissionSource.MANUAL, project_name="Origins", is_published=False)

    def make(self, origins):
        return ApiKey(project=self.project, label="k", allowed_origins=origins)

    def test_valid_values_are_stored(self):
        for origins in ([], ["https://a.example"], ["https://a.example", "http://localhost:3000"]):
            with transaction.atomic():
                self.make(origins).save()

    def test_the_database_rejects_values_that_are_not_an_array_of_strings(self):
        if connection.vendor != "postgresql":
            self.skipTest("The CHECK constraint exists on Postgres only.")
        for bad in ([1], ["a", {}], "x", [None], {"a": 1}):
            with self.subTest(bad=bad), self.assertRaises(IntegrityError), transaction.atomic():
                self.make(bad).save()

    def test_full_clean_rejects_bad_values(self):
        for bad in ([1], ["a", {}], "x", ["not an origin"], ["https://a.example/path"], [""]):
            with self.subTest(bad=bad), self.assertRaises(ValidationError) as ctx:
                self.make(bad).full_clean(exclude=["key"])
            self.assertIn("allowed_origins", ctx.exception.message_dict)

    def test_full_clean_accepts_origins(self):
        self.make(["https://a.example", "http://localhost:3000"]).full_clean()
        self.make([]).full_clean()
