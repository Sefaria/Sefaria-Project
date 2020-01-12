# -*- coding: utf-8 -*-

import argparse
import sys
import json
import csv
import re
import os, errno
import os.path
import requests
try:
    import xml.etree.cElementTree as ET
except ImportError:
    import xml.etree.ElementTree as ET

from sefaria.model import *

class WLCStrongParser(object):
    data_dir = 'data/tmp/hebmorphwlc'
    raw_github_url = 'https://raw.githubusercontent.com/openscriptures/morphhb/master/'


    hebmorph_shorthands = {
        'Genesis' : 'Gen',
        'Exodus' : 'Exod',
        'Leviticus' : 'Lev',
        'Numbers' : 'Num',
        'Deuteronomy' : 'Deut',
        'Joshua' : 'Josh',
        'Judges' : 'Judg',
        'I Samuel' : '1Sam',
        'II Samuel' : '2Sam',
        'I Kings' : '1Kgs',
        'II Kings': '2Kgs',
        'Isaiah' : 'Isa',
        'Jeremiah': 'Jer',
        'Ezekiel' : 'Ezek',
        'Hosea' : 'Hos',
        'Joel' : 'Joel',
        'Amos': 'Amos',
        'Obadiah' : 'Obad',
        'Jonah' : 'Jonah',
        'Micah' : 'Mic',
        'Nahum' : 'Nah',
        'Habakkuk' : 'Hab',
        'Zephaniah' : 'Zeph',
        'Haggai' : 'Hag',
        'Zechariah': 'Zech',
        'Malachi' : 'Mal',
        'Psalms' : 'Ps',
        'Proverbs' : 'Prov',
        'Job': 'Job',
        'Song of Songs' : 'Song',
        'Ruth' : 'Ruth',
        'Lamentations' : 'Lam',
        'Ecclesiastes': 'Eccl',
        'Esther': 'Esth',
        'Daniel' : 'Dan',
        'Ezra': 'Ezra',
        'Nehemiah' : 'Neh',
        'I Chronicles' : '1Chr',
        'II Chronicles' : '2Chr'
    }

    def __init__(self, compare_to_csv=False):
        self._mkdir_p(self.data_dir)
        self.compare_mode = compare_to_csv
        if self.compare_mode:
            self.word_list = self.build_word_csv_dict()


    def build_word_csv_dict(self):
        word_list = {}
        csv_list = self.get_morphhb_file('Words.csv', 'WlcWordList')
        with open(csv_list, 'rb') as infile:
            input_csv = csv.reader(infile, delimiter=',')
            for row in input_csv:
                word = row[1]
                s_num = row[0]
                if word in word_list:
                    if s_num == word_list[word]['strong_n']:
                        word_list[word]['list_occur'] +=1
                    else:
                        raise Exception('double word {} but not same numbers'.format(word.encode('utf-8')))
                else:
                    word_list[word] = {'strong_n': s_num, 'list_occur': 1, 'found_in_wlc': False, 'found_word_form': False}
        return word_list

    def write_word_csv_dict(self):
         with open(os.path.join(self.data_dir, "Words-Comparison.csv"), 'wb+')  as outfile:
            result_csv = csv.writer(outfile, delimiter=',')
            result_csv.writerow(['word', 'strong number', 'times in orig list', 'found in wlc', 'found form in db'])
            for result in sorted(self.word_list):
                result_csv.writerow([result,
                                     self.word_list[result]['strong_n'],
                                     self.word_list[result]['list_occur'],
                                     self.word_list[result]['found_in_wlc'],
                                     self.word_list[result]['found_word_form']])



    def parse_forms_in_books(self):
        for book in self.hebmorph_shorthands:
            print(book)
            word_form_book_parser = WLCStrongWordFormBookParser(self, book)
            word_form_book_parser.iterate_over_text(self.compare_mode)
        if self.compare_mode:
            self.write_word_csv_dict()

    def _mkdir_p(self, path):
        try:
            os.makedirs(path)
        except OSError as exc: # Python >2.5
            if exc.errno == errno.EEXIST and os.path.isdir(path):
                pass
            else: raise

    def get_morphhb_file(self, filename, sub_dir='wlc'):
        full_file = os.path.join(self.data_dir, filename)
        if not os.path.isfile(full_file):
            fileurl = os.path.join(self.raw_github_url,sub_dir,filename)
            r = requests.get(fileurl)
            f = open(full_file,'w')
            f.write(r.content)
        return full_file


