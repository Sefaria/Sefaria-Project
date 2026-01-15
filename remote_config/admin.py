from django.contrib import admin

from .models import RemoteConfigEntry


@admin.register(RemoteConfigEntry)
class RemoteConfigEntryAdmin(admin.ModelAdmin):
    list_display = ("key", "value_type", "is_active", "updated_at")
    list_filter = ("is_active", "value_type")
    search_fields = ("key", "description")
    ordering = ("key",)
    readonly_fields = ("created_at", "updated_at")

    fieldsets = (
        (None, {"fields": ("key", "value_type", "raw_value", "is_active")}),
        ("Metadata", {"fields": ("description", "created_at", "updated_at")}),
    )
