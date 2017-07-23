# encoding=utf-8

"""
Script to convert Footnotes in B'Mareh HaBazak to standard footnote format. At the time this project was issued, the
footnotes looked like this:

***
Text Text<sup>1</sup> Text Text....
~~~<sup>2</sup>~~~
~~~~
<br>______<br>
<sup>1</sup> Footnote text
<sup>2</sup> Footnote text
***

The objective of this script is to move to the standard footnote scheme:
***
Lorem ipsum dolor sit amet, <sup>1</sup><i class="footnote>The text inside the footnote</i>consectetur adipiscing elit.
***

Method:
1) Check the each section contains one and only one segment with the <br>_____<br> pattern
2) Assuming that holds up, use pattern to identify footnotes and footnote markers.
3) Check that a 1-to-1 matching can be established between footnote markers and footnotes.
4) Set up proper footnotes. Footnotes can be long; combine paragraphs with <br> tags.
5) Remove <br>_____<br> and everything below.


The following sections are missing dividers (but still have footnotes):
Part Six.70
Part Six.71
Part Five.16
Part Five.17

Seven.9 has multiple dividers.
It will be easiest to just hardcode the segment numbers that contain the footnotes for those sections
"""

import re
from sefaria.model import *


def run_on_books(cb, *args, **kwargs):
    """
    Run a method on all indices relevant to this project
    :param function cb: Callback function that takes an index as it's first argument
    :return: Dict with keys=booktitles, and values=callback return values
    """
    results = {}
    for i in IndexSet({'title': re.compile(ur".*B'Mareh.*")}).array():
        results[i.title] = cb(i, *args, **kwargs)
    return results


def all_sections_have_single_divider(book_index):
    """
    :param Index book_index:
    :return:
    """
    def has_single_divider(section_ref):
        """
        Make sure a single section has only 1 and only 1 segment with the pattern <br>_____<br>
        :param section_ref: List of strings
        :return: bool
        """
        dividers = re.findall(ur'<br>_+<br>', u''.join(section_ref))
        return len(dividers) == 1

    success = True
    sections = book_index.all_section_refs()
    for section in sections:
        dividers = re.findall(ur'<br> ?_+ ?(<br>)?', u''.join(section.text('he').text))
        if len(dividers) > 1:
            print u'{} has extra divider'.format(section.normal())
            success = False
        elif len(dividers) < 1:
            print u'{} has no divider'.format(section.normal())
            success = False
    return success

r = run_on_books(all_sections_have_single_divider)
for key, value in r.iteritems():
    print u'{}: {}'.format(key, value)

