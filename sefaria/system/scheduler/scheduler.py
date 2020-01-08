from pytz import utc
from apscheduler.jobstores.mongodb import MongoDBJobStore
from apscheduler.schedulers.background import BackgroundScheduler
from sefaria.system.database import client
from . import jobs


def run_background_scheduler():
    jobstores = {'default': MongoDBJobStore(client=client)}
    scheduler = BackgroundScheduler(jobstores=jobstores, timezone=utc)
    scheduler.start()
    jobs.remove_jobs(scheduler)
    jobs.add_jobs(scheduler)
    return scheduler