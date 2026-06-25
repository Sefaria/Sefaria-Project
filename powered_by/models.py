from django.contrib.postgres.fields import ArrayField
from django.db import models


class SubmissionSource(models.TextChoices):
    FORMSTACK = "formstack", "Formstack"
    IN_THE_WILD = "in_the_wild", "In the wild"
    MANUAL = "manual", "Manual"


class TechnicalExperience(models.TextChoices):
    NONE = "None", "None"
    UNDER_5 = "<5 years", "<5 years"
    FIVE_TO_10 = "5-10 years", "5-10 years"
    OVER_10 = "10+ years", "10+ years"


class Status(models.TextChoices):
    LIVE = "live", "Live"
    DEAD = "dead", "Dead"
    UNKNOWN = "unknown", "Unknown"


class Project(models.Model):
    """
    A "Powered by Sefaria" project: a third-party tool, app, or experiment built
    on Sefaria's data, endpoints, or tools. Records enter via the Formstack form,
    are discovered in the wild by staff, or are added manually.
    """

    # --- Submission metadata ------------------------------------------------

    submission_date = models.DateTimeField(
        null=True, blank=True,
        help_text="Date the form was submitted (absent for in-the-wild / manual records).",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    submission_source = models.CharField(
        max_length=20,
        choices=SubmissionSource.choices,
        help_text="How this record entered the system.",
    )

    # --- Creator / submitter ------------------------------------------------

    creator = models.CharField(max_length=255, blank=True, help_text="Creator name (first + last).")
    creator_email = models.EmailField(blank=True, help_text="Creator email.")
    submitter = models.CharField(max_length=255, blank=True, help_text="Submitter name / staff.")
    salesforce_id = models.CharField(
        max_length=255, null=True, blank=True,
        help_text="Soft FK to a Salesforce record. Nullable, no hard dependency.",
    )

    # --- Creator profile ----------------------------------------------------

    is_developer = models.BooleanField(
        default=False, help_text='"I am a software developer professionally."',
    )
    job_title = models.CharField(max_length=255, blank=True, help_text="Current role / job title.")
    found_sefaria = models.TextField(blank=True, help_text="How they heard about Sefaria's data and tools.")
    sefaria_tools_used = ArrayField(
        models.CharField(max_length=255),
        default=list, blank=True,
        help_text="Sefaria data, endpoints, or tools used (self-reported, includes free-text 'other').",
    )
    tech_used_raw = models.TextField(blank=True, help_text="Their self-description of the tech used.")
    technical_experience = models.CharField(
        max_length=20, blank=True,
        choices=TechnicalExperience.choices,
        help_text="Years of programming experience.",
    )

    # --- Project details ----------------------------------------------------

    vibe_coded = models.BooleanField(default=False, help_text="Was this project vibe-coded?")
    project_why = models.TextField(blank=True, help_text="What inspired them to build it.")
    project_name = models.CharField(max_length=255, help_text="Project name.")
    project_link = models.URLField(help_text="Live project URL.")
    project_source_code = models.URLField(null=True, blank=True, help_text="Source code URL.")
    project_reach = models.CharField(max_length=255, blank=True, help_text="Number of users (dropdown).")
    project_desc = models.TextField(blank=True, help_text="Project description.")
    project_category = models.CharField(max_length=255, blank=True, help_text="Category / categories.")
    image_url = models.URLField(
        null=True, blank=True,
        help_text="Screenshot or thumbnail for the gallery card. Null until added.",
    )
    has_pbs_logo = models.BooleanField(
        default=False, help_text='Project displays the "Powered by Sefaria" logo.',
    )

    # --- Staff / editorial --------------------------------------------------

    tags = ArrayField(
        models.CharField(max_length=255),
        default=list, blank=True,
        help_text="Staff-assigned tags (e.g. MCP, AI, Chatbot, Kabbalah).",
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.UNKNOWN,
        help_text="Link liveness, set by the liveness job.",
    )
    is_buggy = models.BooleanField(default=False, help_text="Admin tag for whether the project is buggy.")
    last_checked = models.DateTimeField(
        null=True, blank=True,
        help_text="When project_link was last verified by the liveness job.",
    )
    consent_to_display = models.BooleanField(
        default=False, help_text="Submitter consented to public display.",
    )
    is_published = models.BooleanField(
        default=False, help_text="Editorial publish gate, controls visibility on the public site.",
    )
    featured = models.BooleanField(default=False, help_text="Pinned / featured position in the gallery.")
    notes = models.TextField(null=True, blank=True, help_text="Staff notes, anything else.")

    class Meta:
        verbose_name = "Powered by Sefaria Project"
        verbose_name_plural = "Powered by Sefaria Projects"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(submission_source__in=SubmissionSource.values),
                name="powered_by_project_submission_source_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(technical_experience__in=TechnicalExperience.values)
                | models.Q(technical_experience=""),
                name="powered_by_project_technical_experience_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=Status.values),
                name="powered_by_project_status_valid",
            ),
        ]
        indexes = [
            models.Index(fields=["is_published"]),
            models.Index(fields=["featured"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return self.project_name

    # PII / internal staff metadata. Only serialized for authenticated staff;
    # see contents() and powered_by.views.powered_by_api.
    PRIVATE_FIELDS = (
        "creator", "creator_email", "is_developer", "job_title", "found_sefaria",
        "submitter", "salesforce_id", "notes",
    )

    def contents(self, authenticated=False):
        """
        Return a JSON-safe dict of fields (datetimes as ISO strings).

        Public fields are always included. PII / internal fields
        (`PRIVATE_FIELDS`: creator_email, submitter, salesforce_id, notes) are
        included only when `authenticated` is True, which the view sets from
        `request.user.is_staff`.
        """
        def iso(dt):
            return dt.isoformat() if dt else None

        contents = {
            "id": self.id,
            "submission_date": iso(self.submission_date),
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
            "submission_source": self.submission_source,
            "sefaria_tools_used": self.sefaria_tools_used,
            "tech_used_raw": self.tech_used_raw,
            "technical_experience": self.technical_experience,
            "vibe_coded": self.vibe_coded,
            "project_why": self.project_why,
            "project_name": self.project_name,
            "project_link": self.project_link,
            "project_source_code": self.project_source_code,
            "project_reach": self.project_reach,
            "project_desc": self.project_desc,
            "project_category": self.project_category,
            "image_url": self.image_url,
            "has_pbs_logo": self.has_pbs_logo,
            "tags": self.tags,
            "status": self.status,
            "is_buggy": self.is_buggy,
            "last_checked": iso(self.last_checked),
            "consent_to_display": self.consent_to_display,
            "is_published": self.is_published,
            "featured": self.featured,
        }

        if authenticated:
            for field in self.PRIVATE_FIELDS:
                contents[field] = getattr(self, field)

        return contents
