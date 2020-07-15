# -*- coding: utf-8 -*-

from sefaria.model import *

titles = library.get_indexes_in_category("Mishneh Torah")
for title in titles:
    indx = get_index(title)
    print(indx.title)
    try:
        he_titles = indx.nodes.all_node_titles("he")
        for he_title in he_titles:
            if "הלכות" in he_title:
                #indx.nodes.add_title(he_title.replace(u"הלכות",u"הל׳"), "he")
                indx.nodes.add_title(he_title.replace("הלכות","הל" + "'"), "he")
        he_titles = indx.nodes.all_node_titles("he")
        for he_title in he_titles:
            if 'רמב"ם' + ',' in he_title:
                indx.nodes.add_title(he_title.replace('רמב"ם' + ',','רמב"ם'), "he")
        for t in indx.nodes.all_node_titles("he"):
            print(t)
        indx.save()
    except Exception as e:
        print("Caught exception: {}".format(e))