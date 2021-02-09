# -*- coding: utf-8 -*-
#!/usr/bin/python2.6
import django
django.setup()

from sefaria.model import library
from sefaria.model import Ref

from sefaria.model.text import TextChunk
from sefaria.search import TextIndexer
from sefaria.system.exceptions import InputError
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

import binascii
import struct

LANGS = ('en', 'he')

def main():
    print ("yoyoy")
    global DESCRIPTION

    # how many Texts (Books) do we want to parse?
    # end = ALL for all books.
    ALL = 100000  # very large number (more than number of indexes)
    start = 0
    end = 300
    test_word = 'water'
    DESCRIPTION = '{}-{}'.format(start, end)

    ####### parse lib words #########
    OfflineTextIndexer.parse_lib_to_json(start, end)

    ####### get ref_strs from json files ########
    #get_from_json(test_word)

    ####### put into db >>>>>>>>>
    #jsons_to_db()

    ####### get ref_strs from DB >>>>>>>>>>>
    #get_from_db(test_word)

WORDS_2_REF_NUMS = 'words_2_ref_nums'
REF_NUM_MIN_N_TITLE = 'ref_num_min_N_title'
REF_NUM_2_PART = 'ref_num_2_part'
_ONLY_WORDS_LIST = 'only_words_list'
METADATA_CHUNKS_PACKETSIZE = '__METADATA_ChunkSize_PacketSize__'

def save_read_filename(name, ext='json'):
    return '../mobile_offline_search/dumps/{}.{}.{}.{}'.format(DESCRIPTION, name, '_'.join(LANGS), ext)

def save(name, data):
    with open(save_read_filename(name), 'w') as f:
        json.dump(data, f)

def read(name):
    with open(save_read_filename(name), 'r') as f:
        return json.load(f)

class OfflineTextIndexer(object):
    @staticmethod
    def get_section_ref(segment_ref):
        return re.sub(r":[^:]+$", '', segment_ref)

    @classmethod
    def index_section(cls, title, section_ref, section_text):
        if not section_ref:
            return
        ref_part = re.sub(r'^{}'.format(re.escape(title)), '', section_ref)
        cls.ref_num_2_full_name.append(section_ref)
        cls.ref_num_2_part.append(ref_part)
        add_words(section_text,cls.words_2_ref_nums, cls.ref_num)
        cls.ref_num += 1

    @classmethod
    def index_segment(cls, text, ref, heRef, version):
        title = version.title
        section_ref = OfflineTextIndexer.get_section_ref(ref)
        if title != cls.curr_title:
            # new book
            cls.curr_title = title
            cls.ref_num_min_N_title.append((cls.ref_num, title,))
        if section_ref != cls.curr_section:
            cls.index_section(cls.curr_title, cls.section_ref, cls.curr_section_text)
            cls.curr_section = section_ref
            cls.curr_section_text = ""
        cls.curr_section_text += text

    @classmethod
    def parse_lib_to_json(cls, start, end):
        print(('parse_lib', start, end))
        cls.ref_num_min_N_title = [] # min ref_num of each book.title [[min_ref_num, book_title], ...]
        cls.ref_num = 0 # absolute index num for all refs
        cls.curr_title = None
        cls.curr_section = None
        cls.curr_section_text = ""
        # only used for debuging (
        cls.ref_num_2_full_name = []

        # index of list is ref_num (implicitly) ["intro to bookA", 1, 2, 3, "Intro to bookB", ...]
        cls.ref_num_2_part = []

        # dict of words: list of all ref_nums which that words appears in
        cls.words_2_ref_nums = defaultdict(set)

        TextIndexer.index_all("", for_es=False, action=OfflineTextIndexer.index_segment)
        # after it's done there's likely an extra section that hasn't been indexed
        cls.index_section(cls.curr_title, cls.section_ref, cls.curr_section_text)

        indexes = library.all_index_records()
        indexes = indexes[start:end]
        print(("Running on {} indexes".format(len(indexes))))
        last_time = time.time()
        for i, index in enumerate(indexes):
            title = index.title
            print((i, str(dt.now().time()), index.title, time.time() - last_time))
            last_time = time.time()
            sys.stdout.flush()
            ref_num_min_N_title.append((ref_num, title,))
            try:
                section_refs = index.all_section_refs()
                for section_ref in section_refs:
                    # remove the title from the section_ref
                    ref_part = re.sub(r'^{}'.format(re.escape(title)), '', section_ref.normal())
                    ref_num_2_full_name.append(section_ref.normal())
                    ref_num_2_part.append(ref_part)
                    add_words(section_ref, words_2_ref_nums, ref_num)
                    ref_num += 1
            except InputError as e:
                print(('ERROR', e))
        print('saving to json...')
        save(REF_NUM_MIN_N_TITLE, ref_num_min_N_title)
        save(REF_NUM_2_PART, ref_num_2_part)


        # convert sets to lists for json
        words_2_ref_nums = {key: sorted(list(value)) for key, value in words_2_ref_nums.items()}
        save(WORDS_2_REF_NUMS, words_2_ref_nums)
        save(_ONLY_WORDS_LIST, list(words_2_ref_nums.keys()))


