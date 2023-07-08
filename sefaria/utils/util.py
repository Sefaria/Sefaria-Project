# -*- coding: utf-8 -*-
"""
Miscellaneous functions for Sefaria.
"""
from datetime import datetime
from html.parser import HTMLParser
import re
from functools import wraps
from itertools import zip_longest
from sefaria.constants.model import ALLOWED_TAGS_IN_ABSTRACT_TEXT_RECORD

"""
Time utils
"""

epoch = datetime.utcfromtimestamp(0)

def epoch_time(since=None):
    if since is None:
        since = datetime.utcnow()
    # define total_seconds which exists in Python3
    total_seconds = lambda delta: int(delta.days * 86400 + delta.seconds + delta.microseconds / 1e6)
    return total_seconds(since - epoch)

def td_format(td_object):
    """
    Turn a timedelta object into a nicely formatted string.
    """
    seconds = int(td_object.total_seconds())
    periods = [
            ('year',        60*60*24*365),
            ('month',       60*60*24*30),
            ('day',         60*60*24),
            ('hour',        60*60),
            ('minute',      60),
            ('second',      1)
            ]

    strings=[]
    for period_name,period_seconds in periods:
            if seconds > period_seconds:
                    period_value , seconds = divmod(seconds,period_seconds)
                    if period_value == 1:
                            strings.append("%s %s" % (period_value, period_name))
                    else:
                            strings.append("%s %ss" % (period_value, period_name))

    return ", ".join(strings)

def get_hebrew_date(dt_obj:datetime) -> tuple:
    """

    :param dt_obj : datetime object
    :return: en date and he date for Hebrew date
    """
    from convertdate import hebrew
    months = [
        ("Nisan", "ניסן"),
        ("Iyar", "אייר"),
        ("Sivan", "סיוון"),
        ("Tammuz", "תמוז"),
        ("Av", "אב"),
        ("Elul", "אלול"),
        ("Tishrei", "תשרי"),
        ("Cheshvan", "חשון"),
        ("Kislev", "כסלו"),
        ("Tevet", "טבת"),
        ("Shevat", "שבט"),
        ("Adar", "אדר"),
        ("Adar II", "אדר ב׳"),
    ]
    y, m, d = hebrew.from_gregorian(dt_obj.year, dt_obj.month, dt_obj.day)
    en = "{} {}, {}".format(months[m-1][0], d, y)
    he = "{} {}, {}".format(months[m-1][1], d, y)
    return en, he


'''
Data structure utils - lists
'''

# also at JaggedArray.depth().  Still needed?
def list_depth(x, deep=False):
    """
    returns 1 for [], 2 for [[]], etc.
    :parm x - a list
    :param deep - whether or not to count a level when not all elements in
    that level are lists.
    e.g. [[], ""] has a list depth of 1 with depth=False, 2 with depth=True
    """
    if isinstance(x, int):
        return 0
    elif len(x) > 0 and (deep or all([isinstance(y, list) for y in x])):
        return 1 + max([list_depth(y, deep=deep) for y in x])
    else:
        return 1

"""
# Create a list that from the results of the function chunks:
    names = ['Genesis', 'Exodus', 'Leviticus', 'Numbers','Deuteronomy','Joshua', 'Judges', 'Samuel', 'Kings','Isaiah', 'Jeremiah', 'Ezekiel','Hosea']
    list(list_chunks(names, 5))
    >>>[['Genesis', 'Exodus', 'Leviticus', 'Numbers','Deuteronomy'],
       ['Joshua', 'Judges', 'Samuel', 'Kings','Isaiah'],
       ['Jeremiah', 'Ezekiel','Hosea']]
       credit: https://stackoverflow.com/questions/312443/how-do-you-split-a-list-into-evenly-sized-chunks
"""

def list_chunks(l, n):
    # For item i in a range that is a length of l,
    for i in range(0, len(l), n):
        # Create an index range for l of n items:
        yield l[i:i+n]

def union(a, b):
    """ return the union of two lists """
    return list(set(a) | set(b))

