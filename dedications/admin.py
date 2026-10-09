from django.contrib import admin

from .models import Dedication


@admin.register(Dedication)
class DedicationAdmin(admin.ModelAdmin):
    list_display = ("slug", "en_title", "he_title", "updated_at")
    search_fields = ("slug", "en_title", "he_title")
    prepopulated_fields = {"slug": ("en_title",)}
    readonly_fields = ("created_at", "updated_at")

    fieldsets = (
        (None, {
            "fields": ("slug",),
        }),
        ("English", {
            "fields": ("en_title", "en_content"),
        }),
        ("Hebrew", {
            "fields": ("he_title", "he_content"),
        }),
        ("Metadata", {
            "fields": (("created_at", "updated_at"),),
        }),
    )
