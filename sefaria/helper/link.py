import copy

import sefaria.counts as counts
import sefaria.model as model
from sefaria.system.exceptions import DuplicateRecordError, InputError
import sefaria.tracker as tracker


def add_commentary_links(tref, user, **kwargs):
    """
    Automatically add links for each comment in the commentary text denoted by 'ref'.
    E.g., for the ref 'Sforno on Kohelet 3:2', automatically set links for
    Kohelet 3:2 <-> Sforno on Kohelet 3:2:1, Kohelet 3:2 <-> Sforno on Kohelet 3:2:2, etc.
    for each segment of text (comment) that is in 'Sforno on Kohelet 3:2'.
    """
    #text = get_text(tref, commentary=0, context=0, pad=False)
    text = model.TextFamily(model.Ref(tref), commentary=0, context=0, pad=False).contents()
    tref = model.Ref(tref).normal()

    book = tref[tref.find(" on ") + 4:]

    if len(text["sections"]) == len(text["sectionNames"]):
        # this is a single comment, trim the last secton number (comment) from ref
        book = book[0:book.rfind(":")]
        link = {
            "refs": [book, tref],
            "type": "commentary",
            "anchorText": "",
            "auto": True,
            "generated_by": "add_commentary_links"
        }
        try:
            tracker.add(user, model.Link, link, **kwargs)
        except DuplicateRecordError as e:
            pass

    elif len(text["sections"]) == (len(text["sectionNames"]) - 1):
        # This means that the text (and it's corresponding ref) being posted has the amount of sections like the parent text
        # (the text being commented on) so this is single group of comments on the lowest unit of the parent text.
        # and we simply iterate and create a link for each existing one to point to the same unit of parent text
        length = max(len(text["text"]), len(text["he"]))
        for i in range(length):
                link = {
                    "refs": [book, tref + ":" + str(i + 1)],
                    "type": "commentary",
                    "anchorText": "",
                    "auto": True,
                    "generated_by": "add_commentary_links"
                }
                try:
                    tracker.add(user, model.Link, link, **kwargs)
                except DuplicateRecordError as e:
                    pass

    elif len(text["sections"]) > 0:
        # any other case where the posted ref sections do not match the length of the parent texts sections
        # this is a larger group of comments meaning it needs to be further broken down
        # in order to be able to match the commentary to the basic parent text units,
        # recur on each section
        length = max(len(text["text"]), len(text["he"]))
        for i in range(length):
            add_commentary_links("%s:%d" % (tref, i + 1), user)
    else:
        #This is a special case of the above, where the sections length is 0 and that means this is
        # a whole text that has been posted. For  this we need a better way than get_text() to get the correct length of
        # highest order section counts.
        # We use the counts document for that.
        text_counts = counts.count_texts(tref)
        length = len(text_counts["counts"])
        for i in range(length):
            add_commentary_links("%s:%d" % (tref, i+1), user)


def add_links_from_text(ref, text, text_id, user, **kwargs):
    """
    Scan a text for explicit references to other texts and automatically add new links between
    ref and the mentioned text.

    text["text"] may be a list of segments, an individual segment, or None.

    Lev - added return on 13 July 2014
    """
    if not text:
        return []
    elif isinstance(text, list):
        links = []
        for i in range(len(text)):
            subtext = text[i]
            single = add_links_from_text("%s:%d" % (ref, i + 1), subtext, text_id, user, **kwargs)
            links += single
        return links
    elif isinstance(text, basestring):
        links = []
        refs = model.library.get_refs_in_string(text)
        for oref in refs:
            link = {
                "refs": [ref, oref.normal()],
                "type": "",
                "auto": True,
                "generated_by": "add_links_from_text",
                "source_text_oid": text_id
            }
            try:
                tracker.add(user, model.Link, link, **kwargs)
                links += [link]
            except InputError as e:
                pass
        return links


