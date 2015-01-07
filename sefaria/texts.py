# -*- coding: utf-8 -*-
"""
texts.py -- backend core for manipulating texts, refs (citations), links, notes and text index records.

MongoDB collections handled in this file: index, texts, links, notes, history
"""

import logging
logger = logging.getLogger(__name__)


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
