import re
from typing import Dict, List, Callable
from functools import reduce, lru_cache
from bisect import bisect_right
from bs4 import BeautifulSoup, Tag

"""
Tools for normalizing text
"""

UNIDECODE_TABLE = {
    "ḥ": "h",
    "Ḥ": "H",
    "ă": "a",
    "ǎ": "a",
    "ġ": "g",
    "ḫ": "h",
    "ḳ": "k",
    "Ḳ": "K",
    "ŏ": "o",
    "ż": "z",
    "Ż": "Z",
    "Ṣ": "S",
    "ṣ": "s",
    "Ṭ": "T",
    "ṭ": "t",
    "ï": "i",
    "ī": "i",
    "ĩ": "i",
    "ë": "e",
    "’": "'",
    '\u05f3': "'",
    "\u05f4": '"',
    "\u0323": "",  # chirik-like dot
    "”": '"',
    "“": '"'
}


class AbstractNormalizer:
    """
    Defines signature for normalizers
    Subclasses should implement find_text_to_remove() and optionally normalize()
    Default implementation of normalize() works, but is not optimized. Consider implementing if speed is important.
    """
    def __init__(self):
        pass

    def normalize(self, s: str, **kwargs) -> str:
        """
        Returns a modification of the string s.
        Usually this will remove unwanted characters like HTML or nikkud.
        """
        text_to_remove = self.find_text_to_remove(s, **kwargs)
        schars = list(s)
        # make sure to iterate backwards b/c you're changing indices
        for (start, end), repl in reversed(text_to_remove):
            schars[start:end] = repl
        return ''.join(schars)

    def find_text_to_remove(self, s:str, **kwargs) -> list:
        """
        Returns a list of text to remove when applying normalizer to string s.
        Each item in the list is of form ((start, end), replacement) where start and end are indices in s of text to replace with string `replacement`
        E.g. ((1, 3), " ") means s[1:3] should be replaced with " "
        """
        return []

    @staticmethod
    def remove_subsets(text_to_remove):
        """
        Assumes there are no overlapping or equal length ranges
        Removes strict subsets from list
        """
        def remove_subsets_reducer(curr_text_to_remove: list, next: tuple) -> list:
            (next_start, next_end), _ = next
            for (start, end), _ in curr_text_to_remove:
                if next_start > start and next_end < end:
                    # next is a subset. dont append
                    return curr_text_to_remove
            return curr_text_to_remove + [next]

        text_to_remove.sort(key=lambda x: x[0][1] - x[0][0], reverse=True)
        return reduce(remove_subsets_reducer, text_to_remove, [])

    def get_mapping_after_normalization(self, text, removal_list=None, reverse=False, **kwargs):
        """
        text - unnormalized text
        removal_list - instead of passing `find_text_to_remove`, you can pass an already calculated list of tuples. should be in same format as return value of find_text_to_remove
        reverse - bool. If True, then will return mapping from unnormalized string to normalized string

        returns - dictionary where keys are indices in normalized string and values are how many characters were removed (or added if negative number) by that point from unnormalized string. If reverse=True, indices are in unnormalized string

        Example.
            text = "a###b##c" find_text_to_remove = lambda x: [(m, '') for m in re.finditer(r'#+', x)]
            will return {1: 3, 2: 5}
            meaning by the 2nd index, 5 chars have been removed
            then if you have a range (0,3) in the normalized string "abc" you will know that maps to (0, 8) in the original string
        """
        if removal_list is None:
            removal_list = self.find_text_to_remove(text, **kwargs)
        total_removed = 0
        removal_map = {}
        for removal, subst in removal_list:
            try:
                start, end = removal
            except TypeError:
                # must be match object
                start, end = removal.start(), removal.end()
            normalized_text_index = start if reverse else (start + min(len(subst), end-start) - total_removed)
            curr_removed = end - start - len(subst)
            if curr_removed > 0:
                total_removed += curr_removed
                removal_map[normalized_text_index] = total_removed
        return removal_map

    @staticmethod
    def convert_normalized_indices_to_unnormalized_indices(normalized_indices, removal_map, reverse=False):
        """
        normalized_indices - list of tuples where each tuple is (x, y) x being start index, y is end index + 1
        removal_map - return value of get_mapping_after_normalization()
        reverse - if True, normalized_indices are actually unnormalized indices and removal_map was calculated using reverse=True in get_mapping_after_normalization()
        """
        removal_keys = sorted(removal_map.keys())
        unnormalized_indices = []
        sign = -1 if reverse else 1
        for start, end in normalized_indices:
            unnorm_start_index = bisect_right(removal_keys, start) - 1
            # special case if range is zero-length. treat end as literal and not off-by-one.
            bisect_end_index = end if end == start else (end - 1)
            unnorm_end_index = bisect_right(removal_keys, bisect_end_index) - 1

            unnorm_start = start if unnorm_start_index < 0 else start + (sign * removal_map[removal_keys[unnorm_start_index]])
            unnorm_end = end if unnorm_end_index < 0 else end + (sign * removal_map[removal_keys[unnorm_end_index]])
            unnormalized_indices += [(unnorm_start, unnorm_end)]
        return unnormalized_indices


