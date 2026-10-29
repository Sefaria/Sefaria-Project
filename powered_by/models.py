import secrets
import string
import re
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class SubmissionSource(models.TextChoices):
    FORMSTACK = "formstack", "Formstack"
    IN_THE_WILD = "in_the_wild", "In the wild"
    MANUAL = "manual", "Manual"
    DEVELOPER_SETTINGS = "developer_settings", "Developer settings"


class TechnicalExperience(models.TextChoices):
    NONE = "None", "None"
    UNDER_5 = "<5 years", "<5 years"
    FIVE_TO_10 = "5-10 years", "5-10 years"
    OVER_10 = "10+ years", "10+ years"


class Status(models.TextChoices):
    LIVE = "live", "Live"
    DEAD = "dead", "Dead"
    UNKNOWN = "unknown", "Unknown"


class Tier(models.TextChoices):
    DEVELOPER = "developer", "Developer"


class Project(models.Model):
    """
    A "Powered by Sefaria" project: a third-party tool, app, or experiment built
    on Sefaria's data, endpoints, or tools. Records enter via the Formstack form,
    are discovered in the wild by staff, or are added manually.
    """

    PUBLIC_FIELDS = (
        "id", "submission_date", "created_at", "updated_at",
        "submission_source", "sefaria_tools_used", "tech_used_raw",
        "technical_experience", "vibe_coded", "project_why",
        "project_name", "project_link", "project_source_code",
        "project_reach", "project_desc", "project_category",
        "image_url", "has_pbs_logo", "tags", "status",
        "is_buggy", "last_checked", "consent_to_display",
        "is_published", "featured",
    )

    # PII / internal staff metadata. Only serialized for authenticated staff;
    # see contents() and powered_by.views.powered_by_api.
    PRIVATE_FIELDS = (
        "creator", "creator_email", "is_developer", "job_title", "found_sefaria",
        "submitter", "salesforce_id", "notes",
    )

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
    sefaria_tools_used = models.JSONField(
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
    project_link = models.URLField(blank=True, help_text="Live project URL.")
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

    tags = models.JSONField(
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
        default=True, help_text="Editorial publish gate, controls visibility on the public site.",
    )
    featured = models.BooleanField(default=False, help_text="Pinned / featured position in the gallery.")
    notes = models.TextField(null=True, blank=True, help_text="Staff notes, anything else.")

    # --- Developer settings -------------------------------------------------
    # New columns carry database defaults: every dev cauldron shares this table, and
    # cauldrons running older code insert rows without them.

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="developer_projects",
        help_text="The account that manages this project and its API keys in developer settings.",
    )
    tier = models.CharField(
        max_length=20, choices=Tier.choices, default=Tier.DEVELOPER, db_default=Tier.DEVELOPER,
        help_text="API access tier of the project's keys.",
    )
    organization = models.CharField(max_length=255, blank=True, default="", db_default="")
    consent_withdrawn_at = models.DateTimeField(
        null=True, blank=True, help_text="When the owner made a public project private.",
    )
    deleted_at = models.DateTimeField(
        null=True, blank=True,
        help_text="When the owner deleted the project. Its keys are revoked and the row stays.",
    )

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

        contents = {field: getattr(self, field) for field in self.PUBLIC_FIELDS}
        for field in ("submission_date", "created_at", "updated_at", "last_checked"):
            contents[field] = iso(contents[field])

        if authenticated:
            for field in self.PRIVATE_FIELDS:
                contents[field] = getattr(self, field)

        return contents


