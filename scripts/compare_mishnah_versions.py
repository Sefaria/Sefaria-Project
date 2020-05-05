# coding=utf-8
import argparse
import sys
import os, errno
import re

from sefaria.model import *
from sefaria.helper.text import *
from sefaria.helper.link import *

strip_cantillation_vowel_regex = re.compile(r"[\u0591-\u05bd\u05bf-\u05c5\u05c7]", re.UNICODE)

mishnah_books = library.get_indexes_in_category('Mishnah', full_records=True)
mishnah_books = sorted(mishnah_books, key=lambda k: k.order[0])
mishnah_version_a = "Wikisource Mishna"
mishnah_version_b = "Torat Emet 357"
results = []


def print_texts(filename, index_set, version_title, language, break_lowest_level=False):
    with open(filename, 'wb+') as filep:
        for idx in index_set:
            filep.write('***{}***\n'.format(idx.get_title('he').encode('utf-8')))
            version = Version().load({'title': idx.title, 'versionTitle': version_title, 'language': language})
            for chnum, chapter in enumerate(version.chapter,1):
                filep.write('#{}#\n'.format(chnum))
                verses = ''
                for verse in chapter:
                    verses+=re.sub(r"\s{2,}", r" ", strip_cantillation_vowel_regex.sub('', verse)).strip()
                    if break_lowest_level:
                        verses+='\n'
                filep.write('{}\n'.format(verses.encode('utf-8')))


def calculate_len_diffs(idx, version1, version2):
    v1_len = len(version1.chapter)
    v2_len = len(version2.chapter)
    if v1_len != v2_len:
        results.append("%s chapter count mismatch. [%s has %d|%s has %d]\n" % (idx.title, version1.versionTitle, v1_len, version2.versionTitle, v2_len))
    chapter_num = 1
    for chapter1, chapter2 in zip(version1.chapter, version2.chapter):
        vs1_len = len(chapter1)
        vs2_len = len(chapter2)
        if vs1_len != vs2_len:
            results.append("%s chapter %s mishnayot count mismatch. [%s has %d|%s has %d]\n" % (idx.title, chapter_num,  version1.versionTitle, vs1_len, version2.versionTitle, vs2_len))
        chapter_num+=1


print_texts('mishnah - Wikisource Mishna.txt', mishnah_books, mishnah_version_a, 'he', True)
print_texts('mishnah - Torat Emet 357.txt', mishnah_books, mishnah_version_b, 'he', True)
for book in mishnah_books:
    v1 = Version().load({'title': book.title, 'versionTitle': mishnah_version_a, 'language': 'he'})
    v2 = Version().load({'title': book.title, 'versionTitle': mishnah_version_b, 'language': 'he'})
    calculate_len_diffs(book, v1, v2)
with open('mishnah_versions_lengths.txt', 'wb+') as resfile:
    resfile.writelines(results)