'''
Data structure utils - dicts
'''

def traverse_dict_tree(dict_tree: dict, key_list: list):
    """
    For a list [a, b, c] return dict_tree[a][b][c]
    :param dict_tree: a list of nested dict objects
    :param key_list: list of keys
    :return:
    """
    current_node = dict_tree
    for key in key_list:
        current_node = current_node[key]
    return current_node

def deep_update(dict1, dict2):
    """
    Merges dict2 into dict1. Will recursively merge as deep as necessary. returns merged dict
    @param dict1:
    @param dict2:
    @return: merged dict
    """
    from collections.abc import Mapping

    for k, v in dict2.items():
        if isinstance(v, Mapping):
            dict1[k] = deep_update(dict1.get(k, {}), v)
        else:
            dict1[k] = v
    return dict1

'''
Data structure utils - jagged arrays
'''

# Moving to JaggedArray.flattenToArray()
def flatten_jagged_array(jagged):
    """
    Returns a 1D list of each terminal element in a jagged array.
    """
    flat = []
    for el in jagged:
        if isinstance(el, list):
            flat = flat + flatten_jagged_array(el)
        else:
            flat.append(el)

    return flat

def is_text_empty(text):
    """
    Returns true if a jagged array 'test' is emtpy or contains
    only "" or 0.
    """
    text = flatten_jagged_array(text)

    text = [t if t != 0 else "" for t in text]
    return not len("".join(text))

def rtrim_jagged_string_array(ja):
    """
    Returns a jagged string array corresponding to ja with any
    trailing Falsey values in any subsection removed.
    """
    if not isinstance(ja, list):
        return ja
    while len(ja) and not ja[-1]:
        ja.pop() # Remove any trailing Falsey values ("", 0, False)
    return [rtrim_jagged_string_array(j) for j in ja]

def text_preview(en, he):
    """
    Returns a jagged array terminating in dicts like {'he': '', 'en': ''} which offers preview
    text merging what's available in jagged string arrays 'en' and 'he'.
    """
    n_chars = 80
    en = [en] if isinstance(en, str) else [""] if en == [] or not isinstance(en, list) else en
    he = [he] if isinstance(he, str) else [""] if he == [] or not isinstance(he, list) else he

    def preview(section):
        """Returns a preview string for list section"""
        section =[s for s in section if isinstance(s, str)]
        section = " ".join(map(str, section))
        return strip_tags(section[:n_chars]).strip()

    if not any(isinstance(x, list) for x in en + he):
        return {'en': preview(en), 'he': preview(he)}
    else:
        zipped = zip_longest(en, he)
        return [text_preview(x[0], x[1]) for x in zipped]


'''
file utils
'''

#checks if a file is in directory
def in_directory(file, directory):
    import os.path
    # make both absolute
    directory = os.path.join(os.path.realpath(directory), '')
    file = os.path.realpath(file)
    if not os.path.exists(directory) or not os.path.isdir(directory):
        return False
    if not os.path.exists(file):
        return False
    # return true, if the common prefix of both is equal to directory
    # e.g. /a/b/c/d.rst and directory is /a/b, the common prefix is /a/b
    return os.path.commonprefix([file, directory]) == directory


def get_directory_content(dirname, modified_after=False):
    import os
    import os.path
    filenames = []
    for path, subdirs, files in os.walk(dirname):
        for name in files:
            filepath = os.path.join(path, name)
            if modified_after is False or os.path.getmtime(filepath) > modified_after:
                filenames.append(filepath)
    return filenames



'''
text utils
'''

def string_overlap(text1, text2):
    """
    Returns the number of characters that the end of text1 overlaps the beginning of text2.
    https://neil.fraser.name/news/2010/11/04/
    """
    # Cache the text lengths to prevent multiple calls.
    text1_length = len(text1)
    text2_length = len(text2)
    # Eliminate the null case.
    if text1_length == 0 or text2_length == 0:
        return 0
    # Truncate the longer string.
    if text1_length > text2_length:
        text1 = text1[-text2_length:]
    elif text1_length < text2_length:
        text2 = text2[:text1_length]
    # Quick check for the worst case.
    if text1 == text2:
        return min(text1_length, text2_length)

    # Start by looking for a single character match
    # and increase length until no match is found.
    best = 0
    length = 1
    while True:
        pattern = text1[-length:]
        found = text2.find(pattern)
        if found == -1:
            return best
        length += found
        if text1[-length:] == text2[:length]:
            best = length
            length += 1


