# -*- coding: utf-8 -*-
"""
Override of Django forms for new users and password reset.

Includes logic for subscribing to mailing list on register and for
"User Seeds" -- pre-creating accounts that may already be in a Group.
"""
import structlog

from django import forms
from django.contrib.auth.models import User, Group
from django.contrib.auth.forms import *
from django.utils.translation import ugettext_lazy as _

from emailusernames.forms import EmailUserCreationForm, EmailAuthenticationForm
from emailusernames.utils import get_user, user_exists
from captcha.fields import ReCaptchaField
from captcha.widgets import ReCaptchaV2Checkbox
from account.models import UserType


from sefaria.helper.crm.crm_mediator import CrmMediator
from sefaria.settings import DEBUG
from sefaria.settings import MOBILE_APP_KEY
from django.utils.translation import get_language
logger = structlog.get_logger(__name__)

SEED_GROUP = "User Seeds"


class SefariaDeleteUserForm(EmailAuthenticationForm):
    email = forms.EmailField(max_length=75, widget=forms.EmailInput(attrs={'placeholder': _("Email Address to delete")}))
    password = forms.CharField(widget=forms.PasswordInput(attrs={'placeholder': _("Admin Password")}))

class SefariaDeleteSheet(forms.Form):
    sid = forms.CharField(max_length=20, widget=forms.TextInput(attrs={'placeholder': _("Sheet ID to delete")}))
    password = forms.CharField(widget=forms.PasswordInput(attrs={'placeholder': _("Admin Password")}))


class SefariaLoginForm(EmailAuthenticationForm):
    email = forms.EmailField(max_length=75, widget=forms.EmailInput(attrs={'placeholder': _("Email Address")}))
    password = forms.CharField(widget=forms.PasswordInput(attrs={'placeholder': _("Password")}))


class SefariaNewUserForm(EmailUserCreationForm):
    email = forms.EmailField(max_length=75,
                             widget=forms.EmailInput(attrs={'placeholder': _("Email Address"), 'autocomplete': 'off'}))
    first_name = forms.CharField(widget=forms.TextInput(attrs={'placeholder': _("First Name"), 'autocomplete': 'off'}))
    last_name = forms.CharField(widget=forms.TextInput(attrs={'placeholder': _("Last Name"), 'autocomplete': 'off'}))
    password1 = forms.CharField(widget=forms.PasswordInput(attrs={'placeholder': _("Password"), 'autocomplete': 'off'}))
    # subscribe_educator = forms.BooleanField(label=_("I am an educator"), help_text=_("I am an educator"), initial=False,
    #                                         required=False)

    CHOICES = [
        ('', _('Select an option')),
        ('Monastic', _('Monastic')),
        ('Teacher', _('Teacher')),
        ('Student', _('Student')),
        ('Educated* /Dr / Prof', _('Educated* /Dr / Prof')),
        ('regular user', _('regular user')),
    ]
    
    # Add the select field
    user_type = forms.ChoiceField(
        choices=CHOICES,
        widget=forms.Select(attrs={  
            'class': 'custom-select-large-margin'})
    )

    captcha_lang = "iw" if get_language() == 'he' else "en"
    captcha = ReCaptchaField(
        widget=ReCaptchaV2Checkbox(
            attrs={
                'data-theme': 'white'
                # 'data-size': 'compact',
            },
            # api_params={'hl': captcha_lang}
        )
    )

    class Meta:
        model = User
        fields = ("email",)

    def __init__(self, *args, **kwargs):
        super(EmailUserCreationForm, self).__init__(*args, **kwargs)
        del self.fields['password2']
        self.fields.keyOrder = ["email", "first_name", "last_name", "password1", "captcha", ]
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
            user = super(SefariaNewUserForm, self).save(commit=False)

        user.first_name = self.cleaned_data["first_name"]
        user.last_name = self.cleaned_data["last_name"]

        if commit:
            user.save()
        
        # Save user_type in UserType model
        user_type = self.cleaned_data['user_type']
        UserType.objects.create(user=user, user_type=user_type)

        try:
            crm_mediator = CrmMediator()
            crm_mediator.create_crm_user(user.email, first_name=user.first_name,
                                     last_name=user.last_name, lang=get_language(),
                                     educator=self.cleaned_data["subscribe_educator"])
        except Exception as e:
            logger.error(f"failed to add user to CRM: {e}")
        

        return user


class SefariaNewUserFormAPI(SefariaNewUserForm):
    mobile_app_key = forms.CharField(widget=forms.HiddenInput())

    def __init__(self, *args, **kwargs):
        super(SefariaNewUserForm, self).__init__(*args, **kwargs)
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
class SefariaPasswordResetForm(PasswordResetForm):
    email = forms.EmailField(max_length=75,
                             widget=forms.TextInput(attrs={'placeholder': _("Email Address"), 'autocomplete': 'off'}))


class SefariaSetPasswordForm(SetPasswordForm):
    new_password1 = forms.CharField(
        label=_("New password"),
        widget=forms.PasswordInput(attrs={'placeholder': _("Enter New Password")}),
        strip=False,
        help_text=password_validation.password_validators_help_text_html(),
    )
    new_password2 = forms.CharField(
        label=_("New password confirmation"),
        strip=False,
        widget=forms.PasswordInput(attrs={'placeholder': _("Repeat New Password")}),
    )
