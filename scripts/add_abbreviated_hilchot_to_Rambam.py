# -*- coding: utf-8 -*-

from sefaria.model import *

titles = library.get_indexes_in_category("Mishneh Torah")
for title in titles:
    indx = get_index(title)
    print indx.title
    try:
        he_titles = indx.nodes.all_node_titles("he")
        for he_title in he_titles:
            if u"הלכות" in he_title:
                #indx.nodes.add_title(he_title.replace(u"הלכות",u"הל׳"), "he")
                indx.nodes.add_title(he_title.replace(u"הלכות",u"הל" + u"'"), "he")
        he_titles = indx.nodes.all_node_titles("he")
        for he_title in he_titles:
            if u'רמב"ם' + u',' in he_title:
                indx.nodes.add_title(he_title.replace(u'רמב"ם' + u',',u'רמב"ם'), "he")
        for t in indx.nodes.all_node_titles("he"):
            print t
        indx.save()
    except Exception as e:
        print u"Caught exception: {}".format(e)