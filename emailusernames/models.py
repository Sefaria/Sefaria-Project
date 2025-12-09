from django.contrib.admin.sites import AdminSite
from django.contrib.auth.models import User
from emailusernames.forms import EmailAdminAuthenticationForm
from emailusernames.utils import _email_to_username


# Horrible monkey patching.
# User.username always presents as the email, but saves as a hash of the email.
# It would be possible to avoid such a deep level of monkey-patching,
# but Django's admin displays the "Welcome, username" using user.username,
# and there's really no other way to get around it.
def user_init_patch(self, *args, **kwargs):
    super(User, self).__init__(*args, **kwargs)
    self._username = self.username
    if self.username == _email_to_username(self.email):
        # Username should be replaced by email, since the hashes match
        self.username = self.email


def user_save_patch(self, *args, **kwargs):
    email_as_username = (self.username.lower() == self.email.lower())
    if self.pk is not None:
        try:
            old_user = self.__class__.objects.get(pk=self.pk)
            email_as_username = (
                email_as_username or
                ('@' in self.username and old_user.username == old_user.email)
            )
        except self.__class__.DoesNotExist:
            pass

    if email_as_username:
        self.username = _email_to_username(self.email)
    try:
        super(User, self).save_base(*args, **kwargs)
    finally:
        if email_as_username:
            self.username = self.email


original_init = User.__init__
original_save_base = User.save_base


def monkeypatch_user():
    User.__init__ = user_init_patch
    User.save_base = user_save_patch


def unmonkeypatch_user():
    User.__init__ = original_init
    User.save_base = original_save_base


monkeypatch_user()


# Monkey-path the admin site to use a custom login form
AdminSite.login_form = EmailAdminAuthenticationForm
AdminSite.login_template = 'email_usernames/login.html'
