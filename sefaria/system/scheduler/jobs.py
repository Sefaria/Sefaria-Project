from sefaria.model.story import (
    AuthorStoryFactory,
    CollectionSheetListFactory,
    MultiTextStoryFactory,
    SheetListFactory,
    TextPassageStoryFactory,
    TopicListStoryFactory,
    TopicTextsStoryFactory,
    UserSheetsFactory,
)
from sefaria.model.trend import setAllTrends


def remove_jobs(scheduler):
    [j.remove() for j in scheduler.get_jobs()]


def add_jobs(scheduler):
    _add_daf_jobs(scheduler)
    _add_parasha_jobs(scheduler)

    scheduler.add_job(
        TopicListStoryFactory.create_trending_story,
        "cron",
        id="TopicList",
        replace_existing=True,
        day_of_week="mon,wed,fri",
        hour="12",
        minute="2",
    )

    scheduler.add_job(
        TopicTextsStoryFactory.create_random_shared_story,
        "cron",
        id="RandTopic",
        replace_existing=True,
        day_of_week="tue,thu,sun",
        hour="12",
        minute="4",
    )

    scheduler.add_job(
        AuthorStoryFactory.create_random_shared_story,
        "cron",
        id="RandAuthor",
        replace_existing=True,
        day_of_week="tue,thu",
        hour="12",
        minute="6",
    )

    scheduler.add_job(
        SheetListFactory.create_featured_story,
        "cron",
        id="FeaturedSheets",
        replace_existing=True,
        day_of_week="wed",
        hour="14",
        minute="0",
    )

    scheduler.add_job(
        setAllTrends,
        "cron",
        id="UserTrends",
        replace_existing=True,
        day_of_week="sat",
        hour="0",
        minute="1",
    )


def _add_parasha_jobs(scheduler):
    scheduler.add_job(
        TextPassageStoryFactory.create_aliyah,
        "cron",
        id="Aliyah",
        replace_existing=True,
        day_of_week="sun, mon, tue, wed, thu, fri",
        hour="5",
        minute="9",
    )

    scheduler.add_job(
        TextPassageStoryFactory.create_haftarah,
        "cron",
        id="Haftarah",
        replace_existing=True,
        day_of_week="fri, sun",
        hour="5",
        minute="7",
    )

    scheduler.add_job(
        SheetListFactory.create_parasha_sheets_stories,
        "cron",
        id="Parasha_Sheets1",
        replace_existing=True,
        day_of_week="mon",
        hour="11",
        minute="5",
    )

    scheduler.add_job(
        SheetListFactory.create_parasha_sheets_stories,
        "cron",
        id="Parasha_Sheets2",
        replace_existing=True,
        kwargs={"iteration": 2},
        day_of_week="wed",
        hour="11",
        minute="5",
    )

    scheduler.add_job(
        SheetListFactory.create_parasha_sheets_stories,
        "cron",
        id="Parasha_Sheets3",
        replace_existing=True,
        kwargs={"iteration": 3},
        day_of_week="fri",
        hour="8",
        minute="5",
    )

    scheduler.add_job(
        TopicListStoryFactory.create_parasha_topics_stories,
        "cron",
        id="Parasha_Topics1",
        replace_existing=True,
        day_of_week="sun",
        hour="11",
        minute="5",
    )

    scheduler.add_job(
        TopicListStoryFactory.create_parasha_topics_stories,
        "cron",
        id="Parasha_Topics2",
        replace_existing=True,
        kwargs={"iteration": 2},
        day_of_week="tue",
        hour="11",
        minute="5",
    )

    scheduler.add_job(
        MultiTextStoryFactory.create_parasha_verse_commentator_stories,
        "cron",
        id="Parasha_Commentator1",
        replace_existing=True,
        day_of_week="mon",
        hour="11",
        minute="5",
    )

    scheduler.add_job(
        MultiTextStoryFactory.create_parasha_verse_connection_stories,
        "cron",
        id="Parasha_Connection1",
        replace_existing=True,
        day_of_week="tue",
        hour="11",
        minute="5",
    )

    scheduler.add_job(
        CollectionSheetListFactory.create_nechama_sheet_stories,
        "cron",
        id="Nechama_on_Parasha",
        replace_existing=True,
        day_of_week="tue",
        hour="11",
        minute="10",
    )

    scheduler.add_job(
        MultiTextStoryFactory.create_parasha_verse_commentator_stories,
        "cron",
        id="Parasha_Commentator2",
        replace_existing=True,
        kwargs={"iteration": 2},
        day_of_week="thu",
        hour="11",
        minute="5",
    )

    scheduler.add_job(
        MultiTextStoryFactory.create_parasha_verse_connection_stories,
        "cron",
        id="Parasha_Connection2",
        replace_existing=True,
        kwargs={"iteration": 2},
        day_of_week="fri",
        hour="11",
        minute="5",
    )


def _add_daf_jobs(scheduler):
    scheduler.add_job(
        TextPassageStoryFactory.create_daf_yomi,
        "cron",
        id="DafYomi",
        replace_existing=True,
        hour="5",
        minute="6",
    )

    scheduler.add_job(
        MultiTextStoryFactory.create_daf_connection_story,
        "cron",
        id="DafYomiConnection",
        replace_existing=True,
        hour="5",
        minute="4",
    )

    scheduler.add_job(
        SheetListFactory.create_daf_sheet_story,
        "cron",
        id="DafYomiSheets",
        replace_existing=True,
        hour="5",
        minute="2",
    )


"""
scheduler.add_job(TextPassageStoryFactory.create_929, "cron", id="929", replace_existing=True,
                  day_of_week="mon, tue, wed, thu, sun", hour="1", minute="12")

scheduler.add_job(TextPassageStoryFactory.create_daily_mishnah, "cron", id="Mishnah", replace_existing=True,
                  hour="1", minute="15")
"""
