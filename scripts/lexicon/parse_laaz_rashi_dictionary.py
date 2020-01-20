# -*- coding: utf-8 -*-

import argparse
import sys
import json
import csv
import re
import os, errno
import os.path
import requests

from sefaria.model import *

class LaazRashiParser(object):
    bible_data_file = 'data/tmp/Laaz-Rashi-Bible.txt'
    talmud_data_file = 'data/tmp/Laaz-Rashi-Shas.txt'

    def __init__(self):
        self.input_rows = self.parse_input(self.talmud_data_file)
        self.input_rows += self.parse_input(self.bible_data_file)
        self.entries = {}
        control_talmud = list(range(1, 2463))
        control_bible = list(range(3001, 4383))
        self.control = control_talmud + control_bible



    def parse_input(self, filename):
        input_rows = []
        l_regex = re.compile('[0-9]{1,4}.*\$?', re.UNICODE) #make sure it's an input line and not comments in the input file
        with open(filename, 'rb') as infile:
            for line in infile:
                line = line.strip()
                if l_regex.match(line):
                    input_rows.append(line)
                    #print '*) {}'.format(line)
        return input_rows

    def _make_lexicon_obj(self):
        lex = {
            'name' : 'Rashi Foreign Lexicon',
            'title' : 'אוצר לעזי רש"י',
            'language' : 'heb',
            'to_language' : 'heb',
            'pub_location' : 'Jerusalem',
            'pub_date' : '1983-1991, 2006',
            'editor': 'Moshe Catane',
            'source' : 'Wikimedia Commons',
            'source_url': 'https://commons.wikimedia.org/wiki/File:Catane_La%27azei-Rashi_Tanakh_HB48057.pdf',
        }
        rashi_lex = Lexicon(lex)
        rashi_lex.save()


    def parse_contents(self):
        print("BEGIN PARSING")
        self._make_lexicon_obj()
        for entry_row in self.input_rows:
            entry = self._make_dictionary_entry(entry_row)
            self._make_word_form(entry)
        print(self.control)



    def _make_dictionary_entry(self, input_row):
        _current_entry = {}
        he_regex = re.compile(r"[\u0591-\u05ff]+", re.UNICODE)
        parts = str(input_row.strip('\n$').strip(), 'utf-8').split('@')
        num_parts = len(parts)
        all_full = all(len(x) > 0 for x in parts[:-1])
        #print parts[0]
        num = int(re.search(r'\d+', parts[0].strip()).group())
        if num in self.control:
            self.control.remove(num)
        if num_parts == 7:
            _current_entry['parent_lexicon'] = 'Rashi Foreign Lexicon'
            _current_entry['catane_number'] = parts[0].strip()
            _current_entry['orig_ref'] = Ref(parts[1]).normal()
            _current_entry['orig_word'] = parts[2].strip()
            _current_entry['headword'] = parts[3].strip()
            if he_regex.search(parts[4]):
                if he_regex.search(parts[5]): #if the latin transliteation is not here... it's probably in the right place, but contains a bit of hebrew
                    pass
                    #print "{} seems to have eng in wrong place: {}".format(parts[0].encode('utf-8'), parts[5].encode('utf-8'))
                else:
                    swap = parts[4]
                    parts[4] = parts[5]
                    parts[5] = swap
            _current_entry['transliteration'] = parts[4].strip()
            _current_entry['content'] = {
                'definition' : parts[5].strip(),
                'notes' : parts[6].strip()
            }
            rde = RashiDictionaryEntry(_current_entry)
            rde.save()
            return rde
        """elif num_parts < 7:
            print "{} seems to have to few parts".format(parts[0].encode('utf-8'))
        elif num_parts > 7:
            print "{} seems to have to many parts".format(parts[0].encode('utf-8'))
        elif not all_full:
            print "{} seems to have a component missing".format(parts[0].encode('utf-8'))"""

    def _make_word_form(self, entry):
        lookup = {
                    'headword' : entry.headword,
                    'parent_lexicon' : entry.parent_lexicon,
                    'catane_number'  : entry.catane_number
        }
        wf = WordForm().load({'form': entry.headword})

        if wf:
            wf.lookups.append(lookup)
            wf.refs.append(entry.orig_ref)
        else:
            wf = WordForm({
                'form': entry.headword,
                'lookups' : [
                    lookup
                ],
                'refs':[entry.orig_ref]
            })
        wf.save()






""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    print("INIT LEXICON")
    #os.chdir(os.path.dirname(sys.argv[0]))
    parser = argparse.ArgumentParser()
    args = parser.parse_args()
    print("parse lexicon")
    parser = LaazRashiParser()
    parser.parse_contents()


