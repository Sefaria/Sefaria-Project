# -*- coding: utf-8 -*-

"""
The text of different editions of the Mishnah can have significant differences. In addition, the Wikisource
 edition of the Mishnah originally hosted on Sefaria seems to be very inaccurate, and was ultimately replaced
 by the Vilna edition of the Mishna. The goal of this module is to assess the differences between the two
 versions and ultimately align and correct all commentaries so that they match the Vilna edition.
"""

import os
import sys
p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
print p
sys.path.insert(0, p)
from sefaria.local_settings import *
os.environ['DJANGO_SETTINGS_MODULE'] = 'sefaria.settings'
from sefaria.model import *

tractates = library.get_indexes_in_category('Mishnah')

"""
Phase I: The goal of these functions is to roughly compare the two versions and to find "suspicious" sections
and to gain a better understanding of the differences between them.
"""


def get_relevant_books():
    """
    As not all tractates have had the Vilna edition uploaded yet, get those tractates for which the version has
    been uploaded.
    :return: List of tractates for which the Vilna edition has been uploaded.
    """

    relevant = []

    for book in tractates:

        ref = Ref(book)
        for version in ref.version_list():
            if version['versionTitle'] == 'Vilna Mishna':
                relevant.append(book)
                break
    return relevant


def compare_number_of_mishnayot(chapter, allowed=0):
    """
    Compares number of mishnayot between two versions.
    :param chapter: Tuple, each value is a list of Mishnayot from each version.
    :param allowed: Allowed difference between number of Mishnayot.
    :return: True or False
    """

    if abs(len(chapter[0]) - len(chapter[2])) > allowed:
        return False
    else:
        return True
