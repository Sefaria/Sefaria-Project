# -*- coding: utf-8 -*-
"""
Fix problematic version of HaNetziv
- Merge Hanetziv and HaEmek Davar - name "Ha'amak Davar"
- Rename version of Hanetziv on Genesis
"""

import sys
# noinspection PyUnresolvedReferences
import os

p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")

from sefaria.texts import *


old = "Hanetziv on Genesis"
new = "Ha'amak Davar on Genesis"

update_title_in_texts(old, new)
update_title_in_links(old, new)
update_title_in_notes(old, new)
update_title_in_history(old, new)
update_title_in_counts(old, new)

update_text_title("HaEmek Davar", "Ha'amak Davar")

merge_text_versions("Ha'amek Davar", "Ha'amek Devar", "Ha'amak Davar on Genesis", "he")

update_version_title("Ha'amek Davar", "Ha'amak Davar", "Ha'amak Davar on Genesis", "he")