class WLCStrongWordFormBookParser(object):

    def __init__(self, parent_parser, book):
        self.parent_parser = parent_parser
        self.book = book
        self.xml_book_name = self.parent_parser.hebmorph_shorthands[self.book]
        self.namespace = {'strong': 'http://www.bibletechnologies.net/2003/OSIS/namespace'}
        self.strip_cantillation_vowel_regex = re.compile(r"[\u0591-\u05bd\u05bf-\u05c5\u05c7]", re.UNICODE)
        self.strip_cantillation_regex = re.compile(r"[\u0591-\u05af\u05bd\u05bf\u05c0\u05c4\u05c5]", re.UNICODE)
        self.strong_num_regex = re.compile(r"[0-9]+")
        xmlp = ET.parse(self.parent_parser.get_morphhb_file(self.xml_book_name + '.xml'))
        self.xml_contents = xmlp.getroot().find("strong:osisText/strong:div[@type='book']", self.namespace)


    def add_shorthand_as_title_variant_to_index(self):
        Index().load({'title': self.book}).nodes.add_title(self.xml_book_name, 'en')

    def iterate_over_text(self, compare_mode=False):
        for chap_num, chapter_node in enumerate(self.xml_contents.findall('strong:chapter', self.namespace),1):
            for v_num,verse_node in enumerate(chapter_node.findall('strong:verse', self.namespace),1):
                #print "verse ", v_num, ": ", verse_node.get('osisID').encode('utf-8')
                verse = verse_node.get('osisID')
                verse_ref = Ref(verse.replace('.', ' ').replace(self.xml_book_name, self.book)).normal()
                for w_num, word in enumerate(verse_node.findall('.//strong:w', self.namespace),1):

                    word_form_text = self._make_vowel_text(self._strip_wlc_morph_notation(word.text))
                    strong_number = self._extract_strong_number(word.get('lemma'))
                    if strong_number:
                        if compare_mode:
                            self.compare_word_forms(word_form_text, strong_number)
                        else:
                            self.parse_word_forms(word_form_text, strong_number, verse_ref)

    def parse_word_forms(self, word_form_text, strong_number, verse_ref):
        strong_entry = StrongsDictionaryEntry().load({'strong_number': strong_number})
        if strong_entry:
            #first look to see if we have an exact word form mapping already
            word_form_obj = WordForm().load({'form': word_form_text,
                                             'language_code' : strong_entry.language_code,
                                             'lookups': {
                                                 "headword" : strong_entry.headword,
                                                 "parent_lexicon" : "BDB Augmented Strong",
                                                 "strong_number" : strong_entry.strong_number
                                             }})
            if not word_form_obj: #else, look for just the form
                word_form_obj = WordForm().load({'form': word_form_text, 'language_code' : strong_entry.language_code})
                if word_form_obj:
                    word_form_obj.lookups.append({"headword" : strong_entry.headword,"lexicon" : "BDB Augmented Strong"})
                else: #create a whole new one
                    word_form_obj = WordForm({'form': word_form_text,
                                              'c_form' : self._make_consonantal_text(word_form_text),
                                              'language_code' : strong_entry.language_code,
                                              'lookups': [{
                                                    "headword" : strong_entry.headword,
                                                    "parent_lexicon" : "BDB Augmented Strong",
                                                    "strong_number" : strong_entry.strong_number
                                                }]}).save()
            word_form_obj.refs = word_form_obj.refs + [verse_ref] if hasattr(word_form_obj, 'refs') else [verse_ref]
            word_form_obj.save()


    def compare_word_forms(self, word_form_text, strong_number):
        word_form_obj = WordForm().load({'form': word_form_text})
        if word_form_obj:
             self.parent_parser.word_list[word_form_text]['found_word_form'] = True
        try:
            self.parent_parser.word_list[word_form_text]['found_in_wlc'] = True
        except Exception as e:
            pass





    def _extract_strong_number(self, strong_str):
        match = self.strong_num_regex.search(strong_str)
        if match:
            return match.group(0)
        else:
            return None

    def _strip_wlc_morph_notation(self, word_text):
        #strip the slash that denotes a morphological separator
        return re.sub(r"\u002f", "", word_text)

    def _make_consonantal_text(self, word_text):
        return self._make_derived_text(word_text, self.strip_cantillation_vowel_regex)

    def _make_vowel_text(self, word_text):
        return self._make_derived_text(word_text, self.strip_cantillation_regex)

    def _make_derived_text(self, word_text, regex):
        return regex.sub('', word_text).strip()

    def _add_shorthand_as_title_variant(self):
        pass


    def calculate_coverage_vs_csv(self):
        pass







