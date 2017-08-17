# -*- coding: utf-8 -*-
from sefaria.model import *
from sefaria.system.database import db

db.links.update({}, {'$unset': {'is_first_comment': 1}}, multi=True)

idxset = IndexSet()
for idx in idxset:
    if len(getattr(idx, 'base_text_titles', [])) > 1:
        for btitle in idx.base_text_titles:
            flink = LinkSet.get_first_ref_in_linkset(btitle, idx.title)
            if flink:
                print "{} - {}) [{}] {}".format(idx.title, btitle, flink.refs, flink.type)
                flink.is_first_comment=True
                flink.save(override_dependencies=True)
            else:
                print "{} - {}) Nothing".format(idx.title, btitle)
