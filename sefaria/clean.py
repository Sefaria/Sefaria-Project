"""
Small utilities for fixing problems that occur in the DB.
"""
from copy import deepcopy

import sefaria.model as model
from sefaria.system.database import db
from sefaria.utils.util import rtrim_jagged_string_array
from sefaria.system.exceptions import BookNameError


def remove_refs_with_false():
    """
    Removes any links and history records about links that contain False
    as one of the refs.
    """
    model.LinkSet({"refs": False}).delete()
    model.HistorySet({"new.refs": False}).delete()


"""
Detect any links that contain Refs we can't understand.
"""
def broken_links(tref=None, auto_links = False, manual_links = False, delete_links = False, check_text_exists=False):
    links = model.LinkSet(model.Ref(tref)) if tref else model.LinkSet()
    broken_links_list = []
    for link in links:
        errors = [0,0,0,0]
        try:
            rf1 = model.Ref(link.refs[0])
            errors[0] = 1
            if check_text_exists and rf1.is_empty():
                raise Exception("no text at this Ref")
            errors[1] = 1
            rf2 = model.Ref(link.refs[1])
            errors[2] = 1
            if check_text_exists and rf2.is_empty():
                raise Exception("no text at this Ref")
            errors[3] = 1
        except:
            if link.auto:
                if auto_links is False:
                    continue
            else:
                if manual_links is False:
                    continue
            link_type = "auto - {}".format(link.generated_by) if link.auto else "manual"
            error_code = sum(errors)
            if error_code == 0:
                error_msg = "Ref 1 is bad"
            elif error_code == 1:
                error_msg = "Ref 1 has no text in the system"
            elif error_code == 2:
                error_msg = "Ref 2 is bad"
            elif error_code == 3:
                error_msg = "Ref 2 has no text in the system"

            broken_links_list.append("{}\t{}\t{}".format(link.refs, link_type, error_msg))
            print(broken_links_list[-1])
            if delete_links:
                link.delete()
    return broken_links_list



def remove_bad_links():
    """
    Remove any links that contain Refs we can't understand.
    """
    broken_links(True, True, True)


def remove_old_counts():
    """
    Deletes counts documents which no longer correspond to a text or category.
    """
    # If there are counts documents save in the DB with invalid titles,
    # instantiation of the Count will cause a BookNameError.
    # But in this code instantiation happens in the line 'for count in counts'
    # How do we catch that? Additionally, we need access to the bad title after
    # The error has occurred. How would we get that? Reverting to direct DB call for now.
    counts = db.vstate.find({}, {"title": 1})
    for count in counts:
        if count.get("title", None):
            print("Checking " + count["title"])
            try:
                i = model.library.get_index(count["title"])
                if model.VersionSet({"title": i.title}).count() == 0:
                    print("Old count for Commentary with no content: %s" % count["title"])
                    db.vstate.remove({"_id": count["_id"]})                    
            except BookNameError:
                print("Old count: %s" % count["title"])
                db.vstate.remove({"_id": count["_id"]})


def remove_trailing_empty_segments():
    """
    Removes empty segments from the end of any text section.
    """
    texts = model.VersionSet()
    for text in texts:
        if not model.Ref.is_ref(text.title):
            continue # Ignore text versions we don't understand
        new_text = rtrim_jagged_string_array(deepcopy(text.chapter))
        if new_text != text.chapter:
            print(text.title + " CHANGED")
            text.chapter = new_text
            text.save()
            model.VersionState(text.title).refresh()