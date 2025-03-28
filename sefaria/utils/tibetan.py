from sefaria.system.decorators import memoized
import regex

any_tibetan = regex.compile(r"\p{Tibetan}")
any_english = regex.compile(r"[a-zA-Z]")


@memoized
def english_number_from_tibetan_number(number_string):
    number_mapping = {
        "༠": "0",
        "༡": "1",
        "༢": "2",
        "༣": "3",
        "༤": "4",
        "༥": "5",
        "༦": "6",
        "༧": "7",
        "༨": "8",
        "༩": "9",
    }
    return number_mapping.get(number_string, "0")


@memoized
def tibetan_number_from_english_number(number_string):
    number_mapping = {
        "0": "༠",
        "1": "༡",
        "2": "༢",
        "3": "༣",
        "4": "༤",
        "5": "༥",
        "6": "༦",
        "7": "༧",
        "8": "༨",
        "9": "༩",
    }
    return number_mapping.get(number_string, "༠༠")


def int_to_tib(number: int):
    if number < 10:
        tib_num = tibetan_number_from_english_number(number_string=str(number))
        return '༠' + tib_num
    else:
        num_str = str(number)
        tibetan_numeral_string = "".join([tibetan_number_from_english_number(digit) for digit in num_str])
        return tibetan_numeral_string


def tib_to_int(num_str):
    int_num = "".join([english_number_from_tibetan_number(digit) for digit in num_str])
    return int(int_num)


def has_tibetan(s):
    return any_tibetan.search(s)


def is_all_tibetan(s):
    return any_tibetan.search(s) and not any_english.search(s)


def convert_to_tibetan_numerals(text):
    """Convert Arabic numerals to Tibetan numerals using regex"""
    tibetan_numerals = {
        '0': '༠',
        '1': '༡', 
        '2': '༢',
        '3': '༣',
        '4': '༤',
        '5': '༥',
        '6': '༦',
        '7': '༧',
        '8': '༨',
        '9': '༩',
        ':': '.',
        '-': '-'
    }
    # Find all numeral patterns (including colon notation and ranges)
    numeral_pattern = regex.compile(r'\d+(?::\d+)?(?:-\d+)?')
    return numeral_pattern.sub(lambda match: ''.join(tibetan_numerals.get(char, char) for char in match.group()), text)
