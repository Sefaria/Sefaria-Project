# -*- coding: utf-8 -*-
from sefaria.model import *
from sefaria.system.database import db

db.links.update({}, {'$unset': {'is_first_comment': 1, 'first_comment_indexes': 1, 'first_comment_section_ref': 1}}, multi=True)

idxset = IndexSet()
for idx in idxset:
    index_ref = Ref(idx.title)
    if len(getattr(idx, 'base_text_titles', [])) > 1:
        for btitle in idx.base_text_titles:
            flink = LinkSet.get_first_ref_in_linkset(btitle, idx.title)
            if flink:
                print("{} - {}) {} {}".format(idx.title, btitle, flink.refs, flink.type))
                flink.is_first_comment = True
                flink.first_comment_indexes = [idx.title, btitle]
                if index_ref.contains(text.Ref(flink.refs[0])):
                    flink.first_comment_section_ref = text.Ref(flink.refs[0]).section_ref().normal()
                else:
                    flink.first_comment_section_ref = text.Ref(flink.refs[1]).section_ref().normal()

                flink.save(override_dependencies=True)
            else:
                print("{} - {}) Nothing".format(idx.title, btitle))
