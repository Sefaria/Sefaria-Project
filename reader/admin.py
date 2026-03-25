import csv
import io

from django import forms
from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import UserChangeForm
from django.contrib.auth.models import User
from django.shortcuts import redirect, render
from django.conf.urls import url

from reader.models import UserExperimentSettings, _set_user_experiments


class CsvUploadForm(forms.Form):
    csv_file = forms.FileField(label="CSV file with email addresses")


@admin.register(UserExperimentSettings)
class UserExperimentSettingsAdmin(admin.ModelAdmin):
    list_display = ("user_email", "experiments")
    list_display_links = ("user_email",)
    raw_id_fields = ("user",)
    search_fields = ("user__email", "user__username", "user__first_name", "user__last_name")
    list_filter = ("experiments",)
    change_list_template = "admin/reader/userexperimentsettings/change_list.html"

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _set_user_experiments(obj.user, obj.experiments)

    def user_email(self, obj):
        return obj.user.email
    user_email.short_description = "Email"
    user_email.admin_order_field = "user__email"

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            url(
                r'^upload-csv/$',
                self.admin_site.admin_view(self.upload_csv_view),
                name='reader_userexperimentsettings_upload_csv',
            ),
        ]
        return custom_urls + urls

    def upload_csv_view(self, request):
        if request.method == "POST":
            form = CsvUploadForm(request.POST, request.FILES)
            if form.is_valid():
                csv_file = request.FILES["csv_file"]
                decoded_file = csv_file.read().decode("utf-8")
                reader = csv.reader(io.StringIO(decoded_file))

                emails_not_found = []
                emails_updated = []

                for row in reader:
                    if not row:
                        continue
                    email = row[0].strip()
                    if not email:
                        continue
                    try:
                        user = User.objects.get(email__iexact=email)
                        _set_user_experiments(user, True)
                        emails_updated.append(email)
                    except User.DoesNotExist:
                        emails_not_found.append(email)

                if emails_updated:
                    self.message_user(
                        request,
                        f"Successfully enabled experiments for {len(emails_updated)} user(s).",
                        messages.SUCCESS,
                    )

                if emails_not_found:
                    not_found_list = ", ".join(emails_not_found)
                    self.message_user(
                        request,
                        f"The following email addresses were not found: {not_found_list}",
                        messages.WARNING,
                    )

                return redirect("..")

        else:
            form = CsvUploadForm()

        context = {
            **self.admin_site.each_context(request),
            "form": form,
            "title": "Upload CSV with Email Addresses",
            "opts": self.model._meta,
        }
        return render(request, "admin/upload_csv_form.html", context)


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
