# -*- coding: utf-8 -*-

import argparse
import re
from fuzzywuzzy import process, fuzz
from fuzzywuzzy import utils as fuzzyutils
from sefaria.model import *


def laaz_process(s):
    return fuzzyutils.full_process(re.sub(ur'[\":]','', s), False)


def create_ngrams(input_words, n):
    gram_list = []
    for k in range(1,n+1):
        gram_list += [" ".join(input_words[i:i + k]) for i in xrange(len(input_words) - k + 1)]
    return gram_list


def flatten_text_to_lowest_refs(oref):
    """
    Flatten the text to a tuples of ref and text. easier to search through and filter
    :param ref:
    :param ref_text:
    :return:
    """
    flat_texts = []
    ref_text = oref.text(lang='he').text
    if oref.index.commentaryCategories[0] == 'Talmud':
        for lnum, line in enumerate(ref_text,1):
            for cnum, comment in enumerate(line, 1):
                new_ref = Ref("{} {}.{}".format(oref.normal(), lnum, cnum)).normal()
                flat_texts.append((new_ref, comment))
    elif oref.index.commentaryCategories[0] == 'Tanach':
        for cnum, comment in enumerate(ref_text, 1):
            new_ref = Ref("{}.{}".format(oref.normal(), cnum)).normal()
            flat_texts.append((new_ref, comment))
    return flat_texts


def narrow_search_by_orig_word(text_rows, orig_word):
    return [x for x in text_rows if orig_word in x[1]]


def narrow_search_by_word_existence(text_rows, keywords):
    kwfilter = lambda w: any(x in w[1] for x in keywords)
    return filter(kwfilter, text_rows)


def find_closest_match(text_rows, word, filter_words_with_quotation_marks=True):
    #Todo: if the headword is more than one owrd, must look through ngrams instead of just split single words.
    results = []
    headword_size = len(word.split())
    for row in text_rows:
        text_words = row[1].split()
        if headword_size > 1:
            text_words = create_ngrams(text_words, headword_size)
        if filter_words_with_quotation_marks:
            text_words = [w for w in text_words if '"' in w]
        if len(text_words):
            matched_word, score = process.extractOne(word.replace('"', ''), text_words, processor=laaz_process, scorer=fuzz.UWRatio)
            results.append((row[0], row[1], matched_word, score))
    results = sorted(results, key=lambda x: x[-1], reverse=True)
    return results[0] if len(results) else None





laaz_rashi_entries = LexiconEntrySet({'parent_lexicon': 'Rashi Foreign Lexicon'})
print "{})\t[{}]\t{}\t{}\t{}\t{}".format("Catane Number",
                                         "Word Referenced in Text",
                                         "Lexicon Headword",
                                         "Best Ref",
                                         "Best Word Match",
                                         "Level of Uncertainity")
for entry in laaz_rashi_entries:
    results = []
    only_in_print_str = u'מצוי רק בדפוס'
    not_in_print_str = u'מצוי רק ב'
    if only_in_print_str in entry.content['notes'] or not_in_print_str not in entry.content['notes']:
        oref = Ref("Rashi on {}".format(entry.orig_ref))
        level_of_uncertainity = 1
        headword = entry.headword
        text_rows = flatten_text_to_lowest_refs(oref)
        #try and filter down to comments containing the original word from Rashi/the Commented Text
        filtered_text_rows = narrow_search_by_orig_word(text_rows, entry.orig_word)
        if not len(filtered_text_rows):
            level_of_uncertainity +=1
            filtered_text_rows = text_rows
        #filter comments that have the word לעז in them.
        keywd_filtered_text_rows = narrow_search_by_word_existence(filtered_text_rows, [u'\u05DC\u05E2\"\u05D6', u'\u05DC\u05E2\u05D6'])
        if not len(keywd_filtered_text_rows):
            level_of_uncertainity +=1
            keywd_filtered_text_rows = filtered_text_rows
        best_match = find_closest_match(keywd_filtered_text_rows, entry.headword)
        if not best_match:
            level_of_uncertainity +=2
            best_match = find_closest_match(keywd_filtered_text_rows, entry.headword, False)
        if best_match:
            print "{})\t[{}]\t{}\t{}\t{}\t{}".format(entry.catane_number.encode('utf-8'),
                                               entry.orig_word.encode('utf-8'),
                                               entry.headword.encode('utf-8'),
                                               best_match[0],
                                               best_match[2].encode('utf-8'),
                                                     level_of_uncertainity)
        else:
            print "{})\t[{}]\t{}\t{}\t{}\t{}".format(entry.catane_number.encode('utf-8'),
                                                     entry.orig_word.encode('utf-8'),
                                                     entry.headword.encode('utf-8'),
                                                     oref.normal(),
                                                     'NO MATCH FOUND',-1)
    else:
        print "{})\t[{}]\t{}\t{}\t{}\t{}".format(entry.catane_number.encode('utf-8'),
                                    entry.orig_word.encode('utf-8'),
                                    entry.headword.encode('utf-8'),
                                    oref.normal(),
                                    'Does not appear in print versions',-1)



