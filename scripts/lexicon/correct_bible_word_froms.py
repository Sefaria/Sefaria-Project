# -*- coding: utf-8 -*-
import django
django.setup()


import re
import os, errno
import os.path
import requests
import unicodedata
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

    def __init__(self):
        self._mkdir_p(self.data_dir)


    def parse_forms_in_books(self):
        for book in self.hebmorph_shorthands:
            print(book)
            word_form_book_parser = WLCStrongWordFormBookParser(self, book)
            word_form_book_parser.iterate_over_text()

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
            f = open(full_file,'wb')
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
        self.strong_num_regex = re.compile(r"([0-9]+)[+]?$")
        xmlp = ET.parse(self.parent_parser.get_morphhb_file(self.xml_book_name + '.xml'))
        self.xml_contents = xmlp.getroot().find("strong:osisText/strong:div[@type='book']", self.namespace)



    def iterate_over_text(self):
        for chap_num, chapter_node in enumerate(self.xml_contents.findall('strong:chapter', self.namespace),1):
            for v_num,verse_node in enumerate(chapter_node.findall('strong:verse', self.namespace),1):
                #print "verse ", v_num, ": ", verse_node.get('osisID').encode('utf-8')
                verse = verse_node.get('osisID')
                verse_ref = Ref(verse.replace('.', ' ').replace(self.xml_book_name, self.book)).normal()
                verse_elems = verse_node.findall('.//', self.namespace)
                word_iter = [v for v in verse_elems if self.get_prefixless_tagname(v) == "w" or (self.get_prefixless_tagname(v) == "seg" and v.get("type") == "x-maqqef")]
                word_iter = iter(word_iter)
                done_looping = False
                while not done_looping:
                    try:
                        word = next(word_iter)
                    except StopIteration:
                        done_looping = True
                    else:
                        if self.get_prefixless_tagname(word) == "w" and "+" in word.get('lemma'):
                            word2 = next(word_iter)
                            if self.get_prefixless_tagname(word2) == "seg" and word2.get("type") == "x-maqqef" and word2.text == "־":
                                delim = "־"
                                word2 = next(word_iter)
                            else:
                                delim = " "
                            self.reevaluate_word_form(word, word2, verse_ref, delim)


    def get_prefixless_tagname(self, element):
        return element.tag.replace("{{{}}}".format(self.namespace["strong"]),"")


    def reevaluate_word_form(self, word1, word2, ref, delim=" "):
        strong_number1 = self._extract_strong_number(word1.get("lemma"))
        strong_number2 = self._extract_strong_number(word2.get("lemma"))
        if strong_number1 != strong_number2:
            print("{} {} strong #s didnt match {} {}".format(word1, word2, strong_number1, strong_number2))
            return
        word_form_text1 = unicodedata.normalize("NFC", self._make_vowel_text(self._strip_wlc_morph_notation(word1.text)))
        word_form_text2 = unicodedata.normalize("NFC", self._make_vowel_text(self._strip_wlc_morph_notation(word2.text)))
        combined_form = "{}{}{}".format(word_form_text1, delim, word_form_text2)
        strong_entry = StrongsDictionaryEntry().load({'strong_number': strong_number2})
        self.parse_combined_word_forms(combined_form, strong_entry, ref)
        if delim != " ":
            # add the word form with a space between words also, for easier manual lookup
            combined_form2 = "{} {}".format(word_form_text1, word_form_text2)
            self.parse_combined_word_forms(combined_form2, strong_entry, ref)
        self.delete_old_word_form_mappings(strong_entry, word_form_text1, word_form_text2, ref)


    def parse_combined_word_forms(self, word_form_text, strong_entry, verse_ref):
        if strong_entry:
            #first look to see if we have an exact word form mapping already
            print
            print("REF {} ) Fixing word form {} to point to headword {}({})".format(verse_ref, word_form_text, strong_entry.headword, strong_entry.strong_number))
            word_form_obj = WordForm().load({'form': word_form_text,
                                             'lookups': { '$elemMatch': {"headword": strong_entry.headword, "strong_number": strong_entry.strong_number}}
                                             })
            if word_form_obj:
                word_form_obj.refs = word_form_obj.refs + [verse_ref] if hasattr(word_form_obj, 'refs') else [verse_ref]
                print(" - Only adding ref")
                word_form_obj.save()
            else: #create a whole new one
                print(" - Creating word form")
                word_form_obj = WordForm({'form': word_form_text,
                                            'c_form': self._make_consonantal_text(word_form_text),
                                            'language_code': strong_entry.language_code,
                                            'refs': [verse_ref],
                                            'lookups': [{
                                                    "headword" : strong_entry.headword,
                                                    "parent_lexicon" : "BDB Augmented Strong",
                                                    "strong_number" : strong_entry.strong_number
                                            }]
                                          }).save()

    def delete_old_word_form_mappings(self, strong_entry, old1, old2, verse_ref):
        # get word forms for each word, delete the headword that matches the strong number headword (essentially the combined form)
        # then delete the refs that match this ref in the ref list
        wfset = WordFormSet({'form': {'$in': [old1, old2]}})
        for wf in wfset:
            old_len = len(wf.lookups)
            wf.lookups = [lk for lk in wf.lookups if not (lk["headword"] == strong_entry.headword and lk["parent_lexicon"] == "BDB Augmented Strong")]
            new_len = len(wf.lookups)
            if old_len > new_len:
                print(" -Deleted lookup {}({}) from wordform {}".format(strong_entry.headword, strong_entry.strong_number, wf.form))
            if new_len < 1:
                print(" -No lookups left, Deleted wordform {} completely".format(wf.form))
                wf.delete()
                continue
            try:
                old_refs_len = len(wf.refs)
                wf.refs = [r for r in wf.refs if r != verse_ref]
                new_refs_len = len(wf.refs)
                if old_refs_len > new_refs_len:
                    print(" -Deleted ref from wordfrom {}".format(wf.form))
            except AttributeError:
                print(" -No refs")
            wf.save()



    def _extract_strong_number(self, strong_str):
        match = self.strong_num_regex.search(strong_str)
        if match:
            return match.group(1)
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
















""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    print("INIT LEXICON")
    #os.chdir(os.path.dirname(sys.argv[0]))
    wordformparser = WLCStrongParser()
    wordformparser.parse_forms_in_books()

