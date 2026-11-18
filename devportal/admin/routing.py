"""Django admin for redirects and the 404 log (PLAN.md §2.3.3)."""

from django.contrib import admin

from devportal.models import NotFoundLog, Redirect


@admin.register(Redirect)
class RedirectAdmin(admin.ModelAdmin):
    list_display = ("from_path", "to_path", "status", "reason", "updated_at")
    list_filter = ("status", "reason")
    search_fields = ("from_path", "to_path")


@admin.register(NotFoundLog)
class NotFoundLogAdmin(admin.ModelAdmin):
    list_display = ("path", "count", "last_seen", "first_seen", "last_referrer")
    ordering = ("-count", "path")
    search_fields = ("path", "last_referrer")
    readonly_fields = ("path", "count", "first_seen", "last_seen", "last_referrer")

    def has_add_permission(self, request):
        return False