def add_words(ref, words_2_ref_nums, index_num):
    for lang in LANGS:
        text = ref.text(lang).ja().flatten_to_string()
        words = get_words(text)
        for word in words:
            words_2_ref_nums[word].add(index_num)

def get_words(text):
    #print(text)
    #TODO: more work can prob be done here in this func
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\([^)]+\)', ' ', text)
    text = re.sub(r'\[[^\]]+\]', ' ', text)
    text = re.sub(r'[\u05be\s+\.\-;:,?!{}]', ' ', text) # convert dashs/dots/etc to space
    #text = re.sub(ur'[\u0591-\u05C7\u05f3\u05f4]', '', text)
    #text = re.sub(ur'[\u0591-\u05c7]', '', text)

    text = re.sub(r'([^\u05d0-\u05eaA-Za-z0-9\s])', '', text) # remove non-regular chars
    text = text.lower()
    # bf_text = text
    text = text.replace(' \u05d5', ' ')

    words = text.split()
    words = set(words) - set([''])
    # print('diff')
    # print(' '.join(words - set(bf_text.split(' '))))
    # print(' '.join(set(bf_text.split(' ')) - words))
    # TODO: prophet because: 212321 ... obvious this word is messed up. we need to make a word splitter better
    # TODO: maybe remove single letter words
    #print(' '.join(words))
    return words


### DB storing
def jsons_to_db():
    try:
        conn = get_connection(rm_old=True)

        table_name = REF_NUM_2_PART
        store(conn, read(table_name), table_name, value_type_text=True)

        data = convert_to_josh_packets(read(WORDS_2_REF_NUMS))
        store(conn, data, WORDS_2_REF_NUMS, two_cols=True)

        table_name = REF_NUM_MIN_N_TITLE
        store(conn, read(table_name), table_name, split_tup=True, value_type_text=True, two_cols=True)

    finally:
        conn.close()

def get_connection(rm_old=False):
    """ create a database connection to a SQLite database """
    db_file = save_read_filename('sqlite', 'db')
    print(db_file)
    if rm_old:
        try:
            os.remove(db_file)
        except OSError:
            pass

    try:
        conn = sqlite3.connect(db_file)
        print(('sql version', sqlite3.version))
    except (sqlite3.Error,) as e:
        raise e
    return conn

