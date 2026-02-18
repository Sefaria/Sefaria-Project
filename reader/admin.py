from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import UserChangeForm
from django.contrib.auth.models import User

from reader.models import UserExperimentSettings, _set_user_experiments


@admin.register(UserExperimentSettings)
class UserExperimentSettingsAdmin(admin.ModelAdmin):
    list_display = ("user_email", "experiments")
    list_display_links = ("user_email",)
    raw_id_fields = ("user",)
    search_fields = ("user__email", "user__username", "user__first_name", "user__last_name")
    list_filter = ("experiments",)

    def user_email(self, obj):
        return obj.user.email
    user_email.short_description = "Email"
    user_email.admin_order_field = "user__email"


class UserExperimentsChangeForm(UserChangeForm):
    experiments = forms.BooleanField(required=False, label="Experiments")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            settings = UserExperimentSettings.objects.filter(user=self.instance).first()
            self.fields["experiments"].initial = bool(settings and settings.experiments)

    def save(self, commit=True):
        user = super().save(commit=commit)
        if commit:
            _set_user_experiments(user, self.cleaned_data.get("experiments", False))
        else:
            # Store the value to be set after the user is saved
            self._experiments_value = self.cleaned_data.get("experiments", False)
        return user
    
    def _save_m2m(self):
        super()._save_m2m()
        # Set experiments after the user and all related objects are saved
        if hasattr(self, '_experiments_value'):
            _set_user_experiments(self.instance, self._experiments_value)
            delattr(self, '_experiments_value')


class UserAdminWithExperiments(UserAdmin):
    form = UserExperimentsChangeForm
    fieldsets = UserAdmin.fieldsets + (("Experiments", {"fields": ("experiments",)}),)


def register_user_admin():
    try:
        admin.site.unregister(User)
    except admin.sites.NotRegistered:
        pass
    admin.site.register(User, UserAdminWithExperiments)


register_user_admin()
