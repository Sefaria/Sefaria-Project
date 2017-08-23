# -*- coding: utf-8 -*-
from sefaria.model import *

idxset = IndexSet()
for idx in idxset:
    if len(getattr(idx, 'base_text_titles', [])) > 1:
        for btitle in idx.base_text_titles:
            flink = LinkSet.get_first_ref_in_linkset(btitle, idx.title)
            if flink:
<<<<<<< Updated upstream
                print "{} - {}) [{}] {}".format(idx.title, btitle, flink.refs, flink.type)
                flink.is_first_comment=True
=======
                print "{} - {}) {} {}".format(idx.title, btitle, flink.refs, flink.type)
                flink.is_first_comment = True
                flink.first_comment_indexes = [idx.title, btitle]
                if index_ref.contains(text.Ref(flink.refs[0])):
                    flink.first_comment_section_ref = text.Ref(flink.refs[0]).section_ref().normal()
                else:
                    flink.first_comment_section_ref = text.Ref(flink.refs[1]).section_ref().normal()

>>>>>>> Stashed changes
                flink.save(override_dependencies=True)
            else:
                print "{} - {}) Nothing".format(idx.title, btitle)
