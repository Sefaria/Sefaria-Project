# -*- coding: utf-8 -*-
"""
Override of Django forms for new users and password reset.

Includes logic for subscribing to mailing list on register and for
"User Seeds" -- pre-creating accounts that may already be in a Group.
"""
from django import forms
from django.contrib.auth.models import User, Group
from django.contrib.auth.forms import *
from django.utils.translation import ugettext_lazy as _

from emailusernames.forms import EmailUserCreationForm, EmailAuthenticationForm
from emailusernames.utils import get_user, user_exists
from captcha.fields import ReCaptchaField
from captcha.widgets import ReCaptchaV2Checkbox

from sefaria.client.util import subscribe_to_list
from sefaria.local_settings import DEBUG
from sefaria.settings import MOBILE_APP_KEY
from django.utils.translation import get_language


SEED_GROUP = "User Seeds"


class SefariaLoginForm(EmailAuthenticationForm):
    email = forms.EmailField(max_length=75, widget=forms.EmailInput(attrs={'placeholder': _("Email Address")}))
    password = forms.CharField(widget=forms.PasswordInput(attrs={'placeholder': _("Password")}))


class NewUserForm(EmailUserCreationForm):
    email = forms.EmailField(max_length=75, widget=forms.EmailInput(attrs={'placeholder': _("Email Address"), 'autocomplete': 'off'}))
    first_name = forms.CharField(widget=forms.TextInput(attrs={'placeholder': _("First Name"), 'autocomplete': 'off'}))
    last_name = forms.CharField(widget=forms.TextInput(attrs={'placeholder': _("Last Name"), 'autocomplete': 'off'}))
    password1 = forms.CharField(widget=forms.PasswordInput(attrs={'placeholder': _("Password"), 'autocomplete': 'off'}))
    subscribe_educator = forms.BooleanField(label=_("I am an educator"), help_text=_("I am an educator"), initial=False, required=False)

    captcha_lang = "iw" if get_language() == 'he' else "en"
    captcha = ReCaptchaField(
        widget=ReCaptchaV2Checkbox(
            attrs={
                'data-theme': 'white'
                #'data-size': 'compact',
            },
            #api_params={'hl': captcha_lang}
        )
    )

    class Meta:
        model = User
        fields = ("email",)

    def __init__(self, *args, **kwargs):
        super(EmailUserCreationForm, self).__init__(*args, **kwargs)
        del self.fields['password2']
        self.fields.keyOrder = ["email", "first_name", "last_name", "password1", "captcha"]
        self.fields.keyOrder.append("subscribe_educator")

    def clean_email(self):
        email = self.cleaned_data["email"]
        if user_exists(email):
            user = get_user(email)
            if not user.groups.filter(name=SEED_GROUP).exists():
                raise forms.ValidationError(_("A user with that email already exists."))
        return email

    def save(self, commit=True):
        email = self.cleaned_data["email"]
        if user_exists(email):
            # A 'User Seed' existing for this email address.
            user = get_user(email)
            user.set_password(self.cleaned_data["password1"])
            seed_group = Group.objects.get(name=SEED_GROUP)
            user.groups.remove(seed_group)
        else:
            user = super(NewUserForm, self).save(commit=False)

        user.first_name = self.cleaned_data["first_name"]
        user.last_name = self.cleaned_data["last_name"]

        if commit:
            user.save()

        mailingLists = []
        language = get_language()

        list_name = "Announcements_General_Hebrew" if language == "he" else "Announcements_General"
        mailingLists.append(list_name)

        if self.cleaned_data["subscribe_educator"]:
            list_name = "Announcements_Edu_Hebrew" if language == "he" else "Announcements_Edu"
            mailingLists.append(list_name)

        if mailingLists:
            mailingLists.append("Signed_Up_on_Sefaria")
            try:
                subscribe_to_list(mailingLists, user.email, first_name=user.first_name, last_name=user.last_name)
            except:
                pass

        return user

class NewUserFormAPI(NewUserForm):

    mobile_app_key = forms.CharField(widget=forms.HiddenInput())

    def __init__(self, *args, **kwargs):
        super(NewUserForm, self).__init__(*args, **kwargs)
        # don't require captcha on API form
        # instead, require that the correct app_key is sent
        self.fields.pop('captcha')

    def clean_mobile_app_key(self):
        mobile_app_key = self.cleaned_data["mobile_app_key"]
        if mobile_app_key != MOBILE_APP_KEY:
            raise forms.ValidationError(_("Incorrect mobile_app_key provided"))

# TODO: Check back on me
# This class doesn't seem to be getting called at all -- it's referenced in urls.py,
# but I'm not 100% convinced anything coded here actually sends the email template outside of the django defaults (rmn)
#
class HTMLPasswordResetForm(PasswordResetForm):
    email = forms.EmailField(max_length=75, widget=forms.TextInput(attrs={'placeholder': _("Email Address"), 'autocomplete': 'off'}))

    def save(self, domain_override=None, subject_template_name='registration/pass_reset_subject.txt',
             email_template_name='registration/password_reset_email.html',
             use_https=False, token_generator=default_token_generator, from_email=None, request=None,
             html_email_template_name=None,
             extra_email_context=None
             ):
        """
        Generates a one-use only link for resetting password and sends to the user
        """
        from django.core.mail import EmailMessage
        for user in self.users_cache:
            if not domain_override:
                current_site = get_current_site(request)
                site_name = current_site.name
                domain = current_site.domain
            else:
                site_name = domain = domain_override
            c = {
                'email': user.email,
                'domain': domain,
                'site_name': site_name,
                'uid': int_to_base36(user.id),
                'user': user,
                'token': token_generator.make_token(user),
                'protocol': use_https and 'https' or 'http',
            }
            subject = loader.render_to_string(subject_template_name, c)
            # Email subject *must not* contain newlines
            subject = ''.join(subject.splitlines())
            email = loader.render_to_string(email_template_name, c)
            msg = EmailMessage(subject, email, from_email, [user.email])
            msg.content_subtype = "html"
            msg.send()
