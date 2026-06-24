from django.contrib import admin

from .models import Project


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = (
        "project_name",
        "status",
        "is_published",
        "featured",
        "submission_source",
        "consent_to_display",
        "last_checked",
    )
    list_filter = (
        "status",
        "is_published",
        "featured",
        "submission_source",
        "technical_experience",
        "is_developer",
        "has_pbs_logo",
        "is_buggy",
    )
    search_fields = ("project_name", "creator", "creator_email", "submitter")
    readonly_fields = ("created_at", "updated_at")
    date_hierarchy = "created_at"

    fieldsets = (
        ("Submission", {
            "fields": (
                "submission_source",
                "submission_date",
                ("created_at", "updated_at"),
                "salesforce_id",
            ),
        }),
        ("Creator", {
            "fields": (
                ("creator", "creator_email"),
                "submitter",
                "is_developer",
                "job_title",
                "technical_experience",
                "found_sefaria",
                "sefaria_tools_used",
                "tech_used_raw",
            ),
        }),
        ("Project", {
            "fields": (
                "project_name",
                "project_link",
                "project_source_code",
                "project_desc",
                "project_why",
                "project_category",
                "project_reach",
                "vibe_coded",
                "image_url",
                "has_pbs_logo",
            ),
        }),
        ("Editorial & staff", {
            "fields": (
                "tags",
                "status",
                "last_checked",
                "is_buggy",
                "consent_to_display",
                "is_published",
                "featured",
                "notes",
            ),
        }),
    )
