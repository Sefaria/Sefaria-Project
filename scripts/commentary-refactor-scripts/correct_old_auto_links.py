# -*- coding: utf-8 -*-

from sefaria.model import *


def correct_commentary_links(oref, text=None, **kwargs):

    assert oref.is_commentary()
    tref = oref.normal()
    base_tref = tref[tref.find(" on ") + 4:]
    base_oref = Ref(base_tref)
    fixed_links = []


    # This is a special case, where the sections length is 0 and that means this is
    # a whole text or complex text node that has been posted. So we get each leaf node
    if not oref.sections:
        """vs = StateNode(tref).versionState
        if not vs.is_new_state:
            vs.refresh()  # Needed when saving multiple nodes in a complex text.  This may be moderately inefficient."""
        content_nodes = oref.index_node.get_leaf_nodes()
        for r in content_nodes:
            cn_oref = r.ref()
            text = TextFamily(cn_oref, commentary=0, context=0, pad=False).contents()
            length = cn_oref.get_state_ja().length()
            for i, sr in enumerate(cn_oref.subrefs(length)):
                stext = {"sections": sr.sections,
                        "sectionNames": text['sectionNames'],
                        "text": text["text"][i] if i < len(text["text"]) else "",
                        "he": text["he"][i] if i < len(text["he"]) else ""
                        }
                fixed_links += correct_commentary_links(sr, stext, **kwargs)

    else:
        if not text:
            try:
                text = TextFamily(oref, commentary=0, context=0, pad=False).contents()
            except AssertionError:
                logger.warning(u"Structure node passed to add_commentary_links: {}".format(oref.normal()))
                return

        if len(text["sectionNames"]) > len(text["sections"]) > 0:
            # any other case where the posted ref sections do not match the length of the parent texts sections
            # this is a larger group of comments meaning it needs to be further broken down
            # in order to be able to match the commentary to the basic parent text units,
            # recur on each section
            length = max(len(text["text"]), len(text["he"]))
            for i,r in enumerate(oref.subrefs(length)):
                stext = {"sections": r.sections,
                        "sectionNames": text['sectionNames'],
                        "text": text["text"][i] if i < len(text["text"]) else "",
                        "he": text["he"][i] if i < len(text["he"]) else ""
                        }
                fixed_links += correct_commentary_links(r, stext, **kwargs)

        # this is a single comment, trim the last section number (comment) from ref
        elif len(text["sections"]) == len(text["sectionNames"]):
            if (text['he'] and len(text['he'])) or (text['text'] and len(text['text'])): #only if there is actually text
                base_tref = base_tref[0:base_tref.rfind(":")]
                refs = [base_tref, tref]
                fixed = False
                link = Link().load({"$or": [{"refs": refs}, {"refs": [refs[1], refs[0]]}]})
                if link:
                    if getattr(link, 'auto', False) is not True:
                        fixed = True
                        link.auto = True
                    if getattr(link, 'type', '') != 'commentary':
                        fixed = True
                        link.type = 'commentary'
                    if getattr(link, 'generated_by', '') != "CommentaryAutoLinker":
                        fixed = True
                        #link.generated_by = "add_commentary_links"
                        link.generated_by = "CommentaryAutoLinker"
                    if fixed:
                        fixed_links += [tref]
                    try:
                        link.save()
                    except DuplicateRecordError as e:
                        pass
    return fixed_links


titles = library.get_commentary_version_titles()
for c in titles:
    print c
    rf = Ref(c)
    links = correct_commentary_links(rf)
    print "fixed {} links".format(len(links))