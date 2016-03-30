# -*- coding: utf-8 -*-
"""

"""

from sefaria.model import *

base_titles = library.get_indexes_in_category("Torah") + library.get_indexes_in_category("Prophets") + library.get_indexes_in_category("Writings")
for title in base_titles:
    base = Ref(title)
    rashi = Ref("Rashi on " + title)
    current_rashi = rashi.first_available_section_ref().subref(1)
    while current_rashi:
        current_base = base.subref(current_rashi.sections[0:2])
        links = current_rashi.linkset().refs_from(current_rashi)
        for l in links:
            if l != current_base and l.is_tanach() and (not l.is_commentary()) and l.is_segment_level():
                print current_base.normal() + " ->  " + l.normal()
        current_rashi = current_rashi.next_segment_ref()