def replace_using_regex(regex, query, old, new, endline=None):
    """
    This is an enhancement of str.replace(). It will only call str.replace if the regex has
    been found, thus allowing replacement of tags that may serve multiple or ambiguous functions.
    Should there be a need, an endline parameter can be added which will be appended to the end of
    the string
    :param regex: A regular expression. Will be compiled locally.
    :param query: The input string to be examined.
    :param old: The text to be replaced.
    :param new: The text that will be inserted instead of 'old'.
    :param endline: An optional argument that can be appended to the end of the string.
    :return: A new string with 'old' replaced by 'new'.
    """

    # compile regex and search
    reg = re.compile(regex)
    result = re.search(reg, query)
    if result:

        # get all instances of match
        matches = re.findall(reg, query)
        for match in matches:
            temp = match.replace(old, new)
            query = query.replace(match, temp)
        if endline is not None:
            query.replace('\n', endline + '\n')
    return query


def count_by_regex(some_file, regex):
    """
    After OCR, text files are returned with many tags, the meaning of which may not be clear or ambiguous.
    Even if the meaning of each tag is known it can be useful to know how many times each tag appears, as
    errors may have arisen during the scanning and OCR. By using a regular expression to search, entire
    documents can be scanned quickly and efficiently.

    :param some_file: A file to be scanned.
    :param regex: The regex to be used
    :return: A dictionary where the keys are all the strings that match the regex and the values are the
    number of times each one appears.
    """

    # instantiate a dictionary to hold results
    result = {}

    # compile regex
    reg = re.compile(regex)

    # loop through file
    for line in some_file:

        # search for regex
        found = re.findall(reg, line)

        # count instances found
        for item in found:
            if item not in result:
                result[item] = 1
            else:
                result[item] += 1
    return result