class ITagNormalizer(AbstractNormalizer):

    def __init__(self, repl):
        super().__init__()
        self.repl = repl

    @staticmethod
    def _find_itags(tag):
        from sefaria.model.text import AbstractTextRecord
        return AbstractTextRecord._find_itags(tag)

    @staticmethod
    def _get_all_itags(s):
        """
        Very similar to sefaria.model.text.AbstractTextRecord
        Originally called `_strip_itags`
        """
        from sefaria.model.text import AbstractTextRecord

        all_itags = []
        soup = BeautifulSoup(f"<root>{s}</root>", 'lxml')
        itag_list = soup.find_all(ITagNormalizer._find_itags)
        for itag in itag_list:
            all_itags += [itag]
            try:
                if AbstractTextRecord._itag_is_footnote(itag):
                    all_itags += [itag.next_sibling]  # it's a footnote
            except AttributeError:
                pass  # it's an inline commentator
        return all_itags, soup

    @staticmethod
    def _find_itag_start(itag_text: str, s: str, search_start: int) -> int:
        """
        There can be minor differences in itag created by bs4
        Try to find start of itag regardless
        """
        start = -1
        for end_char in range(len(itag_text), round(len(itag_text)/2), -10):
            truncated_itag = itag_text[:end_char]
            start = s.find(truncated_itag, search_start)
            if start != -1:
                break
        return start

    def find_text_to_remove(self, s:str, **kwargs) -> list:
        lenient = kwargs.get('lenient', False)  # if lenient, fail gracefully when you can't find an itag
        all_itags, _ = ITagNormalizer._get_all_itags(s)
        next_start = 0
        text_to_remove = []
        for itag in all_itags:
            itag_text = itag.decode()
            start = self._find_itag_start(itag_text, s, next_start)
            end = start+len(itag_text)
            if start == -1:
                exception_text = f"Couldn't find itag with text '{itag_text}' in\n{s}\nnext_start = {next_start}"
                if lenient:
                    print(exception_text)
                    continue
                else:
                    raise Exception(exception_text)
            text_to_remove += [((start, end), self.repl)]
            next_start = start + 1

        text_to_remove = self.remove_subsets(text_to_remove)
        text_to_remove.sort(key=lambda x: x[0][0])
        return text_to_remove

class ReplaceNormalizer(AbstractNormalizer):

    def __init__(self, old, new):
        super().__init__()
        self.old = old
        self.new = new

    def normalize(self, s, **kwargs):
        return s.replace(self.old, self.new)

    def find_text_to_remove(self, s, **kwargs):
        return [((m.start(), m.end()), self.new) for m in re.finditer(re.escape(self.old), s)]


class RegexNormalizer(AbstractNormalizer):

    def __init__(self, reg, repl) -> None:
        super().__init__()
        self.reg = reg
        self.repl = repl

    def normalize(self, s, **kwargs):
        return re.sub(self.reg, self.repl, s)

    def find_text_to_remove(self, s, **kwargs):
        return [((m.start(), m.end()), self.repl) for m in re.finditer(self.reg, s)]


