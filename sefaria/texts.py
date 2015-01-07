# -*- coding: utf-8 -*-
"""
texts.py -- backend core for manipulating texts, refs (citations), links, notes and text index records.

MongoDB collections handled in this file: index, texts, links, notes, history
"""

import logging

import sefaria.model as model
import summaries
from sefaria.system.database import db
import sefaria.system.cache as scache


logger = logging.getLogger(__name__)


# No usages found
def merge_text(a, b):
    """
    Merge two lists representing texts, giving preference to a, but keeping
    values froms b when a position in a is empty or non existant.

    e.g merge_text(["", "Two", "Three"], ["One", "Nope", "Nope", "Four]) ->
        ["One", "Two" "Three", "Four"]
    """
    length = max(len(a), len(b))
    out = [a[n] if n < len(a) and (a[n] or not n < len(b)) else b[n] for n in range(length)]
    return out


def rename_category(old, new):
    """
    Walk through all index records, replacing every category instance
    called 'old' with 'new'.
    """
    indices = model.IndexSet({"categories": old})

    assert indices.count(), "No categories named {}".format(old)

    for i in indices:
        i.categories = [new if cat == old else cat for cat in i.categories]
        i.save()

    summaries.update_summaries()


def resize_text(title, new_structure, upsize_in_place=False):
    # todo: Needs to be converted to objects, but no usages seen in the wild.
    """
    Change text structure for text named 'title'
    to 'new_structure' (a list of strings naming section names)

    Changes index record as well as restructuring any text that is currently saved.

    When increasing size, any existing text will become the first segment of the new level
    ["One", "Two", "Three"] -> [["One"], ["Two"], ["Three"]]

    If upsize_in_place==True, existing text will stay in tact, but be wrapped in new depth:
    ["One", "Two", "Three"] -> [["One", "Two", "Three"]]

    When decreasing size, information is lost as any existing segments are concatenated with " "
    [["One1", "One2"], ["Two1", "Two2"], ["Three1", "Three2"]] - >["One1 One2", "Two1 Two2", "Three1 Three2"]

    """
    index = db.index.find_one({"title": title})
    if not index:
        return False

    old_structure = index["sectionNames"]
    index["sectionNames"] = new_structure
    db.index.save(index)

    delta = len(new_structure) - len(old_structure)
    if delta == 0:
        return True

    texts = db.texts.find({"title": title})
    for text in texts:
        if delta > 0 and upsize_in_place:
            resized = text["chapter"]
            for i in range(delta):
                resized = [resized]
        else:
            resized = resize_jagged_array(text["chapter"], delta)

        text["chapter"] = resized
        db.texts.save(text)

    # TODO Rewrite any existing Links
    # TODO Rewrite any exisitng History items

    summaries.update_summaries_on_change(title)
    scache.reset_texts_cache()

    return True


def resize_jagged_array(text, factor):
    """
    Return a resized jagged array for 'text' either up or down by int 'factor'.
    Size up if factor is positive, down if negative.
    Size up or down the number of times per factor's size.
    E.g., up twice for '2', down twice for '-2'.
    """
    new_text = text
    if factor > 0:
        for i in range(factor):
            new_text = upsize_jagged_array(new_text)
    elif factor < 0:
        for i in range(abs(factor)):
            new_text = downsize_jagged_array(new_text)

    return new_text


def upsize_jagged_array(text):
    """
    Returns a jagged array for text which restructures the content of text
    to include one additional level of structure.
    ["One", "Two", "Three"] -> [["One"], ["Two"], ["Three"]]
    """
    new_text = []
    for segment in text:
        if isinstance(segment, basestring):
            new_text.append([segment])
        elif isinstance(segment, list):
            new_text.append(upsize_jagged_array(segment))

    return new_text


def downsize_jagged_array(text):
    """
    Returns a jagged array for text which restructures the content of text
    to include one less level of structure.
    Existing segments are concatenated with " "
    [["One1", "One2"], ["Two1", "Two2"], ["Three1", "Three2"]] - >["One1 One2", "Two1 Two2", "Three1 Three2"]
    """
    new_text = []
    for segment in text:
        # Assumes segments are of uniform type, either all strings or all lists
        if isinstance(segment, basestring):
            return " ".join(text)
        elif isinstance(segment, list):
            new_text.append(downsize_jagged_array(segment))

    # Return which was filled in, defaulted to [] if both are empty
    return new_text


# move to JaggedArray?
def grab_section_from_text(sections, text, toSections=None):
    """
    Returns a section of text from within the jagged array 'text'
    that is denoted by sections and toSections.
    """
    if len(sections) == 0:
        return text
    if not text:
        return ""

    toSections = toSections or sections
    try:
        if sections[0] == toSections[0]:
            if len(sections) == 1:
                return text[sections[0]-1]
            else:
                return grab_section_from_text(sections[1:], text[sections[0]-1], toSections[1:])
        else:
            return text[ sections[0]-1 : toSections[0]-1 ]

    except IndexError:
        # Index out of bounds, we don't have this text
        return ""
    except TypeError:
        return ""
