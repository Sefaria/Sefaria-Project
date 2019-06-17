from pytz import utc
from apscheduler.jobstores.mongodb import MongoDBJobStore
from sefaria.system.database import client
import jobs


def _run_scheduler(SchedulerClass):
    jobstores = {'default': MongoDBJobStore(client=client)}
    scheduler = SchedulerClass(jobstores=jobstores, timezone=utc)
    jobs.remove_jobs(scheduler)
    jobs.add_jobs(scheduler)
    scheduler.start()
    return scheduler


def run_blocking_scheduler():
    from apscheduler.schedulers.blocking import BlockingScheduler
    _run_scheduler(BlockingScheduler)


def run_background_scheduler():
    from apscheduler.schedulers.background import BackgroundScheduler
    return _run_scheduler(BackgroundScheduler)
