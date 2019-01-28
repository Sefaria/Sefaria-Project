# -*- coding: utf-8 -*-
"""
Harvest Translation Requests from untranslated sources in source sheets.
"""
import sys

from sefaria.model.translation_request import *


hours = int(sys.argv[1]) if len(sys.argv) > 1 else 0
add_translation_requests_from_source_sheets(hours)
