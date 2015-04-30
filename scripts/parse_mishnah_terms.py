# -*- coding: utf-8 -*-
from sefaria.model import *

import csv

def create_word_form(form, lookups):
    return WordForm({'form': form, 'lookups': lookups})


with open('data/tmp/Halachic Terminology Berachot.tsv', 'rb') as csvfile:
        lexicon_name = 'Halachic Terminology'
        mishna_eng = Lexicon({'name': lexicon_name })
        mishna_eng.save()
        lex_csv = csv.reader(csvfile, delimiter='\t')
        next(lex_csv, None)
        for entry in lex_csv:
            dict_entry ={
                'headword': entry[1].strip(),
                'parent_lexicon': lexicon_name,
                'content' : entry[5].strip()
            }
            LexiconEntry(dict_entry).save()
            forms = [entry[0], entry[1]]
            forms += entry[2].split(",")
            forms += entry[3].split(",")
            for form in forms:
                if form and form != '':
                    print unicode(form.strip(), 'utf-8').encode('utf-8')
                    create_word_form(form, [{'headword':entry[1], 'lexicon': lexicon_name }]).save()





