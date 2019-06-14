# -*- coding: utf-8 -*-

"""
trend.py
"""

import time
from datetime import datetime

from . import abstract as abst
from . import user_profile
from . import text

from sefaria.system.database import db

from sefaria.system.exceptions import InputError

import logging
logger = logging.getLogger(__name__)

periods = {
    "alltime": {"query": {}}
}


def get_session_traits(request, uid=None):

    traits = {
        "inDiaspora": bool(request.diaspora),
        "inIsrael": not request.diaspora,
    }
    if uid is not None:
        traits.update({
            "readsHebrew":              Trend.get_user_trend_value(uid, "HebrewAbility") >= .5,
            "readsEnglish": True,           # needs to be wired up
            "prefersBilingual": False,      # needs to be wired up
            "isSephardi": False,            # needs to be wired up
            "usesSheets": True,             # needs to be wired up
            "createsSheets": False,         # needs to be wired up
        })

    return [k for k, v in traits.items() if v]


class Trend(abst.AbstractMongoRecord):
    '''
    Value
    Timestamp
    Period Covered [week, month, season, alltime]
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
    def get_user_trend_value(cls, uid, name, period="alltime"):
        return cls().load({"uid": uid, "name": name, "period": period}).value

    def _init_defaults(self):
        self.timestamp = int(time.time())

    def _validate(self):
        assert self.scope == "site" or hasattr(self, "uid")


class TrendSet(abst.AbstractMongoSet):
    recordClass = Trend


def setUserLanguageTraits():
    TrendSet({"name": {"$in": ["EnglishTolerance", "HebrewAbility"]}}).delete()

    all_users = getAllUsersLanguageUsage()

    for uid, lang_dict in all_users.iteritems():
        profile = user_profile.UserProfile(id=uid)

        he = float(lang_dict["languages"].get("hebrew", 0.0))
        en = float(lang_dict["languages"].get("english", 0.0))
        bi = float(lang_dict["languages"].get("bilingual", 0.0))
        total = float(lang_dict.get("total", 0.0))
        assert total

        # EnglishTolerance
        # If user has English interface conclude English tolerance
        if profile.settings.get("interface_language") == "english" or not he:
            value = 1.0
        elif not en and not bi:
            value = 0.0
        else:
            # percentage of visits registered w/ English content
            value = (en + bi - he) / total

        Trend({
            "name":         "EnglishTolerance",
            "value":        value,
            "datatype":     "float",
            "timestamp":    datetime.utcnow(),
            "period":       "alltime",
            "scope":        "user",
            "uid":          uid
        }).save()

        # HebrewAbility
        # If user has Hebrew interface conclude Hebrew ability
        if profile.settings.get("interface_language") == "hebrew":
            value = 1.0
        # If they read a decent bit of Hebrew stuff
        # else:
        #    value = 0.9 if he / total > .05 else 0.5     # baseline

        # all bi is .50,  Each he adds a bunch.  Each en takes away a bit.
        else:
            ent = en/total
            het = he/total * 3
            het = .5 if het > .5 else het
            value = .5 + het - ent

        Trend({
            "name":         "HebrewAbility",
            "value":        value,
            "datatype":     "float",
            "timestamp":    datetime.utcnow(),
            "period":       "alltime",
            "scope":        "user",
            "uid":          uid
        }).save()


def getAllUsersLanguageUsage():
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
        {"$match": {
            "secondary": False,
            "language": {"$in": ["hebrew", "english", "bilingual"]}}},
        {"$group": {
            "_id": {"language": "$language", "uid": "$uid"},
            "cnt": {"$sum": 1.0}}},
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




# Needs thought / refactor

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