def convert_to_josh_packets(words_2_ref_nums):
    #return {word: [] for word in words_2_ref_nums.keys()} # WORDS ONLY
    ref_num_count = max([max(x) for x in list(words_2_ref_nums.values())])
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
            print(('TOO MANY PACKETS (only have 8 bits) NEED TO RAISE CHUNK SIZE to: ', chunk_size))

    print(('chunk_size', chunk_size, 'chunk_count', chunk_count, 'packet_count', packet_count))
    words_2_packets = {}
    TEST_WORD = 'threefour'

    print(('total_words', len(words_2_ref_nums)))
    words_done = 0
    for word, ref_nums in words_2_ref_nums.items():
        #if word != TEST_WORD: continue
        packets = []

        chunk_nums = set([ref_num/chunk_size for ref_num in ref_nums])

        #bitstring = blank_bitstring.copy()
        ##for chunk_index in chunk_nums:
        #    bitstring[chunk_index] = True
        bitstring = [i in chunk_nums for i in range(chunk_count)]
        # looks like: 0010010000000000 0000000000000000 0000000000000000:
        # meaning chunk_num [3,6] => section_ref_nums 3=>600-800 and 6=>1200-1400 (maybe one off errors)
        for packet_index in range(packet_count):
            packet_bits = bitstring[(packet_index * PACKET_SIZE):((packet_index + 1) * PACKET_SIZE)]
            if sum(packet_bits): # else it's all 0s and ignore the packet
                packet = packet_index
                for i, bit in enumerate(packet_bits):
                    if bit:
                        packet += 2 ** (i + PACKET_INDEXING_BITS)
                packets.append(packet)
        words_2_packets[word] = packets
        words_done += 1
        if words_done % 100000 == 0:
            print((words_done, 1.0*words_done/len(words_2_ref_nums), str(dt.now().time()),))

        #packet looks like: [0, '0010010000000000']  (the first index for the packet.. meaninbg a 1 shows up in the first 24 bits)
        #                    ^ bit number
        #print(ref_nums)
        #print(packets)
        #print(bitstring)

    words_2_packets[METADATA_CHUNKS_PACKETSIZE] = [chunk_size, PACKET_SIZE] # STORE METADATA into the table itself


    return words_2_packets

def store(conn, data, table_name, two_cols=None, value_type_text=None, split_tup=None, id_key_text=None):
    if value_type_text:
        data = {i: value for i, value in enumerate(data)}
        if split_tup:
            values = [(str(v[0]), str(v[1])) for k, v in data.items()]
        else:
            values = [(str(v),) for k, v in data.items()]
        value_type = 'TEXT'
    else:
        value_type = 'BLOB'
        values = []
        for _id, ref_nums in data.items():
            a = array.array('I', ref_nums)
            b = buffer(a.tostring())
            #print('ab', a.tostring())

            values.append(
                (_id, b)
                # (_id, '')
                # (_id, str(ref_nums)[1:-1].replace(' ', ''))
            )
    if two_cols:
        if id_key_text:
            id_str = '_id TEXT PRIMARY KEY'
        else:
            id_str = '_id INT'
        sql = """
            CREATE TABLE
            IF NOT EXISTS {} (
             {},
             value {}
            );
        """.format(table_name, id_str, value_type)
        insert_sql = 'INSERT INTO {} (_id, value) values (?,?)'.format(table_name)
    else:
        sql = """
            CREATE TABLE
            IF NOT EXISTS {} (
             value BLOB
            );
        """.format(table_name, value_type)
        insert_sql = 'INSERT INTO {} (value) values (?)'.format(table_name)
    conn.execute(sql)
    conn.commit()

    conn.executemany(insert_sql, values)
    conn.commit()

###### GETTING data:
def get_from_word_2_ref(word, words_2_ref_nums, ref_num_min_N_title, ref_num_2_part, ref_num_2_full_name):
    ref_nums = words_2_ref_nums.get(word, [])
    print(('ref_nums', ref_nums))
    ref_strs = []
    for ref_num in ref_nums:
        for ref_num_min, temp_title in ref_num_min_N_title:
            if ref_num_min > ref_num:
                break
            title = temp_title
        full_ref_str = '{}{}'.format(title, ref_num_2_part[ref_num])
        print(('full_ref_str', ref_num, full_ref_str))


        ref_strs.append(full_ref_str); continue
        #TODO: test weird part refs and make more complete and test that word always shows up in texts
        if full_ref_str != ref_num_2_full_name[ref_num]:
            print(('DIFF:',))
            print(('try', full_ref_str))
            print(('real', ref_num_2_full_name[ref_num]))
        else:
            #print('same', full_ref_str)
            ref_strs.append(full_ref_str)

    for r in ref_strs:
        full_text = ' '.join(Ref(r).text('en').text)
        print(('text from ref search', r, word in full_text))# full_text.replace(word, '_____' + word + '_____'))

    return ref_strs


def get_from_json(word):
    return get_from_word_2_ref(word, read(WORDS_2_REF_NUMS), read(REF_NUM_MIN_N_TITLE), read(REF_NUM_2_PART), None)

