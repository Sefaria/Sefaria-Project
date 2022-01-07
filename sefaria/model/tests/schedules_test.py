import pytest
from sefaria.model import *
from sefaria.system.database import db
from datetime import *


class TestPersonalScheduleNotification(object):

    def test_creating_notifactions_book(self):
        ps = PersonalSchedule(30044, "Genesis", pace=5, book="Genesis", contact_by_sms=False, contact_by_email=True)
        ps.save()
        ps.create_full_schedule_run()

    def test_creating_notifactions_category(self):
        ps = PersonalSchedule(30044, "Torah", pace=5, corpus="Torah", contact_by_sms=True, contact_by_email=False)
        ps.save()
        ps.create_full_schedule_run()


class TestDivideText(object):

    def test_end_date(self):
        end_date1 = datetime(year=2022, month=10, day=5)
        chunks, pace, end_date2 = schedules.divide_the_text('Genesis', end_date=end_date1)
        assert end_date1.date() == end_date2.date()

    def test_category(self):
        end_date1 = datetime(year=2022, month=10, day=5)
        chunks, pace, end_date2 = schedules.divide_the_text('Torah', end_date=end_date1)
        assert end_date1.date() == end_date2.date()

    def test_book_talmud(self):
        end_date1 = datetime(year=2022, month=2, day=5)
        chunks, pace, end_date2 = schedules.divide_the_text('Pesachim', end_date=end_date1)
        assert end_date1.date() == end_date2.date()