from celery import shared_task

@shared_task(name="inquiry.refresh_activity", ignore_result=True, soft_time_limit=40, time_limit=50)
def refresh_activity():
    from .atlas import refresh
    return refresh()