def titlecase(text):
    """
    This function is based on some Perl code by: John Gruber http://daringfireball.net/ 10 May 2008
    & a Python version by Stuart Colville http://muffinresearch.co.uk
    under the terms of the MIT license: http://www.opensource.org/licenses/mit-license.php

    changes all words to Title Caps, and attempts to be clever about not capitalizing SMALL words
    like a/an/the in the input. The list of "SMALL words" comes from the NYTimes Manual of Style,
    plus 'vs' and 'v'.

    Sentences that are all caps are left alone.

    Words with capitalized letters in the middle (e.g. Tu B'Shvat, iTunes, etc) are left alone as well.
    """

    SMALL = r'a|an|and|as|at|but|by|en|for|if|in|of|on|or|the|to|v\.?|via|vs\.?'
    PUNCT = r"""!"#$%&'‘()*+,\-./:;?@[\\\]_`{|}~"""
    SMALL_WORDS = re.compile(r'^(%s)$' % SMALL, re.I)
    INLINE_PERIOD = re.compile(r'[a-z][.][a-z]', re.I)
    UC_ELSEWHERE = re.compile(r'[%s]*?[a-zA-Z]+[A-Z]+?' % PUNCT)
    CAPFIRST = re.compile(r"^[%s]*?([A-Za-z])" % PUNCT)
    SMALL_FIRST = re.compile(r'^([%s]*)(%s)\b' % (PUNCT, SMALL), re.I)
    SMALL_LAST = re.compile(r'\b(%s)[%s]?$' % (SMALL, PUNCT), re.I)
    SUBPHRASE = re.compile(r'([:.;?!\-\—][ ])(%s)' % SMALL)
    APOS_SECOND = re.compile(r"^[dol]{1}['‘]{1}[a-z]+(?:['s]{2})?$", re.I)
    ALL_CAPS = re.compile(r'^[A-Z\s\d%s]+$' % PUNCT)
    UC_INITIALS = re.compile(r"^(?:[A-Z]{1}\.{1}|[A-Z]{1}\.{1}[A-Z]{1})+$")
    MAC_MC = re.compile(r"^([Mm]c|MC)(\w.+)")

    lines = re.split('[\r\n]+', text)
    processed = []
    for line in lines:
        all_caps = ALL_CAPS.match(line)
        words = re.split('[\t ]', line)
        tc_line = []
        for word in words:

            if all_caps:
                if UC_INITIALS.match(word):
                    tc_line.append(word)
                    continue

            if APOS_SECOND.match(word):
                if len(word[0]) == 1 and word[0] not in 'aeiouAEIOU':
                    word = word[0].lower() + word[1] + word[2].upper() + word[3:]
                else:
                    word = word[0].upper() + word[1] + word[2].upper() + word[3:]
                tc_line.append(word)
                continue

            match = MAC_MC.match(word)
            if match:
                tc_line.append("%s%s" % (match.group(1).capitalize(),
                                         titlecase(match.group(2))))
                continue

            if INLINE_PERIOD.search(word) or (not all_caps and UC_ELSEWHERE.match(word)):
                tc_line.append(word)
                continue
            if SMALL_WORDS.match(word):
                tc_line.append(word.lower())
                continue

            if "/" in word and "//" not in word:
                slashed = [titlecase(t) for t in word.split('/')]
                tc_line.append("/".join(slashed))
                continue

            if '-' in word:
                hyphenated = [titlecase(t) for t in word.split('-')]
                tc_line.append("-".join(hyphenated))
                continue

            # Just a normal word that needs to be capitalized
            tc_line.append(CAPFIRST.sub(lambda m: m.group(0).upper(), word))

        result = " ".join(tc_line)

        result = SMALL_FIRST.sub(lambda m: '%s%s' % (
            m.group(1),
            m.group(2).capitalize()
        ), result)

        result = SMALL_LAST.sub(lambda m: m.group(0).capitalize(), result)

        result = SUBPHRASE.sub(lambda m: '%s%s' % (
            m.group(1),
            m.group(2).capitalize()
        ), result)

        processed.append(result)

    return "\n".join(processed)

def wrap_chars_with_overlaps(s, chars_to_wrap, get_wrapped_text, return_chars_to_wrap=False):
    chars_to_wrap.sort(key=lambda x: (x[0],x[0]-x[1]))
    for i, (start, end, metadata) in enumerate(chars_to_wrap):
        wrapped_text, start_added, end_added = get_wrapped_text(s[start:end], metadata)
        s = s[:start] + wrapped_text + s[end:]
        chars_to_wrap[i] = (start, end + start_added + end_added, metadata)
        for j, (start2, end2, metadata2) in enumerate(chars_to_wrap[i+1:]):
            if start2 >= end:
                start2 += end_added
            start2 += start_added
            if end2 > end:
                end2 += end_added
            end2 += start_added
            chars_to_wrap[i+j+1] = (start2, end2, metadata2)
    if return_chars_to_wrap:
        return s, chars_to_wrap
    return s

def find_all_html_elements_indices(input_string: str) -> dict:
    tags = ALLOWED_TAGS_IN_ABSTRACT_TEXT_RECORD
    tags_regex = f'(?:{"|".join(tags)})'
    html_element_indices = {}
    for m in re.finditer(f'</?{tags_regex}(?: [^>]*)?>', input_string):
        html_element_indices[m.end()-1] = m.start()
    return html_element_indices

def truncate_string(string, min_length, max_length):
    if len(string) <= max_length:
        return string
    html_element_indices = find_all_html_elements_indices(string)
    next_html_closing_tag_index = string.find('>', max_length)
    for break_char in ".;, ":
        pos = next_html_closing_tag_index if next_html_closing_tag_index != -1 else max_length
        while min_length <= pos:
            while pos in html_element_indices:
                pos = html_element_indices[pos] - 1
            if string[pos] == break_char:
                return string[:pos] + "…"
            pos -= 1
    return string

