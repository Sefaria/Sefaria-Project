# -*- coding: utf-8 -*-

import argparse
import sys
import json
import re
import os, errno
import os.path
try:
    import xml.etree.cElementTree as ET
except ImportError:
    import xml.etree.ElementTree as ET

from sefaria.model import *


class StrongHebrewGLexiconXMLParser(object):
    data_dir = '../data/tmp'
    filename = 'StrongHebrewG.xml'
    heb_stems = ["qal","niphal","piel","pual","hiphil","hophal","hithpael","polel","polal","hithpolel","poel","poal","palel","pulal","qal passive","pilpel","polpal","hithpalpel","nithpael","pealal","pilel","hothpaal","tiphil","hishtaphel","nithpalel","nithpoel","hithpoel"]
    arc_stems = ["P'al","peal","peil","hithpeel","pael","ithpaal","hithpaal","aphel","haphel","saphel","shaphel","hophal","ithpeel","hishtaphel","ishtaphel","hithaphel","polel","","ithpoel","hithpolel","hithpalpel","hephal","tiphel","poel","palpel","ithpalpel","ithpolel","ittaphal"]

    def __init__(self):
        self.heb_stem_regex = re.compile(ur'^\(('+"|".join(self.heb_stems)+')\)', re.IGNORECASE)
        self.arc_stem_regex = re.compile(ur'^\(('+"|".join(self.arc_stems)+')\)', re.IGNORECASE)
        self.dictionary_xml = ET.parse('%s/%s' % (self.data_dir, self.filename))
        self.namespace = {'strong': 'http://www.bibletechnologies.net/2003/OSIS/namespace', 'lang':'http://www.w3.org/XML/1998/namespace'}
        self.entries_xml = self.dictionary_xml.getroot().findall(".//*[@type='entry']", self.namespace)
        self.entries = []
        print self.namespace

    def parse_contents(self):
        #print len(self.entries_xml)
        for entry in self.entries_xml:
            le = self._make_dictionary_entry(entry)
            self.entries.append(le)
            StrongsDictionaryEntry(le).save()


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
        self._current_entry['morphology'] = headword_xml.get('morph')
        self._current_entry['pronunciation'] = headword_xml.get('POS')
        self._current_entry['transliteration'] = headword_xml.get('xlit')
        self._current_entry['language-code'] = headword_xml.get('{http://www.w3.org/XML/1998/namespace}lang')
        defs = [x.text for x in entry.findall('strong:list/strong:item', self.namespace)]
        odefs = [self._parse_item_depth(x) for x in defs]
        self._current_entry['content'] = {}
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
        depth_re = re.compile(ur"^([^)]+?)\)", re.UNICODE)
        match = depth_re.search(def_item)
        depth = len(match.group())-1 if match else 1
        return {'depth': depth, 'value': depth_re.sub('', def_item,1).strip()}

    def _detect_stem_information_in_definition(self, def_item):
        heb_stem = self.heb_stem_regex.search(def_item)
        if heb_stem:
            return self.assemble_sense_def(heb_stem.group(1), self.heb_stem_regex.sub('',def_item))
        arc_stem = self.arc_stem_regex.search(def_item)
        if arc_stem:
            return self.assemble_sense_def(arc_stem.group(1), self.arc_stem_regex.sub('',def_item))
        return {'definition': def_item}

            #{'definition': text}

    def assemble_sense_def(self, stem, defn):
        res = {'grammar': {'verbal_stem': stem}}
        if len(defn):
            res['definition'] = defn
        return res







""" The main function, runs when called from the CLI"""
if __name__ == '__main__':
    print "INIT LEXICON"
    #parser = argparse.ArgumentParser()
    #parser.add_argument("title", help="title of existing index record")
    #parser.add_argument("schema_file", help="path to json schema file")
    #parser.add_argument("mapping_file", help="title of existing index record")
    #args = parser.parse_args()
    strongparser = StrongHebrewGLexiconXMLParser()
    print "parse lexicon"
    strongparser.parse_contents()

