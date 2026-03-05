from django.contrib import admin

from .models import ChatbotWelcomeMessage


@admin.register(ChatbotWelcomeMessage)
class ChatbotWelcomeMessageAdmin(admin.ModelAdmin):
    list_display = (
        "key",
        "welcome_english_preview",
        "welcome_hebrew_preview",
        "restart_english_preview",
        "restart_hebrew_preview",
        "updated_at",
    )
    list_display_links = ("key",)
    readonly_fields = ("updated_at",)
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "key",
                    "welcome_english",
                    "welcome_hebrew",
                    "restart_english",
                    "restart_hebrew",
                ),
            },
        ),
        ("Metadata", {"fields": ("updated_at",)}),
    )

    def welcome_english_preview(self, obj):
        s = obj.welcome_english or ""
        return (s[:50] + "…") if len(s) > 50 else s
    welcome_english_preview.short_description = "Welcome (English)"

    def welcome_hebrew_preview(self, obj):
        s = obj.welcome_hebrew or ""
        return (s[:50] + "…") if len(s) > 50 else s
    welcome_hebrew_preview.short_description = "Welcome (Hebrew)"

    def restart_english_preview(self, obj):
        s = obj.restart_english or ""
        return (s[:50] + "…") if len(s) > 50 else s
    restart_english_preview.short_description = "Restart (English)"

    def restart_hebrew_preview(self, obj):
        s = obj.restart_hebrew or ""
        return (s[:50] + "…") if len(s) > 50 else s
    restart_hebrew_preview.short_description = "Restart (Hebrew)"