class ApiTier(models.Model):
    """
    An access tier for API projects. Its limits are the default for every project on the tier.
    The slug is the primary key, so a project's tier reads as a name ("developer", "partner").
    """
    id = models.CharField(max_length=20, primary_key=True, help_text="Slug, e.g. developer.")
    name = models.CharField(max_length=100)
    per_minute_per_project = models.PositiveIntegerField(
        help_text="Requests per minute allowed for each API project on this tier.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "api_tier"
        verbose_name = "API tier"
        ordering = ["id"]

    def __str__(self):
        return self.name


class ApiTierMeterLimit(models.Model):
    """
    A monthly usage limit for one meter (a kind of API usage) on one tier, per API project.
    """
    tier = models.ForeignKey(
        ApiTier, on_delete=models.CASCADE, related_name="meter_limits",
        help_text="The tier this limit belongs to.",
    )
    meter = models.SlugField(max_length=50, help_text="Meter name, e.g. semantic.")
    monthly_per_project = models.BigIntegerField(
        help_text="Units of this meter allowed per API project per month.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "api_tier_meter_limit"
        verbose_name = "API tier meter limit"
        constraints = [
            models.UniqueConstraint(fields=["tier", "meter"], name="api_tier_meter_limit_unique"),
        ]

    def __str__(self):
        return f"{self.tier_id} {self.meter}"


class ApiProject(models.Model):
    """
    An API project: the unit that holds API keys and is limited by its tier. It is linked to a
    Powered by Sefaria Project (the profile). A profile has at most one live (not deleted) API
    project; a deleted one frees the profile for a new one.
    """
    profile = models.ForeignKey(
        Project, on_delete=models.PROTECT, related_name="api_projects",
        help_text="The Powered by Sefaria profile this API project belongs to.",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="api_projects",
        help_text="The account that manages this API project.",
    )
    contact_email = models.EmailField(
        blank=True, default="", db_default="",
        help_text="Contact address for this API project.",
    )
    tier = models.ForeignKey(
        ApiTier, on_delete=models.PROTECT, default="developer", db_default="developer",
        help_text="API access tier of this project.",
    )
    deleted_at = models.DateTimeField(
        null=True, blank=True,
        help_text="When the API project was deleted. The row stays; a deleted project is not live.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "api_project"
        verbose_name = "API project"
        ordering = ["-created_at"]
        permissions = [("change_tier", "Can change an API project's tier")]
        constraints = [
            models.UniqueConstraint(
                fields=["profile"],
                condition=models.Q(deleted_at__isnull=True),
                name="api_project_one_live_per_profile",
            ),
        ]

    def __str__(self):
        return f"API project {self.pk} for {self.profile_id}"


KEY_PREFIX = "sfr_"
KEY_ALPHABET = string.ascii_letters + string.digits
KEY_LENGTH = 32


def new_key_value():
    return KEY_PREFIX + "".join(secrets.choice(KEY_ALPHABET) for _ in range(KEY_LENGTH))


ORIGIN_RE = re.compile(r"^https?://[A-Za-z0-9.-]+(:\d{1,5})?$")


def validate_allowed_origins(value):
    """
    allowed_origins is a list of origins (scheme://host[:port], no path). The auth service loads
    it as a list of strings, so anything else must never be stored.
    """
    if not isinstance(value, list):
        raise ValidationError("Allowed origins must be a list.")
    for origin in value:
        if not isinstance(origin, str) or not ORIGIN_RE.match(origin):
            raise ValidationError("%(origin)r is not an origin such as https://example.org.", params={"origin": origin})


class ApiKey(models.Model):
    """
    An API key of an API project. Keys belong to an API project, whose tier the auth service
    loads with every key. It reloads on the NOTIFY sent by the triggers in migrations 0004 and
    0008. Keys are never deleted: a revoked key keeps its row so historical logs still resolve.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=100, unique=True, default=new_key_value)
    project = models.ForeignKey(ApiProject, on_delete=models.PROTECT, related_name="api_keys")
    label = models.CharField(max_length=100)
    allowed_origins = models.JSONField(
        default=list, blank=True, db_default=[], validators=[validate_allowed_origins],
        help_text='Origins (e.g. "https://example.org") allowed to call with this key. Empty allows any.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "API key"
        ordering = ["-created_at"]

    def __str__(self):
        return self.label