class NormalizerComposer(AbstractNormalizer):

    def __init__(self, step_keys: List[str]=None, steps: List[AbstractNormalizer]=None) -> None:
        """
        Combines multiple normalizers as if they are one normalizer.
        Should pass either step_keys or steps.
        :param step_keys: list of keys in NormalizerFactory.key_normalizer_map of normalizers to apply in order
        :param steps: list of AbstractNormalizers to apply in order
        """
        super().__init__()
        if steps is not None:
            self.steps = steps
        else:
            self.steps = NormalizerFactory.get_all(step_keys)

    def normalize(self, s, **kwargs):
        for step in self.steps:
            s = step.normalize(s)
        return s

    def find_text_to_remove(self, s, **kwargs):
        """
        this is a bit mind-boggling.
        apply normalization steps one-by-one and keep track of mapping from one step to the next
        iteratively apply mappings (in reverse) on each step's removal inds to get inds in original string
        """
        final_text_to_remove = []
        mappings = []
        snorm = s
        for step in self.steps:
            curr_text_to_remove = step.find_text_to_remove(snorm, **kwargs)
            if len(curr_text_to_remove) == 0:
                text_to_remove_inds, text_to_remove_repls = [], []
            else:
                text_to_remove_inds, text_to_remove_repls = zip(*curr_text_to_remove)
            for mapping in reversed(mappings):
                text_to_remove_inds = step.convert_normalized_indices_to_unnormalized_indices(text_to_remove_inds, mapping)
            curr_text_to_remove = list(zip(text_to_remove_inds, text_to_remove_repls))

            # merge any overlapping ranges
            # later edits should override earlier ones
            final_text_to_remove = self.merge_removal_inds(final_text_to_remove, curr_text_to_remove)
            mappings += [step.get_mapping_after_normalization(snorm, **kwargs)]
            snorm = step.normalize(snorm, **kwargs)
        final_text_to_remove.sort(key=lambda x: x[0])
        return final_text_to_remove

    @staticmethod
    def merge_removal_inds(*all_removal_inds):
        combined_removal_inds = reduce(lambda a, b: a + b, all_removal_inds, [])
        combined_removal_inds.sort(key=lambda x: x[0][0])
        merged_removal_inds = []
        for curr_inds, curr_repl in combined_removal_inds:
            if len(merged_removal_inds) == 0:
                merged_removal_inds += [(curr_inds, curr_repl)]
                continue
            last_inds, last_repl = merged_removal_inds[-1]
            if curr_inds[0] >= last_inds[1]:
                # If current interval doesn't overlap with the last interval in result, append it
                merged_removal_inds += [(curr_inds, curr_repl)]
            else:
                # some sort of overlap
                curr_merged_inds = (last_inds[0], max(last_inds[1], curr_inds[1]))
                curr_merged_repl = last_repl[:curr_inds[0]-last_inds[0]] + curr_repl + last_repl[(curr_inds[1]+1)-last_inds[0]:]
                merged_removal_inds[-1] = (curr_merged_inds, curr_merged_repl)

        return merged_removal_inds


class TableReplaceNormalizer(AbstractNormalizer):

    def __init__(self, table: Dict[str, str]):
        """
        :param table: will replace every key with value in string
        """
        super().__init__()
        replace_pairs = sorted(table.items(), key=lambda x: len(x[0]), reverse=True)
        steps = [ReplaceNormalizer(old, new) for old, new in replace_pairs]
        self.step_composer = NormalizerComposer(steps=steps)

    def normalize(self, s, **kwargs):
        return self.step_composer.normalize(s)

    def find_text_to_remove(self, s, **kwargs):
        return self.step_composer.find_text_to_remove(s)


class FunctionNormalizer(AbstractNormalizer):
    """
    Normalize by arbitrary find_text_to_remove
    """

    def __init__(self, custom_find_text_to_remove):
        super().__init__()
        self.custom_find_text_to_remove = custom_find_text_to_remove

    def find_text_to_remove(self, s: str, **kwargs) -> list:
        return self.custom_find_text_to_remove(s, **kwargs)


