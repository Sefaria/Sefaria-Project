"""Celery tasks of the portal. Discovered when "devportal" is in `autodiscover_tasks`
(sefaria/celery_setup/app.py). Declared with `shared_task`, so importing this module needs no
Sefaria Celery app; `devportal.adapters.tasks.run` calls them inline when Celery is disabled.
"""

from celery import shared_task


@shared_task(name="devportal.rebuild_artifacts")
def rebuild_artifacts_task(rerender=True):
    from devportal.services.publish import rebuild_artifacts

    return rebuild_artifacts(rerender=rerender)


@shared_task(name="devportal.mirror_images", soft_time_limit=1800)
def mirror_images_task():
    from devportal.services.images import mirror_images

    return mirror_images().as_dict()
