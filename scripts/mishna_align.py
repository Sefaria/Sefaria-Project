# -*- coding: utf-8 -*-

"""
The text of different editions of the Mishnah can have significant differences. In addition, the Wikisource
 edition of the Mishnah originally hosted on Sefaria seems to be very inaccurate, and was ultimately replaced
 by the Vilna edition of the Mishna. The goal of this module is to assess the differences between the two
 versions and ultimately align and correct all commentaries so that they match the Vilna edition.
"""

from sefaria.model import *

tractates = library.get_indexes_in_category('Mishnah')

"""
Phase I: The goal of these functions is to roughly compare the two versions and to find "suspicious" sections
and to gain a better understanding of the differences between them.
"""

