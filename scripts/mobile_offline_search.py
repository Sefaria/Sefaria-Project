# -*- coding: utf-8 -*-
#!/usr/bin/python2.6
from sefaria.model import library
from sefaria.model import Ref

from sefaria.model.text import TextChunk
from sefaria.model.text import TextChunk
from pprint import pprint
import json
from collections import defaultdict
from datetime import datetime as dt
import re
import sys
import sqlite3
import os
import array
import time
import math

LANGS = ('en', 'he')
#LANGS = ('en',)

def main():
    global DESCRIPTION
    ALL = 10000
    start = 0
    end = ALL
    DESCRIPTION = '{}-{}'.format(start, end)

    ####### parse lib words #########
    #parse_lib_to_json(start, end)

    ####### get ref_strs from json files ########
    #test_get_from_json()

    ####### put into db >>>>>>>>>
    jsons_to_db()
    #

    ####### get ref_strs from DB >>>>>>>>>>>

WORDS_2_REF_NUMS = 'words_2_ref_nums'
REF_NUM_MIN_N_TITLE = 'ref_num_min_N_title'
REF_NUM_2_PART = 'ref_num_2_part'
_ONLY_WORDS_LIST = 'only_words_list'


def save_read_filename(name, ext='json'):
    return '../ios_search/dumps/{}.{}.{}.{}'.format(DESCRIPTION, name, '_'.join(LANGS), ext)

def save(name, data):
    with open(save_read_filename(name), 'w') as f:
        json.dump(data, f)

def read(name):
    with open(save_read_filename(name), 'r') as f:
        return json.load(f)

def parse_lib_to_json(start, end):
    print('parse_lib', start, end)
    ref_num_min_N_title = []
    ref_num = 0 # absolute index num for all refs
    ref_num_2_full_name = []
    ref_num_2_part = []
    indexes  = library.all_index_records()
    words_2_ref_nums = defaultdict(set)


    indexes = indexes[start:end]
    print(len(indexes))
    last_time = time.time()
    for i, index in enumerate(indexes):
        title = index.title
        print(i, str(dt.now().time()), index.title, time.time() - last_time)
        last_time = time.time()
        sys.stdout.flush()

        ref_num_min_N_title.append((ref_num, title,))

        section_refs = index.all_section_refs()
        for section_ref in section_refs:
            try:
                #ref_part = section_ref.normal_last_section()
                ref_part = section_ref.normal().replace(title + ' ', '') # TODO: need std way of doing this
                ref_num_2_full_name.append(section_ref.normal())
                try:
                    ref_part = int(ref_part)
                except ValueError as e:
                    pass # we'll just use the str
                ref_num_2_part.append(ref_part)
                #print(title, ref_name, section_ref.normal())
                r = section_ref
                add_words(r, words_2_ref_nums, ref_num)
                ref_num += 1
            except Exception as e:
                print('ERROR', e)

            #print(section_ref.all_subrefs()[:3])
            #print(section_ref, dir(section_ref))
            #print(section_ref.all_subrefs()) #subrefs are prob too small
        #print(section_ref.text("he").text)


    print('saving to json...')
    save(REF_NUM_MIN_N_TITLE, ref_num_min_N_title)
    save(REF_NUM_2_PART, ref_num_2_part)

    # convert sets to lists for json
    words_2_ref_nums = {key: list(value) for key, value in words_2_ref_nums.iteritems()}
    save(WORDS_2_REF_NUMS, words_2_ref_nums)
    save(_ONLY_WORDS_LIST, words_2_ref_nums.keys())


def add_words(ref, words_2_ref_nums, index_num):
    for lang in LANGS:
        text = ref.text(lang).text
        text_str = ' '.join(text)
        words = get_words(text_str)
        for word in words:
            words_2_ref_nums[word].add(index_num)

def get_words(text):
    #print(text)

    text = TextChunk.remove_html(text)
    text = re.sub(ur'[\u05be\s+\\.\\-]', ' ', text) # convert dashs/dots/etc to space
    #text = re.sub(ur'[\u0591-\u05C7\u05f3\u05f4]', '', text)
    #text = re.sub(ur'[\u0591-\u05c7]', '', text)

    text = re.sub(ur'([^\u05d0-\u05eaA-Za-z\s])', '', text) # remove non-regular chars
    text = text.lower()
    # bf_text = text
    text = text.replace(u' \u05d5', ' ')

    words = text.split(' ')
    words = set(words) - set([''])
    # print('diff')
    # print(' '.join(words - set(bf_text.split(' '))))
    # print(' '.join(set(bf_text.split(' ')) - words))
    # TODO: prophetbecause: 212321 ... obvious this word is messed up. we need to make a word splitter better
    # TODO: maybe remove single letter words
    #print(' '.join(words))
    return words


### DB storing

def jsons_to_db():
    try:
        conn = get_connection()

        table_name = REF_NUM_2_PART
        store_str_list(conn, read(table_name), table_name)

        data = convert_to_josh_packets(read(WORDS_2_REF_NUMS))
        store(conn, data, WORDS_2_REF_NUMS)

        table_name = REF_NUM_MIN_N_TITLE
        store_tup_list(conn, read(table_name), table_name)

    finally:
        conn.close()

def get_connection():
    """ create a database connection to a SQLite database """
    db_file = save_read_filename('sqlite', 'db')
    try:
        os.remove(db_file)
    except OSError:
        pass

    try:
        conn = sqlite3.connect(db_file)
        print('sql version', sqlite3.version)
    except (sqlite3.Error,) as e:
        raise e
    return conn

