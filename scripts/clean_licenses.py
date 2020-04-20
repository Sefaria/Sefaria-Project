# -*- coding: utf-8 -*-
from sefaria.model import *

pd_vars = ('public domain',
             'Public domain',
             'Publlic Domain')

VersionSet({"license": {"$in": pd_vars}}).update({"license": "Public Domain"})
VersionSet({"license": True}).update({"license": ""})
