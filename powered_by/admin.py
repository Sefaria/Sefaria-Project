from django import forms
from django.contrib import admin, messages
from django.contrib.admin.views.main import SEARCH_VAR
from django.db import transaction
from django.db.models import Prefetch
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.utils.html import format_html

from .models import ApiKey, ApiProject, Project

# How much of a key the admin may show or search on: the "sfr_" prefix and 6 characters. Enough to tell keys apart in a
# log or a support request; everything after it is the secret.
KEY_DISPLAY_PREFIX = 10


# The fields an admin may edit inline. The admin form carries each one's value as it was when the page rendered
# (a hidden "initial-" input), so a save can tell what the admin changed from what merely went stale.
ADMIN_EDITABLE_KEY_FIELDS = ("label", "allowed_origins", "revoked_at")


class ApiKeyForm(forms.ModelForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # A revoked key stays revoked: a disabled field ignores whatever the form posts.
        if self.instance.revoked_at is not None:
            self.fields["revoked_at"].disabled = True
        for name in ADMIN_EDITABLE_KEY_FIELDS:
            if not self.fields[name].disabled:
                self.fields[name].show_hidden_initial = True


class ApiKeyFormSet(forms.BaseInlineFormSet):
    def save_existing(self, form, obj, commit=True):
        # The form was built from the key as it was when the page loaded, and the row is written whole. Re-read it
        # under its lock: a revoke since then must stand, and so must every other field this form did not change (an
        # owner may have restricted allowed_origins meanwhile; writing the old list back would widen the key).
        if commit:
            with transaction.atomic():
                current = ApiKey.objects.select_for_update().get(pk=obj.pk)
                for name in ADMIN_EDITABLE_KEY_FIELDS:
                    if name == "revoked_at":
                        # A revocation that is already there stands whatever the form carries.
                        if current.revoked_at is not None or name not in form.changed_data:
                            obj.revoked_at = current.revoked_at
                    elif name not in form.changed_data:
                        setattr(obj, name, getattr(current, name))
                return super().save_existing(form, obj, commit)
        return super().save_existing(form, obj, commit)


class ApiKeyInline(admin.TabularInline):
    model = ApiKey
    form = ApiKeyForm
    formset = ApiKeyFormSet
    extra = 0
    can_delete = False
    fields = ("label", "masked_key", "allowed_origins", "created_at", "revoked_at", "last_used_at")
    readonly_fields = ("masked_key", "created_at", "last_used_at")

    @admin.display(description="Key")
    def masked_key(self, obj):
        # An unsaved "Add another" row holds the default's freshly generated key, which will never exist.
        if obj is None or obj._state.adding:
            return "-"
        return obj.key[:KEY_DISPLAY_PREFIX] + "\u2026"

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
        "request_not_to_publish",
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
        return (
            super()
            .get_queryset(request)
            .prefetch_related(
                Prefetch(
                    "api_projects",
                    queryset=ApiProject.objects.filter(deleted_at__isnull=True),
                    to_attr="live_api_projects",
                )
            )
        )

    @admin.display(description="API project")
    def live_api_project(self, obj):
        if obj.pk is None:
            return "-"
        live = obj.live_api_projects
        if not live:
            return "-"
        return format_html(
            '<a href="{}">API project {}</a>',
            reverse("admin:powered_by_apiproject_change", args=[live[0].pk]),
            live[0].pk,
        )

    fieldsets = (
        (
            "Submission",
            {
                "fields": (
                    "submission_source",
                    "submission_date",
                    ("created_at", "updated_at"),
                    "salesforce_id",
                ),
            },
        ),
        (
            "Creator",
            {
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
            },
        ),
        (
            "Project",
            {
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
            },
        ),
        (
            "Editorial & staff",
            {
                "fields": (
                    "tags",
                    "status",
                    "last_checked",
                    "is_buggy",
                    "request_not_to_publish",
                    "is_published",
                    "featured",
                    "notes",
                ),
            },
        ),
        (
            "Developer settings",
            {
                "fields": (
                    "organization",
                    "consent_withdrawn_at",
                    "live_api_project",
                ),
            },
        ),
    )


@admin.register(ApiProject)
class ApiProjectAdmin(admin.ModelAdmin):
    list_display = ("id", "profile", "owner", "tier", "deleted_at")
    # Finds a project from a key prefix quoted in a support request; the key itself is never displayed.
    search_fields = ("api_keys__key__startswith",)
    raw_id_fields = ("profile", "owner")
    readonly_fields = ("deleted_at", "created_at", "updated_at")
    inlines = (ApiKeyInline,)
    actions = ("soft_delete_and_revoke_keys",)

    def changelist_view(self, request, extra_context=None):
        # The changelist echoes the query into the search box, the result links and every later request. A pasted full
        # key would be rendered back and logged again, so cut the query to the shown prefix before anything renders.
        # Every value counts: with a repeated q, Django searches the last one but keeps all of them in its links.
        queries = request.GET.getlist(SEARCH_VAR)
        if len(queries) > 1 or any(len(query.strip()) > KEY_DISPLAY_PREFIX for query in queries):
            params = request.GET.copy()
            params[SEARCH_VAR] = queries[-1].strip()[:KEY_DISPLAY_PREFIX]
            return HttpResponseRedirect(f"{request.path}?{params.urlencode()}")
        return super().changelist_view(request, extra_context)

    def save_model(self, request, obj, form, change):
        # deleted_at is not editable here, but save() writes every column: a project soft-deleted since the form loaded
        # would come back to life. Re-read it under the row lock and keep a deletion that is already there.
        if change:
            with transaction.atomic():
                deleted_at = ApiProject.objects.select_for_update().values_list("deleted_at", flat=True).get(pk=obj.pk)
                if deleted_at is not None:
                    obj.deleted_at = deleted_at
                return super().save_model(request, obj, form, change)
        return super().save_model(request, obj, form, change)

    def get_search_results(self, request, queryset, search_term):
        # Match only the prefix the admin already shows. Searching further into the key would let staff recover it a
        # character at a time by watching whether a project stays in the results.
        return super().get_search_results(request, queryset, search_term.strip()[:KEY_DISPLAY_PREFIX])

    @admin.action(description="Soft-delete and revoke keys", permissions=("change",))
    def soft_delete_and_revoke_keys(self, request, queryset):
        # The same steps as an owner deleting the project in developer settings; admin delete is a hard delete,
        # which the key foreign key refuses once a project has keys. Imported here: developer imports sefaria.model,
        # which connects to Mongo, and admin modules load at Django setup (collectstatic in the image build has no Mongo).
        from . import developer

        with transaction.atomic():
            locked = list(queryset.select_for_update())
            # Profiles are read after the lock, so none is the version from before an edit the lock waited for.
            profiles = Project.objects.in_bulk([api_project.profile_id for api_project in locked])
            for api_project in locked:
                api_project.profile = profiles[api_project.profile_id]
                developer.soft_delete(api_project)
        self.message_user(
            request, f"Soft-deleted {queryset.count()} API project(s) and revoked their keys.", messages.SUCCESS
        )

    def get_readonly_fields(self, request, obj=None):
        readonly = super().get_readonly_fields(request, obj)
        # Only the change_tier permission may move a project to another tier.
        if request.user.has_perm("powered_by.change_tier"):
            return readonly
        return readonly + ("tier",)