class NormalizerFactory:
    key_normalizer_map = {
        "html": RegexNormalizer(r"\s*<[^>]+>\s*", " "),
        "cantillation": RegexNormalizer("[\u0591-\u05bd\u05bf-\u05c5\u05c7]+", ""),
        "parens-plus-contents": RegexNormalizer(r"\([^)]+\)", " "),
        "brackets": RegexNormalizer(r"[\[\]]", ""),
        "kri-ktiv": RegexNormalizer(r'\[[^\[\]]{1,7}\]', ""),  # approximation for length of ktiv
        "english": RegexNormalizer(r'[A-Za-z]+', ""),
        "punctuation": RegexNormalizer(r'[.,"?!״:׃]+', ""),
        "hashem": RegexNormalizer(r"(^|\s)([\u05de\u05e9\u05d5\u05db\u05dc\u05d1]?)(?:\u05d4['\u05f3]|\u05d9\u05d9)($|\s)", "\1\2\u05d9\u05d4\u05d5\u05d4\3"),
        "elokim": RegexNormalizer(r"(^|\s)([\u05de\u05e9\u05d5\u05db\u05dc\u05d1]?)(?:\u05d0\u05dc\u05e7\u05d9\u05dd)($|\s)", "\1\2\u05d0\u05dc\u05d4\u05d9\u05dd\3"),
        "unidecode": TableReplaceNormalizer(UNIDECODE_TABLE),
        "maqaf": ReplaceNormalizer('־', ' '),
        "itag": ITagNormalizer(' '),
        "br-tag": ReplaceNormalizer('<br>', '<br/>'),
        "double-space": RegexNormalizer(r"\s+", " "),
    }

    @classmethod
    def get(cls, normalizer_key: str) -> AbstractNormalizer:
        return cls.key_normalizer_map[normalizer_key]

    @classmethod
    def get_all(cls, step_keys: List[str]) -> List[AbstractNormalizer]:
        cls.validate_keys(step_keys)
        return [cls.get(key) for key in step_keys]

    @classmethod
    def validate_keys(cls, step_keys: List[str]):
        if step_keys is None:
            raise Exception("step_keys and steps cannot both be None")
        nonexistant_keys = []
        for key in step_keys:
            if key not in cls.key_normalizer_map:
                nonexistant_keys += [key]
        if len(nonexistant_keys) > 0:
            raise Exception(f"Couldn't find the following keys in NormalizerComposer.key_normalizer_map:", ", ".join(nonexistant_keys))


class NormalizerByLang(AbstractNormalizer):

    def __init__(self, normalizers_by_lang: Dict[str, AbstractNormalizer]):
        """
        :param normalizers_by_lang: dict with keys that are letter lang codes (usually "en" or "he") and values that are subclasses of AbstractNormalizer
        """
        super().__init__()
        self.normalizers_by_lang = normalizers_by_lang

    def normalize(self, s: str, **kwargs) -> str:
        """
        :param lang: passed through kwargs. two letter lang code (usually "en" or "he") indicating which normalizer to apply
        """
        lang = kwargs.get('lang')
        if lang not in self.normalizers_by_lang: return s
        return self.normalizers_by_lang[lang].normalize(s, **kwargs)

    def find_text_to_remove(self, s:str, **kwargs) -> list:
        """
        :param lang: passed through kwargs. two letter lang code (usually "en" or "he") indicating which normalizer to apply
        """
        lang = kwargs.get('lang')
        if lang not in self.normalizers_by_lang: return []
        return self.normalizers_by_lang[lang].find_text_to_remove(s, **kwargs)


"""
Normalization tools for mapping chars to words and vice versa
"""


def char_indices_from_word_indices(input_string, word_ranges, split_regex=None):
    """
    ***Important***
    We use regular expression matching to solve this problem. We use the regex \s+ as default. This *should* replicate
    the behavior of str.split(), but use this with caution. It would be advisable to send the exact regex that was used
    to split the string in the first place.

    :param input_string: Original string that was split into a word list

    :param word_ranges: list of tuples, where each tuple represents a range of words from the word list.
    (first_word, last_word) where last_word is the actual index of the last word
    (the range of words would be word_list[first_word:last_word+1]).
    This matches the results returned from dibbur_hamtchil_matcher.match_text

    :param split_regex: Regular expression pattern to split. If none is supplied will use r'\s+'. see note above.
    :return:
    """

    if not split_regex:
        split_regex = r'\s+'
    regex = re.compile(split_regex)
    regex_normalizer = RegexNormalizer(split_regex, '')
    split_words = regex.split(input_string)
    count, word_indices = 0, []
    for word in split_words:
        start = count
        count += len(word)
        end = count
        word_indices.append((start, end))
    removal_map = regex_normalizer.get_mapping_after_normalization(input_string)
    normalized_char_indices = []
    for i, words in enumerate(word_ranges):
        first_word, last_word = [w if w < len(word_indices) else -1 for w in words]
        normalized_char_indices.append(
            (
                word_indices[first_word][0] if first_word >=0 else -1,
                word_indices[last_word][1] if last_word >= 0 else -1
            )
        )
    return regex_normalizer.convert_normalized_indices_to_unnormalized_indices(normalized_char_indices, removal_map)


@lru_cache(maxsize=32)
def get_word_indices(input_string, split_regex=r'\s+'):
    """
    helper method for word_index_from_char_index. Broken out for memoization purposes
    """
    return [r.end() for r in re.finditer(split_regex, input_string)]


def word_index_from_char_index(full_string, char_index, split_regex=r'\s+'):
    word_indices = get_word_indices(full_string, split_regex)
    return bisect_right(word_indices, char_index) if char_index >= 0 else -1


