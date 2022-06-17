# -*- coding: utf-8 -*-

"""
trend.py
"""
import json
import time
from datetime import datetime, date, timedelta

from py import process

from . import abstract as abst
from . import user_profile
from . import text

from sefaria.system.database import db
from sefaria.model import Ref
from sefaria.model.text import library

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
    def currently(cls):
        today = datetime.today()
        year_in_days = timedelta(365)
        return cls("currently", today - year_in_days, today)

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


active_dateranges = [DateRange.alltime(), DateRange.currently()]


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


class TrendSet(abst.AbstractMongoSet):
    recordClass = Trend

def setUserSheetTraits():
    TrendSet({"name": "SheetsRead"}).delete()

    for daterange in active_dateranges:
        all_users = getAllUsersSheetUsage(daterange)
        for uid, data in all_users.items():
            Trend({
                "name":         "SheetsRead",
                "value":        int(data["cnt"]),
                "datatype":     "int",
                "timestamp":    datetime.utcnow(),
                "period":       daterange.key,
                "scope":        "user",
                "uid":          uid
            }).save()

def setCategoryTraits():
    top_categories = library.get_top_categories()

    # User Traits
    for daterange in active_dateranges:
        site_data = {cat: 0 for cat in top_categories}
        for category in top_categories:
            all_users = getAllUsersCategories(daterange, category)
            for uid, data in all_users.items():
                val = data['cnt']
                TrendSet({"period": daterange.key, "uid": uid, "name": read_in_category_key(category)}).delete()

                # for val in list(data["categories"].items()):
                #     if cat not in TOP_CATEGORIES:
                #         continue
                Trend({
                    "name":         read_in_category_key(category),
                    "value":        val,
                    "datatype":     "int",
                    "timestamp":    datetime.utcnow(),
                    "period":       daterange.key,
                    "scope":        "user",
                    "uid":          uid
                }).save()
                site_data[category] += val

        # Site Traits
        TrendSet({"period": daterange.key, "scope": "site", "name": {"$in": list(map(read_in_category_key, top_categories))}}).delete()

        for cat, val in site_data.items():
            Trend({
                "name": read_in_category_key(cat),
                "value": val,
                "datatype": "int",
                "timestamp": datetime.utcnow(),
                "period": daterange.key,
                "scope": "site"
            }).save()


def setSheetTraits():
    TrendSet({"name": "SheetsCreatedPublic"}).delete()
    TrendSet({"name": "SheetsCreated"}).delete()

    for daterange in active_dateranges:
        all_users = getAllUsersSheetCreation(daterange)
        all_users_published = getAllUsersSheetCreation(daterange, publishedOnly=True)
        for uid, data in all_users.items():
            Trend({
                "name":         "SheetsCreated",
                "value":        int(data["cnt"]),
                "datatype":     "int",
                "timestamp":    datetime.utcnow(),
                "period":       daterange.key,
                "scope":        "user",
                "uid":          uid
            }).save()
        for uid, data in all_users_published.items():
            Trend({
                "name":         "SheetsCreatedPublic",
                "value":        int(data["cnt"]),
                "datatype":     "int",
                "timestamp":    datetime.utcnow(),
                "period":       daterange.key,
                "scope":        "user",
                "uid":          uid
            }).save()


def setUserLanguageTraits():
    TrendSet({"name": {"$in": ["EnglishTolerance", "HebrewAbility"]}}).delete()

    for daterange in active_dateranges:
        all_users = getAllUsersLanguageUsage(daterange)
        for uid, data in all_users.items():
            profile = user_profile.UserProfile(id=uid)

            he = float(data["languages"].get("hebrew", 0.0))
            en = float(data["languages"].get("english", 0.0))
            bi = float(data["languages"].get("bilingual", 0.0))
            total = float(data.get("total", 0.0))
            assert total

            # EnglishTolerance
            # If user has English interface conclude English tolerance
            if profile.settings.get("interface_language") == "english" or not he:
                value = 1.0
            else:
                # percentage of visits registered w/ English content
                value = (en + bi) / total

            if value < 0 or value > 1:
                print("UNEXPECTED value for EnglishTolerance: " + str(total))
                print(profile.email + " has en score " + str(en) + ". bi score: " + str(bi) + ". total: " + str(total))
                print(json.dumps(data))

            Trend({
                "name":         "EnglishTolerance",
                "value":        value,
                "datatype":     "float",
                "timestamp":    datetime.utcnow(),
                "period":       daterange.key,
                "scope":        "user",
                "uid":          uid
            }).save()

            # HebrewAbility
            # If user has Hebrew interface conclude Hebrew ability
            if profile.settings.get("interface_language") == "hebrew":
                value = 1.0

            # all bi is .50,  Each he adds a bunch.  Each en takes away a bit.
            else:
                het = he/total
                value = 1.1 * (het / (.1 + het))

            Trend({
                "name":         "HebrewAbility",
                "value":        value,
                "datatype":     "float",
                "timestamp":    datetime.utcnow(),
                "period":       daterange.key,
                "scope":        "user",
                "uid":          uid
            }).save()


