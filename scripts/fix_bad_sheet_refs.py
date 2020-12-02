# encoding=utf-8

import os
import re
import sys
import sqlite3
import django
django.setup()
from sefaria.model import *
from sefaria.system.database import db


class ConversionError(Exception):
    pass


def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d


DB_PATH = os.environ.get('DB_PATH')
if not DB_PATH:
    print('path to data must be set to the environment variable DB_PATH')
    sys.exit(1)


CONN = sqlite3.connect(DB_PATH)
CONN.row_factory = dict_factory


def collect_entries(search_pattern):
    cursor = CONN.execute('SELECT Bad_Ref FROM bad_sheet_refs')
    return [entry['Bad_Ref'] for entry in cursor if re.search(search_pattern, entry['Bad_Ref'])]


def create_category_grabber(cat):
    indices = library.get_indexes_in_category(cat, full_records=True).array()
    indices.sort(key=lambda x: x.get_toc_index_order() if x.get_toc_index_order() else 10000)

    def grabber(ind, zero_indexed=True):
        if ind >= len(indices):
            raise ConversionError
        if zero_indexed:
            return indices[ind].title
        else:
            return indices[ind-1].title

    return grabber


talmud_tractate_getter = create_category_grabber('Bavli')


def ein_yaakov(source: str) -> str:
    pattern = r'^(?P<start>Ein Yaakov(?: \(Glick Edition\))?)\s(?P<key>[0-9]{1,2}):?(?P<end>[^:].*$)'
    match = re.match(pattern, source)
    if not match:
        return source
    try:
        tractate = talmud_tractate_getter(int(match.group('key')), False)
    except ConversionError:
        return source
    fixed = f'{match.group("start")}, {tractate} {match.group("end")}'
    return fixed


def tur(source: str) -> str:
    conversion = {
        1: 'Orach Chaim',
        2: "Yoreh Deah",
        3: 'Even HaEzer',
        4: 'Choshen Mishpat',
    }
    pattern = r'^Arbaah Turim (?P<key>[1-4]):?(?P<end>[^:].*$)'
    match = re.match(pattern, source)
    if not match:
        return source

    key = int(match.group('key'))
    return f'Tur, {conversion[key]} {match.group("end")}'


def ner_mitzvah(source: str) -> str:
    return source


def magen_avraham(source: str) -> str:
    return re.sub(r'\s[0-9]+:', ' ', source)


def shulchan(source: str) -> str:
    conversion = {
        1: 'Orach Chayim',
        2: "Yoreh De'ah",
        3: 'Even HaEzer',
        4: 'Choshen Mishpat',
    }
    pattern = r'^Shulchan Aruch (?P<key>[1-4]):?(?P<end>[^:].*$)'
    match = re.match(pattern, source)
    if not match:
        return source

    key = int(match.group('key'))
    return f'Shulchan Arukh, {conversion[key]} {match.group("end")}'


def guide(source: str) -> str:
    return re.sub(r'\s([0-3]):', r', Part \g<1> ', source)


def ohr_chadash(source: str) -> str:
    return source


def redeeming(source: str) -> str:
    converter = {
        'Genesis': 'Genesis',
        'Exodus': 'Exodus',
        'Bamidbar': 'Numbers',
    }
    return re.sub(
        r'Redeeming Relevance, (?P<book>[a-zA-Z]+) Chapter (?P<section>[0-9]+) (?P<end>.*)',
        lambda x: f'Redeeming Relevance; {converter[x.group("book")]} {x.group("section")}:{x.group("end")}',
        source
    )


def contemporary_problems(source: str) -> str:
    roman = {
        '1': 'I',
        '2': 'II',
        '3': 'III',
        '4': 'IV',
        '5': 'V'
    }
    return re.sub(
        r'^Contemporary Halakhic Problems, Vol ([1-5])',
        lambda x: f'Contemporary Halakhic Problems, Vol {roman[x.group(1)]}',
        source
    )