def sanitized_words_to_unsanitized_words(input_string, sanitized_string, sanitization_method, sanitized_word_ranges):
    normalizer = FunctionNormalizer(sanitization_method)
    removal_map = normalizer.get_mapping_after_normalization(input_string)
    sanitized_char_ranges = char_indices_from_word_indices(sanitized_string, sanitized_word_ranges)
    unsanitzied_char_ranges = normalizer.convert_normalized_indices_to_unnormalized_indices(sanitized_char_ranges, removal_map)
    # for char_range in unsanitied_char_ranges:
    #     word_range = tuple(word_index_from_char_index(input_string, i) for i in char_range)
    #     stuff.append(word_range)
    return [tuple(word_index_from_char_index(input_string, i) for i in char_range)
            for char_range in unsanitzied_char_ranges]


class TextSanitizer:
    """
    This class is designed so we can easily move from a list of segments to the flat list of words necessary
    for use in dibbur_hamatchil_matcher.match_text. It is primarily helpful when we need to keep track of text before and after edits were
    made to said text that were necessary for improving text matching.
    """
    def __init__(self, section: List[str], divider_pattern: str):
        self._original_segments = tuple(section)
        self._sanitized_segments = None
        self.sanitizer = None
        self._dividing_expression = divider_pattern

        # these variables hold the indices of the first word for each segment
        self._sanitzed_word_indices = None
        self._unsanitized_word_indices = None
        self._set_unsanitzed_word_indices()

    def get_original_segments(self):
        return self._original_segments

    def set_sanitizer(self, sanitizer: Callable[[str], str]):
        self.sanitizer = sanitizer

    def sanitize(self):
        if not self.sanitizer:
            raise AttributeError("no sanitization method set for this instance")
        self._sanitized_segments = tuple(self.sanitizer(x) for x in self._original_segments)
        self._set_sanitized_word_indices()

    def get_sanitized_segments(self):
        if self.sanitizer and not self._sanitized_segments:
            self.sanitize()
        return self._sanitized_segments

    def _set_unsanitzed_word_indices(self):
        self._unsanitized_word_indices = self.get_segment_start_indices(
            self._original_segments, self._dividing_expression)

    def _set_sanitized_word_indices(self):
        self._sanitzed_word_indices = self.get_segment_start_indices(
            self._sanitized_segments, self._dividing_expression
        )

    def get_unsanitized_word_indices(self):
        return tuple(self._unsanitized_word_indices)

    def get_sanitized_word_indices(self):
        if self._sanitzed_word_indices:
            return tuple(self._sanitzed_word_indices)
        elif self.sanitizer:
            self.sanitize()
            return tuple(self._sanitzed_word_indices)
        else:
            raise AttributeError('Cannot get sanitied word indices: No sanitizer set')

    def set_dividing_expression(self, regex_pattern: str):
        self._dividing_expression = regex_pattern

    @staticmethod
    def make_word_list(section, dividing_expression):
        word_list = []
        for segment in section:
            segment_list = re.split(dividing_expression, segment)
            word_list.extend(segment_list)
        return word_list

    def get_sanitized_word_list(self):
        if not self._sanitized_segments:
            if self.sanitizer:
                self.sanitize()
            else:
                raise AttributeError("Sanitizer not set")
        return self.make_word_list(self._sanitized_segments, self._dividing_expression)

    def get_unsanitized_word_list(self):
        return self.make_word_list(self._original_segments, self._dividing_expression)

    @staticmethod
    def get_segment_start_indices(segment_list, divider_pattern):
        """
        Calculates the word number at which each segment starts. Helpful if trying to move from a flat list of words
        back to a segment division.
        :param segment_list:
        :param divider_pattern:
        :return:
        """
        segment_start_indices = []
        word_count = 0
        for segment in segment_list:
            segment_start_indices.append(word_count)
            word_count += len(re.split(divider_pattern, segment))

        return segment_start_indices

    @staticmethod
    def get_segment_index_from_word_index(word_index, start_segment_list):
        return bisect_right(start_segment_list, word_index) - 1

    def check_sanitized_index(self, word_index: int):
        """
        given a word index from a sanitized word list, find what segment it originated from
        """
        return self.get_segment_index_from_word_index(word_index, self._sanitzed_word_indices)

    def check_unsanitized_word_index(self, word_index:int):
        return self.get_segment_index_from_word_index(word_index, self._unsanitized_word_indices)