# -*- coding: utf-8 -*-
from sefaria.model import *

import csv

def create_word_form(form, lang, lookups):
    return WordForm({'form': form, 'lang': lang, 'lookups': lookups})


with open('data/tmp/Halachic Terminology Berachot.tsv', 'rb') as csvfile:
        lexicon_name = 'Halachic Terminology'
        mishna_eng = Lexicon({'name': lexicon_name, 'language': 'heb.mishnaic', 'to_language': 'eng' })
        mishna_eng.save()
        lex_csv = csv.reader(csvfile, delimiter='\t')
        next(lex_csv, None)
        for entry in lex_csv:
            dict_entry ={
                'headword': entry[1].strip(),
                'parent_lexicon': lexicon_name,
                'content' : {'definition': entry[5].strip()}
            }
            LexiconEntry(dict_entry).save()
            forms = [(entry[0], 'eng'), (entry[1], 'heb')]
            forms += [(x, 'eng') for x in entry[2].split(",")]
            forms += [(x, 'heb') for x in entry[3].split(",")]
            for form in forms:
                if form[0] and form[0] != '':
                    print unicode(form[0].strip(), 'utf-8').encode('utf-8')
                    create_word_form(form[0], form[1], [{'headword':entry[1], 'lexicon': lexicon_name }]).save()