def get_book_name(source) -> str:
    match = re.match(r'^[^0-9]+', source)
    if not match:
        return source
    return match.group().rstrip()


METHOD_MAPPING = {
    'ein_yaakov': ein_yaakov,
    'tur': tur,
    'ner': ner_mitzvah,
    'avraham': magen_avraham,
    'ohr': ohr_chadash,
    'redeem': redeeming,
    'shulchan': shulchan,
    'guide': guide,
    'problems': contemporary_problems,
}

cursor = CONN.execute('SELECT s.Bad_Ref, r.Book_Name FROM bad_sheet_refs s JOIN "Bad Ref Titles" r WHERE s.Book==r.Book_No')
for i, r in enumerate(cursor):
    print(r['Bad_Ref'], ' -> ', r['Book_Name'])
    if i == 100:
        break


def write_replacements():
    rows = CONN.execute(
        'SELECT refs.id, refs.Bad_Ref, titles.Action, titles.Simple, titles.Book_Name FROM bad_sheet_refs refs '
        'JOIN "Bad Ref Titles" titles WHERE refs.Book==titles.Book_No'
    )

    replacement = ''
    CONN.execute('BEGIN TRANSACTION')
    for i, row in enumerate(rows):
        if i % 100 == 0:
            print(i)
        action = row['Action']
        if action == 'skip':
            continue
        elif action == 'simple':
            replacement = row['Bad_Ref'].replace(row['Book_Name'], row['Simple'])
        elif 'method' in action:
            method_key = action.split()[1]
            method = METHOD_MAPPING[method_key]
            replacement = method(row['Bad_Ref'])
        if Ref.is_ref(replacement):
            CONN.execute('UPDATE bad_sheet_refs SET Replacement=? WHERE id=?', (replacement, row['id']))
    CONN.commit()


def make_changes_to_sheet(sheet_id, original, replacement):
    success = False
    sheet_json = db.sheets.find_one({'id': sheet_id})
    if not sheet_json:
        print(f'No sheet found for sheet id: {sheet_id}')
        return
    for source in sheet_json.get('sources', []):
        if source.get('ref', '') == original:
            source['ref'] = replacement
            success = True
    if success:
        print(f'{original} changed to {replacement}')
        db.sheets.find_one_and_replace({'id': sheet_id}, sheet_json)
    else:
        print(f'{original} not found in sheet')


cursor = CONN.execute('SELECT Bad_Ref, Replacement, Sheet FROM bad_sheet_refs WHERE Replacement is not null ')
for i, row in enumerate(cursor):
    print(i)
    make_changes_to_sheet(row['Sheet'], row['Bad_Ref'], row['Replacement'])

# for i in collect_entries(r'^Contemporary Halakhic Problems'):
#     corrected = contemporary_problems(i)
#     print(i, '    ', corrected, '    ', Ref.is_ref(corrected))

# curs = CONN.execute('SELECT Book_No, Book_Name FROM "Bad Ref Titles"')
# book_titles = {r['Book_Name']: r['Book_No'] for r in curs}
# curs = CONN.execute('SELECT id, Bad_Ref FROM bad_sheet_refs')
# source_to_book, bad_books = {}, set()
# for row in curs:
#     book_title = get_book_name(row['Bad_Ref'])
#     if book_title not in book_titles:
#         bad_books.add(book_title)
#     else:
#         book_no = book_titles[book_title]
#         source_to_book[row['id']] = book_no
#
# for b in bad_books:
#     print(b)
# print(len(bad_books))
# for i, source_id in enumerate(source_to_book.keys()):
#     print(f'{source_id} -> {source_to_book[source_id]}')
#     if i == 30:
#         break

# for source_id, book_id in source_to_book.items():
#     CONN.execute('UPDATE bad_sheet_refs SET Book=? WHERE id=?', (book_id, source_id))
# CONN.commit()

