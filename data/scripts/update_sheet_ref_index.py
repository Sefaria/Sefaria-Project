# -*- coding: utf-8 -*-
"""
Update included_refs field on source sheets
to keep an indexable list of refs that a source sheet includes. 
"""
import sys

from sefaria.sheets import update_included_refs


if len(sys.argv) > 1:
    update_included_refs(hours=int(sys.argv[1]))
else:
    update_included_refs()