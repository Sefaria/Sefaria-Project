from django.contrib import admin

from .models import ChatbotWelcomeMessage


def _make_preview(field_name, label):
    def preview(self, obj):
        s = getattr(obj, field_name, None) or ""
        return (s[:50] + "…") if len(s) > 50 else s

    preview.short_description = label
    return preview


@admin.register(ChatbotWelcomeMessage)
class ChatbotWelcomeMessageAdmin(admin.ModelAdmin):
    list_display = (
        "key",
        "welcome_english_preview",
        "welcome_hebrew_preview",
        "restart_english_preview",
        "restart_hebrew_preview",
        "new_session_english_preview",
        "new_session_hebrew_preview",
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
                    "new_session_english",
                    "new_session_hebrew",
                ),
            },
        ),
        ("Metadata", {"fields": ("updated_at",)}),
    )

    welcome_english_preview = _make_preview("welcome_english", "Welcome (English)")
    welcome_hebrew_preview = _make_preview("welcome_hebrew", "Welcome (Hebrew)")
    restart_english_preview = _make_preview("restart_english", "Restart (English)")
    restart_hebrew_preview = _make_preview("restart_hebrew", "Restart (Hebrew)")
    new_session_english_preview = _make_preview(
        "new_session_english", "New session (English)"
    )
    new_session_hebrew_preview = _make_preview(
        "new_session_hebrew", "New session (Hebrew)"
    )
