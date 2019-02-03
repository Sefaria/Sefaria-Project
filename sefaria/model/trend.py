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
from sefaria.utils.util import concise_natural_time

from sefaria.system.exceptions import InputError

import logging
logger = logging.getLogger(__name__)


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
        "datatype", # from deriver.  needed?
        "timestamp",
        "period",
        "scope"
    ]

    optional_attrs = [
    ]


class TrendDeriver(object):
    """
    Name
    DataType
    For Users [bool]
    For Network/Site [bool]
    """
    name = ""
    datatype = ""
    for_user = ""
    for_group = ""


    # to consider: Is a well defined period the way to go with these?
    def process_user(self, user_id, period):
        """
        f(user, period) -> val
        :param period:
        :return:
        """
        pass

    def process_user_network(self, user_id, period):
        users = [] # get followed users
        return self._process_users(users, period)
        pass

    def process_comparable(self, period):
        pass

    def process_site(self, period):
        pass

    def _process_users(self, users, period):
