from django.apps import AppConfig
from django.db.models.signals import pre_delete


def release_projects_of_deleted_user(sender, instance, **kwargs):
    from .developer import release_account_projects
    release_account_projects(instance)


class PoweredByAppConfig(AppConfig):
    name = "powered_by"
    verbose_name = "Powered by Sefaria"

    def ready(self):
        from django.contrib.auth import get_user_model
        pre_delete.connect(release_projects_of_deleted_user, sender=get_user_model(),
                           dispatch_uid="powered_by_release_projects_of_deleted_user")