def convert_to_josh_packets(words_2_ref_nums):
    #return {word: [] for word in words_2_ref_nums.keys()} # WORDS ONLY
    ref_num_count = max([max(x) for x in words_2_ref_nums.values()])
    PACKET_SIZE = 24  # 24 + 8 bit for location == 32 bits == 4 bytes
    PACKET_INDEXING_BITS = 8
    chunk_size = 200
    while True:
        chunk_count = int(math.ceil(1.0 * ref_num_count/chunk_size))
        packet_count = int(math.ceil(1.0 * chunk_count/PACKET_SIZE))
        if packet_count < 2**PACKET_INDEXING_BITS:
            break
        else:
            chunk_size *= 2
            print('TO MANY PACKETS (only have 8 bits) NEED TO RAISE CHUNK SIZE to: ', chunk_size)

    print('chunk_size', chunk_size, 'chunk_count', chunk_count, 'packet_count', packet_count)
    words_2_packets = {}
    TEST_WORD = 'threefour'

    print('total_words', len(words_2_ref_nums))
    words_done = 0
    for word, ref_nums in words_2_ref_nums.iteritems():
        #if word != TEST_WORD: continue
        packets = []
        chunk_nums = set([ref_num/chunk_size for ref_num in ref_nums])

        #bitstring = blank_bitstring.copy()
        ##for chunk_index in chunk_nums:
        #    bitstring[chunk_index] = True
        bitstring = [i in chunk_nums for i in range(chunk_count)]
        for packet_index in range(packet_count):
            packet_bits = bitstring[(packet_index * PACKET_SIZE):((packet_index + 1) * PACKET_SIZE)]
            if sum(packet_bits):
                packet = packet_index
                for i, bit in enumerate(packet_bits):
                    if bit:
                        packet += 2 ** (i + PACKET_INDEXING_BITS)
                packets.append(packet)
        words_2_packets[word] = packets
        words_done += 1
        if words_done % 100000 == 0:
            print(words_done, 1.0*words_done/len(words_2_ref_nums), str(dt.now().time()),)

        #print(ref_nums)
        #print(packets)
        #print(bitstring)

    words_2_packets['__METADATA_ChunkSize_PacketSize__'] = [chunk_size, PACKET_SIZE] # STORE METADATA into the table itself


    return words_2_packets

def store_str_list(conn, data, table_name, split_value=False):
    data = {i: value for i, value in enumerate(data)}
    sql = """
        CREATE TABLE
        IF NOT EXISTS {} (
         value TEXT
        );
    """.format(table_name)
    conn.execute(sql)
    conn.commit()
    insert_sql = 'INSERT INTO {} (value) values (?)'.format(table_name)
    values = [(str(v),) for k, v in data.iteritems()]
    conn.executemany(insert_sql, values)
    conn.commit()


def store_tup_list(conn, data, table_name):
    data = {i: value for i, value in enumerate(data)}
    sql = """
        CREATE TABLE
        IF NOT EXISTS {} (
         _id PRIMARY KEY,
         value BLOB
        );
    """.format(table_name)
    conn.execute(sql)
    conn.commit()

    insert_sql = 'INSERT INTO {} (_id, value) values (?,?)'.format(table_name)

    values = [(str(v[0]), str(v[1])) for k, v in data.iteritems()]
    conn.executemany(insert_sql, values)
    conn.commit()


def store(conn, data, table_name):
    sql = """
        CREATE TABLE
        IF NOT EXISTS {} (
         _id PRIMARY KEY,
         value BLOB
        );
    """.format(table_name)
    conn.execute(sql)
    conn.commit()

    insert_sql = 'INSERT INTO {} (_id, value) values (?,?)'.format(table_name)

    values = []
    for _id, ref_nums in data.iteritems():
        a = array.array('I', ref_nums)
        b = buffer(a.tostring())
        values.append(
            (_id, b)
            #(_id, '')
            #(_id, str(ref_nums)[1:-1].replace(' ', ''))
        )
    conn.executemany(insert_sql, values)
    conn.commit()


###### GETTING data:
def get_from_word_2_ref(word, words_2_ref_nums, ref_num_min_N_title, ref_num_2_part, ref_num_2_full_name):
    ref_nums = words_2_ref_nums.get(word, [])
    print(ref_nums)
    ref_strs = []
    for ref_num in ref_nums:
        for ref_num_min, temp_title in ref_num_min_N_title:
            if ref_num_min > ref_num:
                break
            title = temp_title
        full_ref_str = '{} {}'.format(title, ref_num_2_part[ref_num])
        print(full_ref_str)
        ref_strs.append(full_ref_str); continue
        #TODO: test weird part refs and make more complete and test that word always shows up in texts
        if full_ref_str != ref_num_2_full_name[ref_num]:
            print('DIFF:',)
            print('try', full_ref_str)
            print('real', ref_num_2_full_name[ref_num])
        else:
            #print('same', full_ref_str)
            ref_strs.append(full_ref_str)

    texts = [' '.join(Ref(r).text('en').text) for r in ref_strs]

    highlighted_texts = [x.replace(word, '_____' + word + '_____') for x in texts]
    print(highlighted_texts)
    return highlighted_texts


def test_get_from_json():
    word = 'four'
    ref_str = get_from_word_2_ref(word, read(WORDS_2_REF_NUMS), read(REF_NUM_MIN_N_TITLE), read(REF_NUM_2_PART), None)

if __name__ == '__main__':
    main()


