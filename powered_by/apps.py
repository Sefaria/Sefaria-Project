from django.apps import AppConfig
from django.db.models.signals import post_save, pre_delete, pre_save


def release_projects_of_deleted_user(sender, instance, **kwargs):
    from .developer import release_account_projects
    release_account_projects(instance)


def note_previous_email(sender, instance, update_fields=None, **kwargs):
    if instance.pk is None or (update_fields is not None and "email" not in update_fields):
        instance._previous_email = None
        return
    instance._previous_email = sender.objects.filter(pk=instance.pk).values_list("email", flat=True).first()


def forget_previous_email(sender, instance, created=False, **kwargs):
    previous = getattr(instance, "_previous_email", None)
    instance._previous_email = None
    if created or not previous or previous.lower() == (instance.email or "").lower():
        return
    from .developer import forget_email_address
    forget_email_address(instance, previous)


class PoweredByAppConfig(AppConfig):
    name = "powered_by"
    verbose_name = "Powered by Sefaria"

    def ready(self):
        from django.contrib.auth import get_user_model
        user_model = get_user_model()
        pre_delete.connect(release_projects_of_deleted_user, sender=user_model,
                           dispatch_uid="powered_by_release_projects_of_deleted_user")
        pre_save.connect(note_previous_email, sender=user_model, dispatch_uid="powered_by_note_previous_email")
        post_save.connect(forget_previous_email, sender=user_model, dispatch_uid="powered_by_forget_previous_email")
