from django import forms
from django.contrib.auth.models import User, Group
from django.contrib.auth.forms import *
from emailusernames.forms import EmailUserCreationForm
from emailusernames.utils import get_user, user_exists
from sefaria.util import subscribe_to_announce

SEED_GROUP = "User Seeds"


class NewUserForm(EmailUserCreationForm):
    first_name = forms.CharField()
    last_name = forms.CharField()
    subscribe_announce = forms.BooleanField(label="Receive important announcements",  initial=True, required=False)
    
    class Meta:
        model = User
        fields = ("email",)
 
    def __init__(self, *args, **kwargs):
        super(EmailUserCreationForm, self).__init__(*args, **kwargs)
        del self.fields['password2']
        self.fields.keyOrder = ["email", "first_name", "last_name", "password1", "subscribe_announce"]

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
        if self.cleaned_data["subscribe_announce"]:
            try:
                subscribe_to_announce(user.email, first_name=user.first_name, last_name=user.last_name)
            except:
                pass
        return user


class HTMLPasswordResetForm(PasswordResetForm):
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