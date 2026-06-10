# -*- coding: utf-8 -*-
import django
django.setup()
from sefaria.model import *

"""
Commandeering this old script to update lengths on various texts
"""

if __name__ == '__main__':
    i = library.get_indexes_in_category("Tosefta Lieberman", full_records=True)
    for ind in i:
        sn = StateNode(ind.title)
        ac = sn.get_available_counts("he")
        try:
            l = ind.nodes.lengths
            if ac != l:
                print("{} {}:{}".format(ind.title, ac, l))
                ind.nodes.lengths = ac[:]
                ind.save()
        except Exception as e:
            print("{} {}".format(ind.title, e))
            ind.nodes.lengths = ac[:]
            ind.save()