class StrongHebrewGLexiconXMLParser(object):
    data_dir = 'data/tmp'
    filename = 'StrongHebrewG.xml'
    heb_stems = ["qal","niphal","piel","pual","hiphil","hophal","hithpael","polel","polal","hithpolel","poel","poal","palel","pulal","qal passive","pilpel","polpal","hithpalpel","nithpael","pealal","pilel","hothpaal","tiphil","hishtaphel","nithpalel","nithpoel","hithpoel"]
    arc_stems = ["P'al","peal","peil","hithpeel","pael","ithpaal","hithpaal","aphel","haphel","saphel","shaphel","hophal","ithpeel","hishtaphel","ishtaphel","hithaphel","polel","","ithpoel","hithpolel","hithpalpel","hephal","tiphel","poel","palpel","ithpalpel","ithpolel","ittaphal"]

    def __init__(self):
        self.heb_stem_regex = re.compile(r'^\(('+"|".join(self.heb_stems)+')\)', re.IGNORECASE)
        self.arc_stem_regex = re.compile(r'^\(('+"|".join(self.arc_stems)+')\)', re.IGNORECASE)
        self.dictionary_xml = ET.parse('%s/%s' % (self.data_dir, self.filename))
        self.namespace = {'strong': 'http://www.bibletechnologies.net/2003/OSIS/namespace', 'lang':'http://www.w3.org/XML/1998/namespace'}
        self.entries_xml = self.dictionary_xml.getroot().findall(".//*[@type='entry']", self.namespace)
        self.entries = []

    def parse_contents(self):
        print("BEGIN PARSING")
        self._make_lexicon_obj()
        for entry in self.entries_xml:
            le = self._make_dictionary_entry(entry)
            self.entries.append(le)
            StrongsDictionaryEntry(le).save()

    def _make_lexicon_obj(self):
        strongs = Lexicon({'name': 'BDB Augmented Strong', 'language': 'heb.biblical', 'to_language': 'eng' })
        strongs.save()


    def _make_dictionary_entry(self, entry):
        #get all div with type "Entry" and the n attr
        #get w lemma= + morph=
        #get strong's def and lexical notes from notes "exegesis" and "explanation"
        #get <list> items
        #parse each list item via its index into senses and definitions.
        self._current_entry = {}
        self._current_entry['parent_lexicon'] = 'BDB Augmented Strong'
        self._current_entry['strong_number'] = entry.get('n')
        headword_xml = entry.find('strong:w', self.namespace)
        self._current_entry['headword'] = headword_xml.get('lemma')
        self._current_entry['pronunciation'] = headword_xml.get('POS')
        self._current_entry['transliteration'] = headword_xml.get('xlit')
        self._current_entry['language_code'] = headword_xml.get('{http://www.w3.org/XML/1998/namespace}lang')
        defs = [x.text for x in entry.findall('strong:list/strong:item', self.namespace)]
        odefs = [self._parse_item_depth(x) for x in defs]
        self._current_entry['content'] = {}
        self._current_entry['content']['morphology'] = headword_xml.get('morph')
        self._current_entry['content']['senses'] = []
        self._make_senses_dict(odefs, self._current_entry['content']['senses'])
        return self._current_entry


    def _make_senses_dict(self, definitions, senses, depth=1):
        while True:
            try:
                defobj = definitions[0]
                text = defobj['value'].strip()
                def_depth = defobj['depth']

                if def_depth == depth:
                    senses.append(self._detect_stem_information_in_definition(text))
                    #senses.append({'definition': text})
                    definitions.pop(0)
                elif def_depth > depth:
                    current_senses = senses[-1]['senses'] = []
                    self._make_senses_dict(definitions, current_senses, def_depth)
                else:
                    return
            except IndexError:
                break

    def _parse_item_depth(self, def_item):
        depth_re = re.compile(r"^([^)]+?)\)", re.UNICODE)
        match = depth_re.search(def_item)
        depth = len(match.group())-1 if match else 1
        return {'depth': depth, 'value': depth_re.sub('', def_item,1).strip()}

    def _detect_stem_information_in_definition(self, def_item):
        heb_stem = self.heb_stem_regex.search(def_item)
        if heb_stem:
            return self._assemble_sense_def(heb_stem.group(1), self.heb_stem_regex.sub('',def_item))
        arc_stem = self.arc_stem_regex.search(def_item)
        if arc_stem:
            return self._assemble_sense_def(arc_stem.group(1), self.arc_stem_regex.sub('',def_item))
        return {'definition': def_item}

            #{'definition': text}

    def _assemble_sense_def(self, stem, defn):
        res = {'grammar': {'verbal_stem': stem}}
        if len(defn):
            res['definition'] = defn
        return res







""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    print("INIT LEXICON")
    #os.chdir(os.path.dirname(sys.argv[0]))
    parser = argparse.ArgumentParser()
    parser.add_argument("-l", "--lexicon", help="Parse lexicon",
                    action="store_true")
    parser.add_argument("-w", "--wordform", help="Parse word forms",
                    action="store_true")
    args = parser.parse_args()


    if args.lexicon:
        print("parse lexicon")
        strongparser = StrongHebrewGLexiconXMLParser()
        strongparser.parse_contents()
    if args.wordform:
        print('parsing word forms from wlc')
        wordformparser = WLCStrongParser()
        wordformparser.parse_forms_in_books()

