from django import forms
from django.contrib import admin, messages
from django.db import transaction
from django.db.models import Prefetch
from django.urls import reverse
from django.utils.html import format_html

from . import developer
from .models import ApiKey, ApiProject, Project


class ApiKeyForm(forms.ModelForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # A revoked key stays revoked: a disabled field ignores whatever the form posts.
        if self.instance.revoked_at is not None:
            self.fields["revoked_at"].disabled = True


class ApiKeyInline(admin.TabularInline):
    model = ApiKey
    form = ApiKeyForm
    extra = 0
    can_delete = False
    fields = ("label", "key", "allowed_origins", "created_at", "revoked_at", "last_used_at")
    readonly_fields = ("key", "created_at", "last_used_at")

    def has_delete_permission(self, request, obj=None):
        return False


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
        "live_api_project",
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
    readonly_fields = ("created_at", "updated_at", "live_api_project")
    date_hierarchy = "created_at"

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related(Prefetch(
            "api_projects", queryset=ApiProject.objects.filter(deleted_at__isnull=True),
            to_attr="live_api_projects",
        ))

    @admin.display(description="API project")
    def live_api_project(self, obj):
        if obj.pk is None:
            return "-"
        live = obj.live_api_projects
        if not live:
            return "-"
        return format_html('<a href="{}">API project {}</a>',
                           reverse("admin:powered_by_apiproject_change", args=[live[0].pk]), live[0].pk)

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
        ("Developer settings", {
            "fields": (
                "organization",
                "consent_withdrawn_at",
                "live_api_project",
            ),
        }),
    )


@admin.register(ApiProject)
class ApiProjectAdmin(admin.ModelAdmin):
    list_display = ("id", "profile", "owner", "tier", "deleted_at")
    raw_id_fields = ("profile", "owner")
    readonly_fields = ("deleted_at", "created_at", "updated_at")
    inlines = (ApiKeyInline,)
    actions = ("soft_delete_and_revoke_keys",)

    @admin.action(description="Soft-delete and revoke keys", permissions=("change",))
    def soft_delete_and_revoke_keys(self, request, queryset):
        # The same steps as an owner deleting the project in developer settings; admin delete is a hard delete,
        # which the key foreign key refuses once a project has keys.
        with transaction.atomic():
            locked = list(queryset.select_for_update())
            # Profiles are read after the lock, so none is the version from before an edit the lock waited for.
            profiles = Project.objects.in_bulk([api_project.profile_id for api_project in locked])
            for api_project in locked:
                api_project.profile = profiles[api_project.profile_id]
                developer.soft_delete(api_project)
        self.message_user(request, "Soft-deleted {} API project(s) and revoked their keys.".format(queryset.count()),
                          messages.SUCCESS)

    def get_readonly_fields(self, request, obj=None):
        readonly = super().get_readonly_fields(request, obj)
        # Only the change_tier permission may move a project to another tier.
        if request.user.has_perm("powered_by.change_tier"):
            return readonly
        return readonly + ("tier",)
