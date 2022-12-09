from sefaria.model.trend import setAllTrends


def remove_jobs(scheduler):
    [j.remove() for j in scheduler.get_jobs()]


def add_jobs(scheduler):

    scheduler.add_job(setAllTrends, "cron", id="UserTrends", replace_existing=True,
                      day_of_week="sat", hour="0", minute="1")
