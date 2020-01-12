# -*- coding: utf-8 -*-

import argparse
import re
from sefaria.model import *
from sefaria.helper.text import modify_text_by_function


def replace_double_quotes(text):
    """
    :param text: the text to replace
    :return:a text with all 2 character length double quotes replaced with a single character double quote.
    """
    return text.replace("''", '"')



bible_books = library.get_indexes_in_category('Tanach')
for book in bible_books:
    rashi_title = "Rashi on {}".format(book)
    print(rashi_title.encode('utf-8'))
    vs = VersionSet({'title': rashi_title, 'language': 'he'})
    for v in vs:
        modify_text_by_function(rashi_title, v.versionTitle, 'he', replace_double_quotes, 8646, skip_links=True)

talmud_books = library.get_indexes_in_category('Talmud')
for book in talmud_books:
    rashi_title = "Rashi on {}".format(book)
    print(rashi_title.encode('utf-8'))
    vs = VersionSet({'title': rashi_title, 'language': 'he'})
    for v in vs:
        modify_text_by_function(rashi_title, v.versionTitle, 'he', replace_double_quotes, 8646, skip_links=True)