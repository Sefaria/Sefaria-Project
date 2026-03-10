import json

from django import forms
from django.contrib import admin
from django.shortcuts import redirect

from remote_config.models import RemoteConfigEntry, ValueType
from remote_config.keys import CHATBOT_WELCOME_MESSAGES
from .models import ChatbotWelcomeMessageProxy, DEFAULTS


class ChatbotWelcomeMessagesForm(forms.ModelForm):
    """
    Presents individual text fields for each chatbot message while storing
    everything as a single JSON blob in RemoteConfigEntry.raw_value.
    """
    welcome_english = forms.CharField(
        widget=forms.Textarea(attrs={"rows": 3}),
        required=False,
        help_text="Welcome message (English) shown when chat is empty",
    )
    welcome_hebrew = forms.CharField(
        widget=forms.Textarea(attrs={"rows": 3}),
        required=False,
        help_text="Welcome message (Hebrew) shown when chat is empty",
    )
    restart_english = forms.CharField(
        widget=forms.Textarea(attrs={"rows": 3}),
        required=False,
        help_text="Restart message (English) shown when chat is empty after restart",
    )
    restart_hebrew = forms.CharField(
        widget=forms.Textarea(attrs={"rows": 3}),
        required=False,
        help_text="Restart message (Hebrew) shown when chat is empty after restart",
    )
    new_session_english = forms.CharField(
        widget=forms.Textarea(attrs={"rows": 3}),
        required=False,
        help_text="New session message (English) shown when returning user has empty chat",
    )
    new_session_hebrew = forms.CharField(
        widget=forms.Textarea(attrs={"rows": 3}),
        required=False,
        help_text="New session message (Hebrew) shown when returning user has empty chat",
    )

    class Meta:
        model = ChatbotWelcomeMessageProxy
        fields = []

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            try:
                data = json.loads(self.instance.raw_value)
            except (json.JSONDecodeError, TypeError):
                data = {}
            for key, default in DEFAULTS.items():
                self.fields[key].initial = data.get(key, default)

    def save(self, commit=True):
        data = {key: self.cleaned_data.get(key, "") for key in DEFAULTS}
        self.instance.key = CHATBOT_WELCOME_MESSAGES
        self.instance.raw_value = json.dumps(data)
        self.instance.value_type = ValueType.JSON
        self.instance.is_active = True
        self.instance.description = "Chatbot welcome/restart/new-session messages (EN + HE)"
        return super().save(commit=commit)


@admin.register(ChatbotWelcomeMessageProxy)
class ChatbotWelcomeMessagesAdmin(admin.ModelAdmin):
    """
    Singleton-style admin: always edits the one RemoteConfigEntry keyed
    feature.chatbot.welcome_messages.  The changelist redirects straight
    to the edit form.
    """
    form = ChatbotWelcomeMessagesForm
    fieldsets = (
        ("English", {"fields": ("welcome_english", "restart_english", "new_session_english")}),
        ("Hebrew", {"fields": ("welcome_hebrew", "restart_hebrew", "new_session_hebrew")}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).filter(key=CHATBOT_WELCOME_MESSAGES)

    def has_add_permission(self, request):
        return not RemoteConfigEntry.objects.filter(key=CHATBOT_WELCOME_MESSAGES).exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        obj, _ = RemoteConfigEntry.objects.get_or_create(
            key=CHATBOT_WELCOME_MESSAGES,
            defaults={
                "raw_value": json.dumps(DEFAULTS),
                "value_type": ValueType.JSON,
                "is_active": True,
                "description": "Chatbot welcome/restart/new-session messages (EN + HE)",
            },
        )
        return redirect(
            f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_change",
            obj.pk,
        )
