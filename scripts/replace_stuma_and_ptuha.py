# -*- coding: utf-8 -*-

from sefaria.helper.text import *

books = ("Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy")
versions = ("Tanach with Ta'amei Hamikra")

for book in books:
    for version in versions:
        find_and_replace_in_text(book, version, "he", "(פ)", "\n", 1)
        find_and_replace_in_text(book, version, "he", "(ס)", "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;", 1)
