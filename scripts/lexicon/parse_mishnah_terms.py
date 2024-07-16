# -*- coding: utf-8 -*-
from sefaria.model import *
from sefaria.utils.tibetan import has_tibetan

import csv


def create_word_form(form, lang, lookup):
    wf = WordForm().load({'form' : form, 'lookups': lookup})
    if not wf:
        try:
            wf = WordForm().load({'form' : form})
            wf.lookups += lookup
        except Exception as e:
            wf = WordForm({'form': form, 'language_code': lang, 'lookups': lookup})
        wf.save()



def extract_form_tuples(csv_row):
    forms = [(csv_row[0].strip(), 'eng'), (csv_row[1].strip(), 'heb')]
    forms += [(x.strip(), 'eng') for x in csv_row[2].split(",") if len(x)]
    forms += [(x.strip(), 'heb') for x in csv_row[3].split(",") if len(x)]
    forms += [(x.strip(), 'heb' if has_tibetan(x) else 'eng') for x in csv_row[4].split(",") if len(x)]
    return forms




with open('/var/tmp/HTS3.csv', 'rb') as csvfile:
        lexicon_name = 'Halachic Terminology'
        existing_entries = []
        hts_lexicon = Lexicon().load({'name': lexicon_name})
        if not hts_lexicon:
            hts_lexicon = Lexicon({'name': lexicon_name, 'language': 'heb.mishnaic', 'to_language': 'eng' })
            hts_lexicon.save()
        lex_csv = csv.reader(csvfile, delimiter='\t')
        next(lex_csv, None)
        for entry in lex_csv:
            dict_entry ={
                'headword': entry[1].strip(),
                'parent_lexicon': lexicon_name,
                'content' : {'definition': entry[5].strip()}
            }
            hts_entry = LexiconEntry().load({'headword': dict_entry['headword'], 'parent_lexicon': lexicon_name})
            if hts_entry: # override existing
                hts_entry.content = dict_entry['content']
                existing_entries.append(dict_entry['headword'])
            else:
                hts_entry = LexiconEntry(dict_entry)
            hts_entry.save()
            forms = extract_form_tuples(entry)
            for form in forms:
                if form[0] and form[0] != '':
                    print(str(form[0].strip(), 'utf-8').encode('utf-8'))
                    create_word_form(form[0], form[1], [{'headword':entry[1], 'parent_lexicon': lexicon_name}])

        print("Updated Entries:")
        for i,e in enumerate(existing_entries):
            print(e)





