
from sefaria.model.story import TextPassageStoryFactory, AuthorStoryFactory, TopicListStoryFactory, \
    TopicTextsStoryFactory, UserSheetsFactory, GroupSheetListFactory, SheetListFactory


def add_jobs(scheduler):
    _add_calendar_jobs(scheduler)

    scheduler.add_job(TopicListStoryFactory.create_shared_story,  "cron", id="TopicList", replace_existing=True,
                      day_of_week="mon,wed,fri", hour="10")

    scheduler.add_job(TopicTextsStoryFactory.create_random_shared_story,  "cron", id="RandTopic", replace_existing=True,
                      day_of_week="tue,thu,sun", hour="10")

    scheduler.add_job(AuthorStoryFactory.create_random_shared_story, "cron", id="RandAuthor", replace_existing=True,
                      day_of_week="tue,thu", hour="10")


def _add_calendar_jobs(scheduler):
    scheduler.add_job(TextPassageStoryFactory.create_parasha, "cron", id="Parasha", replace_existing=True,
                      day_of_week="fri, sun", hour="0", minute="5")

    scheduler.add_job(TextPassageStoryFactory.create_haftarah, "cron", id="Haftarah", replace_existing=True,
                      day_of_week="fri", hour="0", minute="3")

    scheduler.add_job(TextPassageStoryFactory.create_daf_yomi, "cron", id="DafYomi", replace_existing=True,
                      hour="0", minute="10")

    scheduler.add_job(TextPassageStoryFactory.create_929, "cron", id="929", replace_existing=True,
                      day_of_week="mon, tue, wed, thu, sun", hour="0", minute="12")

    scheduler.add_job(TextPassageStoryFactory.create_daily_mishnah, "cron", id="Mishnah", replace_existing=True,
                      hour="0", minute="15")
