"""
Goal is to sample segments from our library and find places where we aren't matching citations
"""
import csv
import django
django.setup()

from sefaria.model import *
import random
from tqdm import tqdm
import sys
csv.field_size_limit(sys.maxsize)


def sample_segments():
    all_segment_refs = []

    def action(s, en_tref, he_tref, v):
        nonlocal all_segment_refs
        all_segment_refs.append({
            "Ref": en_tref,
            "VTitle": v.versionTitle,
            "Language": v.language,
            "Text": s,
        })
    for version in tqdm(VersionSet({}).array()):
        try:
            version.walk_thru_contents(action)
        except Exception as e:
            print("Skip", version.title, version.versionTitle)

    rows = random.sample(all_segment_refs, 100000)

    with open('../../data/private/all_segment_refs.csv', 'w') as fout:
        cout = csv.DictWriter(fout, fieldnames=rows[0].keys())
        cout.writeheader()
        cout.writerows(rows)


def batch_link(curr_linker, inputs, batch_size):
    all_docs = []
    for i in tqdm(list(range(0, len(inputs), batch_size))):
        curr_inputs = inputs[i:i+batch_size]
        curr_docs = curr_linker.bulk_link(curr_inputs, with_failures=True, type_filter='citation')
        all_docs += curr_docs
    return all_docs


def find_failed_resolutions():
    linker_map = {
        'en': library.get_linker('en'),
        'he': library.get_linker('he'),
    }
    inputs_by_lang = {'en': [], 'he': []}
    rows_by_lang = {'en': [], 'he': []}

    with open('../../data/private/all_segment_refs.csv', 'r') as fin:
        cin = csv.DictReader(fin)
        rows = list(cin)
    for row in rows:
        if row['Language'] == 'en':
            inputs_by_lang['en'].append(row['Text'])
            rows_by_lang['en'].append(row)
        else:
            inputs_by_lang['he'].append(row['Text'])
            rows_by_lang['he'].append(row)
    for lang in ('he',):
        out_rows = []
        docs = batch_link(linker_map[lang], inputs_by_lang[lang], 2000)
        for doc, row in zip(docs, rows_by_lang[lang]):
            for ref in doc.resolved_refs:
                if ref.resolution_failed:
                    ent = ref.raw_entity
                    start, end = ent.span.range
                    context = row['Text'][max(0, start - 20):end + 20]
                    out_rows.append({
                        'Ref': row['Ref'],
                        'VTitle': row['VTitle'],
                        'Language': row['Language'],
                        'Context': context,
                        'Resolution': ref.pretty_text,
                    })
        with open(f'../../data/private/failed_resolutions_{lang}.csv', 'w') as fout:
            cout = csv.DictWriter(fout, fieldnames=out_rows[0].keys())
            cout.writeheader()
            cout.writerows(out_rows)


if __name__ == '__main__':
    # sample_segments()
    find_failed_resolutions()
