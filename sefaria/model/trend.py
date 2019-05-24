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


def get_user_traits(request, uid):
    traits = {
        "inDiaspora": bool(request.diaspora),
        "inIsrael": not request.diaspora,
        "readsHebrew": True, # needs to be wired up
        "readsEnglish": True, # needs to be wired up
    }

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

    def _init_defaults(self):
        self.timestamp = int(time.time())

    def _validate(self):
        assert self.scope == "site" or hasattr(self, "uid")


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


class HebrewAbilityFactory(TrendFactory):
    name = "HebrewAbility"
    desc = "Value between 0 and 1 - 1 Being clear Hebrew ability, 0 being clear inability"
    datatype = "float"   # int, float, str, bool, dict
    for_user = True
    for_group = False

    def process_user(self, uid, period):
        # If user has Hebrew interface (and usage?) conclude w/ (start w/?)  1
        user_histories = user_profile.UserHistorySet({"uid": uid}, sort=[("time_stamp", 1)])

        Trend({
            "name":         self.name,
            "value":        "",
            "datatype":     self.datatype,
            "timestamp":    "",
            "period":       "",
            "scope":        ""
        }).save()


class EnglishToleranceFactory(TrendFactory):
    name = "EnglishTolerance"
    desc = "Value between 0 and 1 - 1 Being clear English appreciation, 0 being clear English intolerance"
    datatype = "float"   # int, float, str, bool, dict
    for_user = True
    for_group = False

    def process_user(self, uid, period):
        # If user has English interface (and usage?) conclude w/ (start w/?)  1

        user_histories = user_profile.UserHistorySet({"uid": uid}, sort=[("time_stamp", 1)])

        Trend({
            "name":         self.name,
            "value":        "",
            "datatype":     self.datatype,
            "timestamp":    "",
            "period":       "",
            "scope":        ""
        }).save()