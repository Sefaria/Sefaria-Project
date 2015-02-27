# coding=utf-8
import argparse
import sys
import os, errno

import itertools
import difflib
import re

from sefaria.model import *
from sefaria.helper.text import *
from sefaria.helper.link import *


def run_mishnah_compare():
    run_bulk_book_comparison('Mishnah', 'he', 'Torat Emet 357', 'Wikisource Mishna')

def run_bulk_book_comparison(category, language, version1, version2):
    indxs = IndexSet({"categories.0":category})
    results = []
    for idx in indxs:
        print idx.title
        ver1 = Version().load({"title": idx.title, "versionTitle": version1, "language": language})
        if not ver1:
            print "Error: %s %s version not found" % (idx.title, version1)
            continue
        ver2 = Version().load({"title": idx.title, "versionTitle": version2, "language": language})
        if not ver2:
            print "Error: %s %s version not found" % (idx.title, version2)
            continue
        result = do_book_comparison(idx.title, ver1, ver2)
        output_results(result)



def do_book_comparison(book_title, version1, version2):
    #check number of chapters.
    #compare to the parsed Leningrad itself
    #compare to the current sefaria versions.

    results = {}
    results['title'] = book_title
    results['versions'] = [version1.versionTitle, version2.versionTitle]
    results['chapter_count'] = [len(version1.chapter), len(version2.chapter)]
    results['verse_counts'] = []
    results['htmldiff'] = ''

    for chapter1, chapter2 in zip(version1.chapter, version2.chapter):
        results['verse_counts'].append([len(chapter1), len(chapter2)])

    html_diff = difflib.HtmlDiff().make_file(flatten_text(make_consonantal_text(version1.chapter)), flatten_text(make_consonantal_text(version2.chapter)), version1.versionTitle, version2.versionTitle)
    html_diff = html_diff.replace('charset=ISO-8859-1','charset=utf-8')
    results['htmldiff'] = html_diff.encode('utf-8')
    return results

def output_results(results):
    if isinstance(results, list):
        for result in results:
            output_results(result)
        return
    else:
        mkdir_p("/tmp/text_compare_script")
        diff_file = open("/tmp/text_compare_script/%s_%s_%s.html" % (results['title'], results['versions'][0],results['versions'][1]), 'wb+')
        diff_file.write(results['htmldiff'])
        diff_file.close()
        length_results = open("/tmp/text_compare_script/length_comparison.txt", 'ab+')
        if not all_same(results['chapter_count']):
            length_results.write("%s chapter count mismatch. [%s has %d|%s has %d]\n" % (results['title'], results['versions'][0], results['chapter_count'][0], results['versions'][1], results['chapter_count'][1]))
        for chnum, verse_count in enumerate(results['verse_counts'], 1):
            if not all_same(verse_count):
                length_results.write("%s.%s verse count mismatch. [%s has %d|%s has %d]\n" % (results['title'], chnum, results['versions'][0], verse_count[0], results['versions'][1], verse_count[1]))
        length_results.close()


"""  util to make safe creating a dir """
def mkdir_p(path):
    try:
        os.makedirs(path)
    except OSError as exc: # Python >2.5
        if exc.errno == errno.EEXIST and os.path.isdir(path):
            pass
        else: raise


def all_same(items):
    #print items
    return all(x == items[0] for x in items)

def make_consonantal_text(book_text):
    return make_derived_text(book_text, re.compile(ur"[\u0591-\u05bd\u05bf-\u05c5\u05c7]|\([\u0590-\u05ea]\)", re.UNICODE))

def make_vowel_text(book_text):
    return make_derived_text(book_text, re.compile(ur"[\u0591-\u05af\u05bd\u05bf\u05c0\u05c4\u05c5]|\([\u0590-\u05ea]\)", re.UNICODE))

def make_derived_text(book_text, regex):
    return [[re.sub(ur"\s{2,}", ur" ", regex.sub('', verse)).strip() for verse in chapter] for chapter in book_text]

def flatten_text(book_text):
    result = []
    for chnum, chapter in enumerate(book_text,1):
        result.append("%s" % chnum)
        result.extend(["%s. %s" % (num, verse) for num, verse in enumerate(chapter,1)])
    return result


""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    run_mishnah_compare()