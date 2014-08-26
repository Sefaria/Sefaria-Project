"""
Miscellaneous functions for Sefaria.
"""

from HTMLParser import HTMLParser


def list_depth(x):
    """
    returns 1 for [], 2 for [[]], etc.
    special case: doesn't count a level unless all elements in
    that level are lists, e.g. [[], ""] has a list depth of 1
    """
    if len(x) > 0 and all(map(lambda y: isinstance(y, list), x)):
        return 1 + list_depth(x[0])
    else:
        return 1


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
    Returns true if text (a list, or list of lists) is emtpy or contains
    only "" or 0.
    """
    text = flatten_jagged_array(text)

    text = [t if t != 0 else "" for t in text]
    return not len("".join(text))


def union(a, b):
    """ return the union of two lists """
    return list(set(a) | set(b))


class MLStripper(HTMLParser):
    def __init__(self):
        self.reset()
        self.fed = []
    def handle_data(self, d):
        self.fed.append(d)
    def get_data(self):
        return ' '.join(self.fed)


def strip_tags(html):
	"""
	Returns the text of html with tags stripped.
	Customized to insert a space between adjacent tags after stripping.
	"""
	html = html or ""
	s = MLStripper()
	s.feed(html)
	return s.get_data()


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