def getAllUsersLanguageUsage(daterange):
    '''
    Returns dictionary mapping user ids to dictionaries that look like:
    {u'_id': 62298,
     u'languages': {u'bilingual': 5.0, u'hebrew': 9.0},
     u'total': 14.0}
    {u'_id': 59440, u'languages': {u'bilingual': 10.0}, u'total': 10.0}
    {u'_id': 60586, u'languages': {u'hebrew': 27.0}, u'total': 27.0}

    # https://stackoverflow.com/questions/25843255/mongodb-aggregate-count-on-multiple-fields-simultaneously
    '''

    pipeline = [
        {"$match": daterange.update_match({
            "secondary": False,
            "language": {"$in": ["hebrew", "english", "bilingual"]}
        })},
        {"$group": {
            "_id": {"language": "$language", "uid": "$uid"},
            "cnt": {"$sum": 1}}},
        {"$group": {
            "_id": "$_id.uid",
            "languages": {"$push": {"k": "$_id.language", "v": "$cnt"}},
            "total": {"$sum": "$cnt"}}},
        {"$project": {
            "languages": {"$arrayToObject": "$languages"},
            "total": "$total"}}
    ]
    results = db.user_history.aggregate(pipeline)
    return {d["_id"]: d for d in results}


def getAllUsersSheetUsage(daterange):
    pipeline = [
            {"$match": daterange.update_match({
                "secondary": False,
                "is_sheet": True
            })},
            {"$group": {
                "_id": "$uid",
                "cnt": {"$sum": 1}}}     # Sheet records never have num_times_read greater than 1.
        ]

    results = db.user_history.aggregate(pipeline)
    return {d["_id"]: d for d in results}


def getAllUsersCategories(daterange, category):
    pipeline = [
        {"$match": daterange.update_match({
            "secondary": False,
            "is_sheet": False,
            "categories.0": category
        })},
        {"$group": {
            "_id": "$uid",
             "cnt": { "$sum": {"$max": ["$num_times_read", 1]}}}}]
    results = db.user_history.aggregate(pipeline)
    return {d["_id"]: d for d in results}

def getAllUsersSheetCreation(daterange, publishedOnly=False):
    pipeline = [
        {"$match": daterange.update_match({
            "status": "public"
        }  if publishedOnly else {}, field="dateModified")}, # is this correct
        {"$group": {
            "_id": "$owner",
            "cnt": {"$sum": 1}}}     # Sheet records never have num_times_read greater than 1.
    ]
    results = db.sheets.aggregate(pipeline)
    return {d["_id"]: d for d in results}

def site_stats_data():
    top_categories = library.get_top_categories()

    d = {}
    for daterange in active_dateranges:
        d[daterange.key] = {"categoriesRead": {reverse_read_in_category_key(t.name): t.value
                            for t in TrendSet({"scope": "site", "period": daterange.key,
                                "name": {"$in": list(map(read_in_category_key, top_categories))}
                            })}}
    return d