'''
strip utils
'''

class MLStripper(HTMLParser):
    def __init__(self):
        super().__init__()

        self.reset()
        self.strict = False
        self.convert_charrefs = True
        self.fed = []

    def handle_data(self, d):
        self.fed.append(d)

    def get_data(self):
        return ' '.join(self.fed)


def strip_tags(html, remove_new_lines=False):
    """
    Returns the text of html with tags stripped.
    Customized to insert a space between adjacent tags after stripping.
    """
    html = html or ""
    s = MLStripper()
    s.feed(html)
    stripped = s.get_data().strip()
    if remove_new_lines:
        stripped = re.sub(r"\n+", " ", stripped)
    return stripped

'''
language code utils
'''

def short_to_long_lang_code(code):
    if code in ("bi", "he-en", "en-he"):
        code = "bilingual"
    elif code in ('he', 'he-il'):
        code = 'hebrew'
    elif code in ("en"):
        code = "english"
    return code


def get_lang_codes_for_territory(territory_code, min_pop_perc=0.2, official_status=False):
    """
    Wrapper for babel.languages.get_territory_language_info
    Documentation here: https://github.com/python-babel/babel/blob/master/babel/languages.py#L45 (strange that this function isn't documented on their official site)

    :param territory_code: two letter territory ISO code. If doesn't match anything babel recognizes, returns empty array
    :param min_pop_perc: min population percentage of language usage in territory. stats are likely only mildly accurate but good enough
    :param official_status: the status of the language in the territory. I think this can be 'official', 'de_facto_official', None, 'official_regional'. False means return all.

    returns array of ISO lang codes
    """
    from babel import languages
    lang_dict = languages.get_territory_language_info(territory_code)
    langs = [lang_code for lang_code, _ in filter(lambda x: x[1]['population_percent'] >= (min_pop_perc * 100) and (
                (official_status == False) or x[1]['official_status'] == official_status), lang_dict.items())]
    return langs


'''
subclass utils
'''

def get_all_subclasses(cls):
    subclasses = set()
    work = [cls]
    while work:
        parent = work.pop()
        for child in parent.__subclasses__():
            if child not in subclasses:
                subclasses.add(child)
                work.append(child)
    return subclasses


def get_all_subclass_attribute(cls, attr):
    subclasses = get_all_subclasses(cls)
    attr_vals = []
    for s in subclasses:
        attr_val = getattr(s, attr, None)
        if attr_val:
            attr_vals.append(attr_val)
    return attr_vals


'''
other utils
'''

def get_size(obj, seen=None):
    """Recursively finds size of objects in bytes"""
    import sys
    import inspect
    size = sys.getsizeof(obj)
    if seen is None:
        seen = set()
    obj_id = id(obj)
    if obj_id in seen:
        return 0
    # Important mark as seen *before* entering recursion to gracefully handle
    # self-referential objects
    seen.add(obj_id)
    if hasattr(obj, '__dict__'):
        for cls in obj.__class__.__mro__:
            if '__dict__' in cls.__dict__:
                d = cls.__dict__['__dict__']
                if inspect.isgetsetdescriptor(d) or inspect.ismemberdescriptor(d):
                    size += get_size(obj.__dict__, seen)
                break
    if isinstance(obj, dict):
        size += sum((get_size(v, seen) for v in list(obj.values())))
        size += sum((get_size(k, seen) for k in list(obj.keys())))
    elif hasattr(obj, '__iter__') and not isinstance(obj, (str, bytes, bytearray)):
        size += sum((get_size(i, seen) for i in obj))
    return size

def graceful_exception(logger=None, logLevel="exception", return_value=[], exception_type=Exception):
    def argumented_decorator(func):
        @wraps(func)
        def decorated_function(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except exception_type as e:
                if logger:
                    logger.exception(str(e)) if logLevel == "exception" else logger.warning(str(e))
            return return_value
        return decorated_function
    return argumented_decorator
