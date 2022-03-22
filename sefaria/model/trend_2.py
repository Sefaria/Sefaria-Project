# -*- coding: utf-8 -*-

"""
trend_2.py
"""

import time
from datetime import datetime, date

from . import abstract as abst
from . import user_profile
from . import text

from sefaria.system.database import db

import structlog
logger = structlog.get_logger(__name__)

def read_in_category_key(c):
    return "ReadInCategory" + c

def reverse_read_in_category_key(k):
    return k[14:]

def get_session_traits(request, uid=None):
    # keys for these traits are duplicated in story editor.  Could be more graceful.

    traits = {
        "inDiaspora": bool(request.diaspora),
        "inIsrael": not request.diaspora,
    }
    if uid is not None:
        traits.update({
            "readsHebrew":                  Trend.get_user_trend_value(uid, "HebrewAbility") >= .5,
            "toleratesEnglish":             Trend.get_user_trend_value(uid, "EnglishTolerance") >= .05,
            "usesSheets":                   Trend.get_user_trend_value(uid, "SheetsRead") >= 2,
        })

        # "createsSheets"
        # "prefersBilingual"
        # "isSephardi"
        # "learnsDafYomi", etc

    return [k for k, v in list(traits.items()) if v]



class DateRange(object):
    new_years_dict = {
        2020: datetime(2020, 9, 18),
        2021: datetime(2021, 9, 6),
        2022: datetime(2022, 9, 25),
        2023: datetime(2023, 9, 15),
        2024: datetime(2024, 10, 2),
        2025: datetime(2025, 9, 22),
        2026: datetime(2026, 9, 11),
        2027: datetime(2027, 10, 1),
        2028: datetime(2028, 9, 20)
    }

    def __init__(self, key, start=None, end=None):
        """
        :param start: datetime or None, meaning open ended
        :param end: datetime or None, meaning open ended
        """
        self.start = start
        self.end = end
        self.key = key

    @classmethod
    def alltime(cls):
        return cls("alltime", None, None)

    @classmethod
    def this_hebrew_year(cls):
        today = date.today()
        this_gregorian_year_rh = cls.new_years_dict[today.year]
        try:
            if (this_gregorian_year_rh.date() > today):
                return cls("this_hebrew_year", cls.new_years_dict[today.year-1], this_gregorian_year_rh)
            else:
                return cls("this_hebrew_year", this_gregorian_year_rh, cls.new_years_dict[today.year+1])
        except:
            latest_year = max(cls.new_years_dict.get.keys())
            return cls("this_hebrew_year", cls.new_years_dict[latest_year-1], latest_year)

    @classmethod
    def previous_hebrew_year(cls):
        #todo: add try catch
        today = date.today()
        this_gregorian_year_rh = cls.new_years_dict[today.year]
        try:
            if (this_gregorian_year_rh.date() > today):
                return cls("previous_hebrew_year", cls.new_years_dict[today.year-2], cls.new_years_dict[today.year-1])
            else:
                return cls("previous_hebrew_year", cls.new_years_dict[today.year-1], this_gregorian_year_rh)
        except:
            latest_year = max(cls.new_years_dict.get.keys())
            return cls("this_hebrew_year", cls.new_years_dict[latest_year-2], cls.new_years_dict[latest_year-2])

    def needs_clause(self):
        return self.start or self.end

    def query_clause(self):
        """
        Returns a time range clause, fit for use in a pymongo query
        :return:
        """
        if self.start is None and self.end is None:
            return {}

        timeclause = {}
        if self.start:
            timeclause["$gte"] = self.start
        if self.end:
            timeclause["$lte"] = self.end
        return timeclause

    def update_match(self, match_clause, field="datetime"):
        """
        Update a mongo query dict with a time period query
        :param match_clause: dict
        :param field: the field to match in this query
        :return: dict (though it's been updated in place)
        """
        if self.needs_clause():
            match_clause[field] = self.query_clause()
        return match_clause

    def contains(self, dt):
        """
        Check if the supplied datetime falls in this range
        :param dt:
        :return:
        """
        return ((self.start is None or self.start <= dt)
                and (self.end is None or dt <= self.end))


active_dateranges = [DateRange.alltime(), DateRange.this_hebrew_year(), DateRange.previous_hebrew_year()]


class Trend(abst.AbstractMongoRecord):
    '''
    Value
    Timestamp
    Period Covered [week, month, season, alltime, this_hebrew_year]
    Scope [user, user network, comparable, site]
    '''

    collection   = 'trend'
    history_noun = 'trend'

    required_attrs = [
        "name",
        "value",
        "datatype",  # from factory.  needed?
        "timestamp",
        "period",    #
        "scope"
    ]

    optional_attrs = [
        "uid"       # Required when scope is not "site"
    ]

    @classmethod
    def get_user_trend_value(cls, uid, name, period="alltime", default=0):
        trend = cls().load({"uid": uid, "name": name, "period": period})
        if trend:
            return trend.value
        else:
            return default

    def _init_defaults(self):
        self.timestamp = int(time.time())

    def _validate(self):
        assert self.scope == "site" or hasattr(self, "uid")

