# -*- coding: utf-8 -*-
"""
Override of Django forms for new users and password reset.

Includes logic for subscribing to mailing list on register and for 
"User Seeds" -- pre-creating accounts that may already be in a Group.
"""


from django import forms
from django.contrib.auth.models import User, Group
from django.contrib.auth.forms import *
from emailusernames.forms import EmailUserCreationForm, EmailAuthenticationForm
from emailusernames.utils import get_user, user_exists
from sefaria.client.util import subscribe_to_list
from captcha.fields import ReCaptchaField
from sefaria.local_settings import DEBUG

SEED_GROUP = "User Seeds"


class SefariaLoginForm(EmailAuthenticationForm):
    email = forms.EmailField(max_length=75, widget=forms.TextInput(attrs={'placeholder': u'Email Address | כתובת אימייל'}))
    password = forms.CharField(widget=forms.PasswordInput(attrs={'placeholder': u'Password | סיסמא'}))



class NewUserForm(EmailUserCreationForm):
    email = forms.EmailField(max_length=75, widget=forms.TextInput(attrs={'placeholder': u'Email Address | כתובת אימייל', 'autocomplete': 'off'}))
    first_name = forms.CharField(widget=forms.TextInput(attrs={'placeholder': u'First Name | שם פרטי', 'autocomplete': 'off'}))
    last_name = forms.CharField(widget=forms.TextInput(attrs={'placeholder': u'Last Name | שם משפחה', 'autocomplete': 'off'}))
    password1 = forms.CharField(widget=forms.PasswordInput(attrs={'placeholder': u'Password | סיסמא', 'autocomplete': 'off'}))
    subscribe_announce = forms.BooleanField(label="Receive important announcements", help_text="Receive important announcements", initial=True, required=False)
    subscribe_educator = forms.BooleanField(label="Receive our educator newsletter", help_text="Receive our educator newsletter", initial=False, required=False)
    if not DEBUG:
        captcha = ReCaptchaField(attrs={'theme' : 'white'})
    
    class Meta:
        model = User
        fields = ("email",)
 
    def __init__(self, *args, **kwargs):
        super(EmailUserCreationForm, self).__init__(*args, **kwargs)
        del self.fields['password2']
        self.fields.keyOrder = ["email", "first_name", "last_name", "password1"]
        if not DEBUG:
            self.fields.keyOrder.append("captcha")
        self.fields.keyOrder.append("subscribe_announce")
        self.fields.keyOrder.append("subscribe_educator")

    def clean_email(self):
        email = self.cleaned_data["email"]
        if user_exists(email):
            user = get_user(email)
            if not user.groups.filter(name=SEED_GROUP).exists():
                raise forms.ValidationError("A user with that email already exists.")
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

        if self.cleaned_data["subscribe_announce"]:
            mailingLists.append("Announcements_General")
            mailingLists.append("Signed_Up_on_Sefaria")

        if self.cleaned_data["subscribe_educator"]:
            mailingLists.append("Announcements_Edu")

        if mailingLists:
            try:
                subscribe_to_list(mailingLists, user.email, first_name=user.first_name, last_name=user.last_name)
            except:
                pass

        return user


class HTMLPasswordResetForm(PasswordResetForm):
    email = forms.EmailField(max_length=75, widget=forms.TextInput(attrs={'placeholder': u'Email Address | כתובת אימייל', 'autocomplete': 'off'}))
    def save(self, domain_override=None, email_template_name='registration/password_reset_email.html', subject_template_name='registration/pass_reset_subject.txt',
             use_https=False, token_generator=default_token_generator, from_email=None, request=None):
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