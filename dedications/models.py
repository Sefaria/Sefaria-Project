from django.core.validators import RegexValidator
from django.db import models


class Dedication(models.Model):
    """
    A dedication / sponsored-content page, editable from the Django admin so
    non-engineers can create and update them without a code change or deploy.

    Each record renders at ``/dedication/<slug>`` (e.g. slug
    ``fleishman-hirsch-on-torah-in-english`` ->
    ``/dedication/fleishman-hirsch-on-torah-in-english``) via
    ``dedications.views.dedication``. The ``*_title``
    fields are the page headings; the ``*_content`` fields hold the page body as
    HTML (rendered with ``|safe`` in the template).

    Content is stored as raw HTML (rather than markdown, as guides.InfoCard
    does) because dedication pages are migrated from existing static HTML
    templates -- their markup can be pasted into the admin verbatim. Only
    staff can edit these records, so the ``|safe`` rendering is not exposed
    to untrusted input.
    """

    slug = models.SlugField(
        max_length=100,
        unique=True,
        validators=[RegexValidator(
            r"^[\w-]+$",
            "Slug may only contain letters, numbers, underscores, and hyphens.",
        )],
        help_text="URL identifier. The page is served at /dedication/<slug> "
                  "(e.g. 'fleishman-hirsch-on-torah-in-english' -> "
                  "/dedication/fleishman-hirsch-on-torah-in-english).",
    )
    en_title = models.CharField(max_length=255, help_text="Page title (English).")
    he_title = models.CharField(max_length=255, help_text="Page title (Hebrew).")
    en_content = models.TextField(
        blank=True,
        help_text="Page body as HTML (English). Rendered as-is on the page.",
    )
    he_content = models.TextField(
        blank=True,
        help_text="Page body as HTML (Hebrew). Rendered as-is on the page.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Dedication Page"
        verbose_name_plural = "Dedication Pages"
        ordering = ["slug"]

    def __str__(self):
        return f"{self.en_title} (/dedication/{self.slug})"