def make_little_endian(blob):
    #hex_str = struct.unpack_from('>8s', blob)
    #print(hex_str)
    hex_str = str(blob).encode("hex")
    print(('pre little endain', hex_str))
    new_hex = []
    for byte_i in range(0, len(hex_str), 8):
        hex_byte_str = hex_str[byte_i:byte_i + 8]
        print(('hbs', byte_i, hex_byte_str, hex_str))
        for i in range(len(hex_byte_str), len(hex_byte_str) - 8, -2):
            new_hex.append(hex_byte_str[i - 2:i])
    new_hex = ''.join(new_hex)
    print(('new_hex', new_hex))
    return new_hex

def search_in_ref(ref, query):
    snippet_size = 300
    text = ref.text('en').ja().flatten_to_string()
    try:
        i = text.index(query)
        start = i - snippet_size if i > snippet_size else 0
        end = i + snippet_size
        return text[start:end]
    except ValueError:
        return False

def get_from_db(word):
    ref_results = []
    conn = get_connection()

    # GET THE METADATA STUFF
    sql = 'SELECT * from {} WHERE _id like ?'.format(WORDS_2_REF_NUMS)
    _id, blob = conn.cursor().execute(sql, (METADATA_CHUNKS_PACKETSIZE,)).fetchall()[0]
    hex_str = make_little_endian(blob)

    chunk_size = int(hex_str[0:8], 16)
    PACKET_SIZE = int(hex_str[8:16], 16) # 3 * 8 # 3 bytes of bits * 8bits per byte
    print((_id, blob, hex_str, len(hex_str), chunk_size, PACKET_SIZE)) # 200, 24 ... this looks correct
    ##

    sql = 'SELECT * from {} where _id like ?'.format(WORDS_2_REF_NUMS)
    cur = conn.cursor()
    cur.execute(sql, (word,))

    for word_id, blob in cur.fetchall():
        chunk_start_nums = []
        hex_str = str(blob).encode("hex")
        print(hex_str)
        for index in range(0, len(hex_str), 8): # each hex is half a byte and 4 bytes to a JH_packet
            packet = hex_str[index:index+8] # get just the packet
            packet_index = int(packet[:2], 16) # first byte is the packet_index
            # take last 3 bytes as the bitstring of 0 vs. 1 if contains `_id` keyword
            packet_bits = bin(int(packet[2:], 16))[2:].zfill(PACKET_SIZE)
            # for each of the bytes reverse the bits inside of it (make little endian)
            packet_bits = ''.join([packet_bits[i - 8:i][::-1] for i in range(8, len(packet_bits) + 1, 8)])
            for bit_index, bit in enumerate(packet_bits):
                if bit == '1':
                    chunk_start_num = (packet_index * PACKET_SIZE + bit_index) * chunk_size
                    chunk_start_nums.append(chunk_start_num)
                    print((index, packet, packet_index, packet_bits, chunk_start_num))

        title_id = -1
        for chunk_start_num in chunk_start_nums:
            # get all part names from chunk_start to chunk_start + size of the chunk
            sql = 'SELECT _rowid_, value from {} where _rowid_ BETWEEN ? AND ?'.format(REF_NUM_2_PART)
            cur.execute(sql, (chunk_start_num + 1, chunk_start_num + chunk_size + 1))

            for ref_row_id, part in cur.fetchall():
                ref_num = ref_row_id - 1
                if ref_num > title_id:
                    # get book title
                    sql = 'SELECT * from {} where _id <= ? order by `_id` desc limit 1'.format(REF_NUM_MIN_N_TITLE)
                    cur.execute(sql, (ref_num,))
                    rows = cur.fetchall()
                    title_id, title = rows[0]

                ref_str = '{}{}'.format(title, part)
                try:
                    r = Ref(ref_str)
                    result = search_in_ref(r, word)
                    if result:
                        ref_results.append(r)
                        # print result
                except InputError as e:
                    print(('ERROR parsing ref', e))
    print(('Found {} results for {}'.format(len(ref_results), word)))
    return ref_results


if __name__ == '__main__':
    main()
