# -*- coding: utf-8 -*-
from sefaria.model import *

pd_vars = (u'public domain',
             u'Public domain',
             u'Public Domain')

VersionSet({"license": {"$in": pd_vars}}).update({"license": "Public Domain"})
VersionSet({"license": True}).update({"license": ""})