def user_stats_data(uid):
    """

    :param uid: int or something cast-able to int
    :param start: datetime
    :param end: datetime
    :return:
    """
    from sefaria.model.story import Story
    from sefaria.sheets import user_sheets

    uid = int(uid)
    user_stats_dict = user_profile.public_user_data(uid)

    # All of user's sheets
    usheets = user_sheets(uid)["sheets"]
    usheet_ids = [s["id"] for s in usheets]

    for daterange in active_dateranges:
        # Sheet views in this period
        usheet_views = db.user_history.aggregate([
            {"$match": daterange.update_match({
                "is_sheet": True,
                "sheet_id": {"$in": usheet_ids},
                "uid": {"$ne": uid}
                })},
            {"$group": {
                "_id": "$sheet_id",
                "cnt": {"$sum": 1}}},
        ])

        most_popular_sheet_ids = [s["_id"] for s in sorted(usheet_views, key=lambda o: o["cnt"], reverse=True)[:3]]
        most_popular_sheets = []
        for sheet_id in most_popular_sheet_ids:
            most_popular_sheets += [s for s in usheets if s["id"] == sheet_id]

        sheets_this_period = [s for s in usheets if daterange.contains(datetime.strptime(s["created"], "%Y-%m-%dT%H:%M:%S.%f"))]

        # Refs I viewed
        refs_viewed = db.user_history.aggregate([
            {"$match": daterange.update_match({
                "uid": uid,
                "secondary": False,
                "is_sheet": False
                })},
            {"$group": {
                "_id": "$ref",
                "cnt": {"$sum": 1}}},  # Using $num_times_read isn't reliable.  It counts book views, but not text views.
        ])
        most_viewed_trefs = [s["_id"] for s in sorted(refs_viewed, key=lambda o: o["cnt"], reverse=True) if s["cnt"] > 1 and "Genesis 1" not in s["_id"]][:9]
        most_viewed_refs = [text.Ref(r) for r in most_viewed_trefs]
        most_viewed_ref_dicts = [{"en": r.normal(), "he": r.he_normal(), "book": r.index.title} for r in most_viewed_refs]

        # Sheets I viewed
        sheets_viewed = db.user_history.aggregate([
            {"$match": daterange.update_match({
                "uid": uid,
                "secondary": False,
                "is_sheet": True
                })},
            {"$group": {
                "_id": "$sheet_id",
                "cnt": {"$sum": 1}}},
        ])
        most_viewed_sheets_ids = [s["_id"] for s in sorted(sheets_viewed, key=lambda o: o["cnt"], reverse=True) if s["cnt"] > 1 and s["_id"] not in usheet_ids][:3]


        most_viewed_sheets = [Story.sheet_metadata(i, return_id=True) for i in most_viewed_sheets_ids]
        most_viewed_sheets = [a for a in most_viewed_sheets if a]

        for sheet_dict in most_viewed_sheets:
            sheet_dict.update(Story.publisher_metadata(sheet_dict["publisher_id"]))

        # Construct returned data
        top_categories = library.get_top_categories()
        user_stats_dict[daterange.key] = {
            "sheetsRead": user_profile.UserHistorySet(daterange.update_match({"is_sheet": True, "secondary": False, "uid": uid})).hits(),
            "textsRead": user_profile.UserHistorySet(daterange.update_match({"is_sheet": False, "secondary": False, "uid": uid})).hits(),
            "categoriesRead": {reverse_read_in_category_key(t.name): t.value for t in TrendSet({"uid":uid, "period": daterange.key, "name": {"$in": list(map(read_in_category_key, top_categories))}})},
            "totalSheets": len(usheets),
            "publicSheets": len([s for s in usheets if s["status"] == "public"]),
            "popularSheets": most_popular_sheets,
            "sheetsThisPeriod": len(sheets_this_period),
            "mostViewedRefs": most_viewed_ref_dicts,
            "mostViewedSheets": most_viewed_sheets
        }

    return user_stats_dict

# vv Needs thought / refactor vv
class TrendFactory(object):
    """
    Name
    DataType
    For Users [bool]
    For Network/Site [bool]
    """
    name = ""  # Name of trait / trend
    desc = ""  # Description of trait / trend
    datatype = ""   # int, str, bool, dict
    for_user = False   # bool
    for_group = False  # bool

    
    # to consider: Is a well defined period the way to go with these?
    def process_user(self, user_id, period):
        """
        f(user, period) -> val
        :param period:
        :return:
        """
        pass

    def process_user_network(self, uid, period):
        users = []  # get followed users
        return self._process_users(users, period)
        pass

    def process_comparable(self, period):
        pass

    def process_site(self, period):
        pass

    def _process_users(self, users, period):
        pass

class EnglishToleranceFactory(TrendFactory):
    name = "EnglishTolerance"
    desc = "Value between 0 and 1 - 1 Being clear English appreciation, 0 being clear English intolerance"
    datatype = "float"   # int, float, str, bool, dict
    for_user = True
    for_group = False

class HebrewAbilityFactory(TrendFactory):
    name = "HebrewAbility"
    desc = "Value between 0 and 1 - 1 Being clear Hebrew ability, 0 being clear inability"
    datatype = "float"   # int, float, str, bool, dict
    for_user = True
    for_group = False

class DateRefRange(object):
    def __init__(self, refRangeString, start, end, name):
        """
        hosts ref range and acceptable date parameters to help with determining whether a date/ref combination meets
        criteria for following a schedule
        :param start: datetime
        :param end: datetime
        """
        self.dateRange = DateRange(name, start, end)
        self.ref = Ref(refRangeString)

    def refIsInRange(self, ref, timestamp):
        """
        returns whether the ref criteria is met is filled and whether to continue checking refs against dateRefRange (bucket)
        """
        processedRef = Ref(ref)
        if self.dateRange.start > timestamp:
            return False, True
        elif self.dateRange.end < timestamp:
            return False, False
        elif processedRef.span_size()>=1 and processedRef.overlaps(self.ref): # does this need to be more precise?
                return True, True
        else:
            return False, False # in date range, not in ref range

        # if Ref(ref) in self.ref.all_segment_refs() and self.dateRange.start <= timestamp and self.dateRange.end >= timestamp:
        #     return True
        # else:
        #     return False

