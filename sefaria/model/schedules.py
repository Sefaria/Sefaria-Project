"""
schedules.py
Writes to MongoDB Collection:
"""

import regex as re
from sefaria.model import *
from sefaria.system.database import db
from . import abstract as abst
import datetime

import structlog
logger = structlog.get_logger(__name__)


class PersonalSchedule(abst.AbstractMongoRecord):
    """
    A custom learning schedule
    """
    collection = 'personal_schedule'

    required_attrs = [
        "user_id",          # int
        "start_date",       # date
        "end_date",         # date
        "active",           # bool
        "schedule_name"     # string
        # "scheduled_text"    # ScheduledText obj
    ]

    optional_attrs = [
        "date_created",
        "time_of_notification",
        "contact_on_shabbat",
        "contact_by_sms",
        "contact_by_email",
        "book",             # index
        "corpus",           # category
        "calendar_schedule" # calendar
    ]

    def __init__(self, user_id, schedule_name, pace=None, time_frame=(datetime.datetime.utcnow(), datetime.datetime.utcnow()), time_of_notification=None, contact_on_shabbat=True, contact_by_sms=False, contact_by_email=False, book=None, corpus=None, calendar_schedule=None):
        super().__init__()
        self.user_id = user_id
        self.schedule_name = schedule_name
        self.pace = pace
        self.start_date = time_frame[0]
        self.end_date = time_frame[1]
        self.active = True
        self.date_created = datetime.datetime.utcnow()
        self.time_of_notification = time_of_notification
        self.contact_on_shabbat = contact_on_shabbat
        self.contact_by_sms = contact_by_sms
        self.contact_by_email = contact_by_email
        self.book = book
        self.corpus = corpus
        self.calendar_schedule = calendar_schedule

    def _normalize(self):
        pass

    def _validate(self):
        # validate that there is exactly one of the 3 options         "book",         # index
        #         "corpus",       # category
        #         "name_schedule" # calendar
        pass

    def _pre_save(self):
        pass

    def _sanitize(self):
        pass

    def to_mongo_dict(self):
        """
        Return a json serializable dictionary which includes all data to be saved in mongo (as opposed to postgres)
        """
        d = {
            "user_id"	:	self.user_id	,
            "schedule_name"	:	self.schedule_name	,
            "pace"	:self.pace	,
            "start_date"	:	self.start_date	,
            "end_date"	:	self.end_date	,
            "active":	self.active	,
            "datetime"	:	self.date_created	,
            "time_of_notification"	:	self.time_of_notification	,
            "contact_on_shabbat"	:	self.contact_on_shabbat	,
            "contact_by_sms"	:	self.contact_by_sms	,
            "contact_by_email"	:	self.contact_by_email	,
            "book"	:	self.book	,
            "corpus"	:	self.corpus	,
            "calendar_schedule"	:	self.calendar_schedule	,
        }
        return d

    def save(self, override_dependencies=False):
        self._normalize()
        self._validate()
        self._sanitize()
        self._pre_save()
        db.schedules.save(self.to_mongo_dict())

    def delete(self, force=False, override_dependencies=False):
        pass

    def edit_notifications(self):
        pass

    def divide_the_text(self):
        """
        Given a list of segments and (start_time, end_time) calculates the portions
        :return: list of ranged-refs
        """
        pass

    def create_full_schedule_run(self):
        if self.calendar_schedule:
            PersonalScheduleNotification()
        elif self.book:
            PersonalScheduleNotification()
        elif self.corpus:
            for ind in library.get_indexes_in_category(self.corpus):
                pss = PersonalSchedule.copy(self)


class PersonalScheduleSet(abst.AbstractMongoSet):
    recordClass = PersonalSchedule


class PersonalScheduleNotification(abst.AbstractMongoRecord):
    """
    The notification object that sends a ranged-ref on a given date
    """
    collection = 'personal_schedule_notification'

    required_attrs = [
        "schedule_name",
        "ref",
        "notification_type",    # sms/email (or other)
        "ping_time",  # time (with date) in UTC

    ]

    optional_attrs = [
        "email_address",
        "phone_number",
        "sent",         # bool
        "clicked",      # bool
    ]

    def __init__(self, ps, ref, notification_type, date):
        super().__init__()
        self.schedule_name = ps.schedule_name
        self.ref = ref
        self.ping_time = ps.time_of_notification + date
        self.notification_type = notification_type
        profile = db.profiles.find_one({"id": ps.user_id})
        if self.notification_type == 'email':
            self.email_address = profile["public_email"]
        elif self.notification_type == 'sms':
            self.phone_number = profile["phone_number"]


class PersonalScheduleNotificationSet(abst.AbstractMongoSet):
    recordClass = PersonalScheduleNotification