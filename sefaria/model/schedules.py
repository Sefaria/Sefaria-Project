"""
schedules.py
Writes to MongoDB Collection:
"""

import regex as re
from sefaria.model import *
from sefaria.system.database import db
from . import abstract as abst
from datetime import *
from sefaria.system.exceptions import BookNameError
import functools
from sefaria.utils import calendars
import structlog
logger = structlog.get_logger(__name__)

d_calendar = {
    "Parashat Hashavua": calendars.get_parasha,
    # "Haftarah": calendars.make_haftarah_response_from_calendar_entry,
    "Daf Yomi": calendars.daf_yomi,
    "929": calendars.daily_929,
    "Daily Mishnah": calendars.daily_mishnayot,
    "Daily Rambam": calendars.daily_rambam,
    "Daily Rambam (3 Chapters)": calendars.daily_rambam_three,
    "Daf a Week": calendars.daf_weekly,
    "Halakhah Yomit": calendars.halakhah_yomit,
    "Arukh HaShulchan Yomi": calendars.arukh_hashulchan,
    "Tanakh Yomi": calendars.tanakh_yomi
}


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

    def __init__(self, user_id, schedule_name, pace=None, start_date=datetime.utcnow(), end_date=datetime.utcnow() + timedelta(days=365), time_of_notification=None, contact_on_shabbat=False, contact_by_sms=False, contact_by_email=False, book=None, corpus=None, calendar_schedule=None):
        super().__init__()
        self.user_id = user_id
        self.schedule_name = schedule_name
        self.pace = pace
        self.start_date = convert2datetime(start_date)
        self.end_date = convert2datetime(end_date)
        self.active = True
        self.date_created = datetime.utcnow()
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
            "user_id":	            self.user_id	,
            "schedule_name":	    self.schedule_name	,
            "pace":                 self.pace	,  # int
            "start_date":           self.start_date	,
            "end_date":             self.end_date	,
            "active":               self.active	,
            "datetime":	            self.date_created	,
            "time_of_notification":	self.time_of_notification	,
            "contact_on_shabbat":	self.contact_on_shabbat	,
            "contact_by_sms":	    self.contact_by_sms	,
            "contact_by_email":	    self.contact_by_email	,
            "book":	                self.book	,
            "corpus":	            self.corpus	,
            "calendar_schedule":	self.calendar_schedule	,
        }
        return d

    def save(self, override_dependencies=False):
        self._normalize()
        self._validate()
        self._sanitize()
        self._pre_save()
        db.schedules.save(self.to_mongo_dict())

    def delete(self, force=False, override_dependencies=False):
        # step one, delete all PersonalScheduleNotification of this ps
        pass

    def edit_notifications(self):
        pass

    def create_notifications(self, ref_str, date):
        if self.contact_by_sms:
            psn = PersonalScheduleNotification(self, ref_str, 'sms', date)
            psn.save()
        if self.contact_by_email:
            psn = PersonalScheduleNotification(self, ref_str, 'email', date)
            psn.save()

    def create_full_schedule_run(self, lang = 'en'):
        date = self.start_date
        if self.calendar_schedule:
            for day in range(0, (self.end_date-self.start_date).days+1):
                date = date + timedelta(days=1)
                calendar_func = d_calendar.get(self.calendar_schedule)
                # try:
                ref_str = calendar_func(date)[0]['ref']
                # except
                self.create_notifications(ref_str, date)
        else:
            text = self.book if self.book else self.corpus
            chunks, _, _ = divide_the_text(text, self.pace, self.start_date, self.end_date)
            for ref_chunk in chunks:
                date = date + timedelta(days=1)
                if isinstance(ref_chunk, Ref):
                    ref_str = ref_chunk.normal(lang)
                else:
                    ref_str = f"{ref_chunk[0].normal()} ,{ref_chunk[1].normal()}"
                self.create_notifications(ref_str, date)




class PersonalScheduleSet(abst.AbstractMongoSet):
    recordClass = PersonalSchedule


class PersonalScheduleNotification(abst.AbstractMongoRecord):
    """
    The notification object that sends a ranged-ref on a given date
    """
    collection = 'personal_schedule_notification'

    required_attrs = [
        "user_id",
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
        self.ping_time = (ps.time_of_notification, str(date.date()))
        self.notification_type = notification_type
        profile = db.profiles.find_one({"id": ps.user_id})
        if self.notification_type == 'email':
            self.email_address = profile["public_email"]
        elif self.notification_type == 'sms':
            self.phone_number = profile.get("phone_number", None)


    def save(self, override_dependencies=False):
        db.schedule_notification.save(self.contents())


class PersonalScheduleNotificationSet(abst.AbstractMongoSet):
    recordClass = PersonalScheduleNotification


def ref_chunks(lst, n, remainder=0):
    # def c_ranged_ref

    chunks = []
    len_lst = len(lst)
    i = 0
    cnt = 0
    while i < len_lst:
        j = 1 if cnt < remainder else 0
        tr1 = lst[i]
        tr2 = lst[min(i + n + j-1, len_lst - 1)]
        if tr1.index_node == tr2.index_node:
            ref_str = tr1.to(tr2) #tr1.normal() + "-" + re.search('(\d+:?\d*\d$)', tr2.normal()).group(1)
            chunks.append(ref_str)
        else:
            tr11 = tr1.index_node.last_section_ref().last_segment_ref()
            ref_str1 = tr1.to(tr11)
            tr21 = tr2.index_node.first_section_ref().all_subrefs()[0]
            ref_str2 = tr21.to(tr2)
            chunks.append((ref_str1, ref_str2))
        i += n+j
        cnt+=1
    return chunks


def convert2datetime(d):
    if isinstance(d, str):
        split_date = d.split("-")
        d = datetime(year=int(split_date[0]), month=int(split_date[1]), day=int(split_date[2]))
    assert isinstance(d, datetime)
    return d


def lst_learning_unit(ind):
    """
    from fixed table or by choice get the size of the basic unit for the chunks
    this can be segments (pesukim) or sections (dapim/perakim)
    """
    if 'Talmud' in ind.categories:
        lst = ind.all_section_refs()
    else:  # elif 'Tanakh' in ind.categories:
        lst = ind.all_segment_refs()
    return lst


def divide_the_text(text, pace=None, start_date=datetime.utcnow(), end_date = None):
    """
    Given a list of segments and (start_time, end_time) calculates the portions
    :return: list of ranged-refs
    """
    start_date = convert2datetime(start_date)
    end_date = convert2datetime(end_date)
    inds = library.get_indexes_in_category(text)
    chunks = []
    if inds:
        flat_toc = library.get_toc_tree().flatten()
        def toc_sort(a):
            try:
                return flat_toc.index(a)
            except:
                return 9999

        inds = sorted(inds, key=toc_sort)
        all_segs = functools.reduce(lambda x, y: x+y, [lst_learning_unit(library.get_index(ind_name)) for ind_name in inds])

    else:
        # try:
        ind = library.get_index(text)
        # except BookNameError as e:
        #     return e
        all_segs = lst_learning_unit(ind)
    if pace:
        chunks = ref_chunks(all_segs, pace)
    elif end_date:
        days = (end_date-start_date).days+1
        assert days <= len(all_segs), 'you have more days than learning units of this text, you can take on a bigger challenge'
        pace, remainder = divmod(len(all_segs), days)
        chunks = ref_chunks(all_segs, pace, remainder)
    return chunks, pace, start_date + timedelta(days=len(chunks))