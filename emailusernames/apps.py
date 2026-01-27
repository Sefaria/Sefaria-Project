from django.apps import AppConfig


class EmailUsernamesConfig(AppConfig):
    name = 'emailusernames'
    verbose_name = 'Email Usernames'

    def ready(self):
        # Apply monkey patches after all apps are loaded
        # This is the Django 2.0+ recommended way to do monkey patching
        from emailusernames.models import monkeypatch_user
        monkeypatch_user()