class ScheduleManager(object):
    def __init__(self, segmentHits, numberOfSegments, dateRangeEnd, varianceForward, varianceBack, name):
        """
        :param segmentHits: number of segment hits in the correct range that need to be met for user to be a schedule learner
        :param numberOfSegments: number of segments to check
        :param dateRangeEnd: date to work backwards from
        :param varianceForward: number of days after date we consider them as still learning the schedule item
        :param varianceBack: number of days before date we consider them as still learning the schedule item
        """
        self.name = name
        self.segmentHits = segmentHits
        if dateRangeEnd == None:
            self.dateRangeEnd = datetime.today()
        else:
            self.dateRangeEnd = dateRangeEnd
        self.numberOfSegments = numberOfSegments
        self.varianceForward = timedelta(varianceForward)
        self.varianceBack = timedelta(varianceBack)
        pass

    def createDateRefRanges(self):
        """
        retrieves necessary dateRefRanges for particular schedule to meet criteria
        """
        pass

    def getRelevantUserHistories(self):
        pass

    def getUsersWhoAreLearningSchedule(self):
        dateRefRangesTotal = len(self.dateRefRanges)
        # usersWhoAreLearningSchedule = []
        # usersWhoAreNotLearningSchedule = []
        for user in self.getRelevantUserHistories():
            index = 0
            refsInRangeCount = 0
            for history in user["history"]:
                keepCheckingRefAgainstBuckets = True
                while(index < dateRefRangesTotal and keepCheckingRefAgainstBuckets == True):
                    inRange, keepCheckingRefAgainstBuckets = self.dateRefRanges[index].refIsInRange(history["ref"], history["datetime"])
                    if inRange:
                        refsInRangeCount += 1
                        if refsInRangeCount >= self.segmentHits:
                            break
                    if keepCheckingRefAgainstBuckets:
                        index += 1
                if refsInRangeCount >= self.segmentHits:
                    Trend({
                        "name":         self.name,
                        "value":        True,
                        "datatype":     "bool",
                        "timestamp":    datetime.utcnow(),
                        "period":       "currently",
                        "scope":        "user",
                        "uid":          user["_id"]["uid"]
                    }).save()
                    break
                elif self.segmentHits - refsInRangeCount > dateRefRangesTotal - index:
                    break

class ParashaScheduleManager(ScheduleManager):
    #TODO: deal with haftara
    #TODO: make more efficient
    def __init__(self, segmentHits=2, numberOfSegments=4, dateRangeEnd=None, diaspora=True, varianceForward=14, varianceBack=7, name="ParashaLearner"):
        ScheduleManager.__init__(self, segmentHits, numberOfSegments, dateRangeEnd, varianceForward, varianceBack, name)
        self.diaspora = diaspora
        self.daysToAdd = 6
        self.dateRefRanges = self.createDateRefRanges()
        self.overallDateRange = DateRange("overall", self.dateRefRanges[-1].dateRange.start, self.dateRefRanges[0].dateRange.end)

    def createDateRefRanges(self):
        """
        Creates dateRefRanges for ParashaScheduleManager in reverse chronological order
        """
        query = {}
        query["date"] = {
            "$lte": self.dateRangeEnd + timedelta(days=self.daysToAdd)
        }
        query["diaspora"]=self.diaspora
        results = db.parshiot.find(query, limit=self.numberOfSegments).sort("date", -1)
        dateRefRanges = []
        for result in results:
            dateRefRanges.append(DateRefRange(result["ref"], result["date"] - self.varianceBack,  result["date"] + self.varianceBack, result["parasha"]))
        return dateRefRanges

    def getRelevantUserHistories(self):
        query = [{"$match": self.overallDateRange.update_match({
            "is_sheet": False,
            "book": self.dateRefRanges[0].ref.book
        })}, {"$sort": {"datetime": 1}}, {"$group": {"_id": {"uid": "$uid"}, 
        "history": {"$push": {"ref": "$ref", "datetime": "$datetime", "uid": "$uid"}}}}]
        print(query)
        return db.user_history.aggregate(query)

    def getUsersWhoAreLearningSchedule(self):
        ScheduleManager.getUsersWhoAreLearningSchedule(self)

def setScheduleTraits():
    scheduleManagers = [ParashaScheduleManager()]
    for scheduleManager in scheduleManagers:
        scheduleManager.getUsersWhoAreLearningSchedule()

def setAllTrends(skip=[]):
    print("setAllTrends")
    if "userSheet" not in skip:
        print("setUserSheetTraits")
        setUserSheetTraits()
    if "sheet" not in skip:
        print("setSheetTraits")
        setSheetTraits()
    if "userLanguage" not in skip:
        print("setUserLanguageTraits")
        setUserLanguageTraits()
    if "category" not in skip:
        print("setCategoryTraits")
        setCategoryTraits()
    if "schedule" not in skip:
        print("setScheduleTraits")
        setScheduleTraits()
