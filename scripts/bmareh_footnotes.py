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

Seven.9 has multiple dividers.
It will be easiest to just hardcode the segment numbers that contain the footnotes for those sections
"""

import re
from sefaria.model import *
import requests


def run_on_books(cb, *args, **kwargs):
    """
    Run a method on all indices relevant to this project
    :param function cb: Callback function that takes an index as it's first argument
    :return: Dict with keys=booktitles, and values=callback return values
    """
    results = {}
    for i in IndexSet({'title': re.compile(r".*B'Mareh.*")}).array():
        results[i.title] = cb(i, *args, **kwargs)
    return results


def all_sections_have_single_divider(book_index):
    """
    :param Index book_index:
    :return:
    """
    success = True
    sections = book_index.all_section_refs()
    for section in sections:
        dividers = re.findall(r'<br> ?_+ ?(<br>)?', ''.join(section.text('he').text))
        if len(dividers) > 1:
            print('{} has extra divider'.format(section.normal()))
            success = False
        elif len(dividers) < 1:
            print('{} has no divider'.format(section.normal()))
            success = False
    return success


def border_segment(segment_list):
    """
    Get the ref that is the barrier between main text and footnotes
    :param segment_list:
    :return: segment ref
    """
    for segment in segment_list:
        if re.search(r'<br> ?_+ ?(<br>)?', segment.text('he').text):
            return segment
    return


def footnote_segments(section_ref):
    """
    Get the segments that represent the footnotes
    :param Ref section_ref:
    :return: ranged segment ref
    """
    if section_ref == Ref("B'Mareh HaBazak Part Seven 9"):
        return Ref("B'Mareh HaBazak Part Seven 9:11-44")

    segments = section_ref.all_segment_refs()
    border = border_segment(segments)
    if border:
        return border.next_segment_ref().to(segments[-1])


def main_segments(section_ref):
    segments = section_ref.all_segment_refs()
    border = border_segment(segments)
    if border:
        return segments[0].to(border)


def compare_footnote_markers_to_comments(section_ref):
    """
    Make sure a given section has a 1-to-1 matching of footnotes to comments
    :param Ref section_ref:
    :return:
    """
    body, footnotes = main_segments(section_ref), footnote_segments(section_ref)
    if body is None and footnotes is None:
        return True

    body_markers = [m.group(1) for segment in body.all_segment_refs()
                    for m in re.finditer(r'<sup>(\d{,2})</sup>', segment.text('he').text)]
    footers = [m.group(1) for segment in footnotes.all_segment_refs()
                    for m in re.finditer(r'^ *<sup>(\d{,2})</sup>', segment.text('he').text)]
    return body_markers == footers


def all_sections_match_markers(index):
    """
    :param Index index:
    :return:
    """
    success = True
    for section in index.all_section_refs():
        if not compare_footnote_markers_to_comments(section):
            print("Mismatch found in {}".format(section.normal()))
            success = False
    return success


def border_is_last_segment(index):
    """
    :param Index index:
    :return:
    """
    sections = index.all_section_refs()
    success = True
    for section in sections:
        segments = section.all_segment_refs()
        border = border_segment(segments)
        if border == segments[-1]:
            success = False
            print("Bad border at {}".format(section.normal()))
    return success


def locate_double_sup(index):
    sections = index.all_section_refs()
    for section in sections:
        segments = section.all_segment_refs()
        for segment in segments:
            if re.search('<sup>\d{,2},\d{,2}</sup>', segment.text('he').text):
                print("Problem in {}".format(segment.normal()))


def fix_footnotes(section):
    """
    :param Ref section:
    :return:
    """
    def generate_footnote_dict(footnote_ref):
        footnote_dict, holder = {}, []
        f_value = None
        for f_segment in footnote_ref.all_segment_refs():
            t = f_segment.text('he', f_segment.version_list()[0]['versionTitle']).text
            match = re.match(r'^ *<sup>(\d{,2})</sup>', t)
            if match:
                if f_value is None:  # This is the first footnote
                    assert len(holder) == 0
                else:
                    assert len(holder) > 0
                    footnote_dict[f_value] = '<br>'.join(holder)
                f_value = match.group(1)
                holder = [re.sub(r'^ *<sup>\d{,2}</sup> *', '', t)]
            else:
                holder.append(t)
        else:
            footnote_dict[f_value] = '<br>'.join(holder)

        return footnote_dict

    main_body, footnotes = main_segments(section), footnote_segments(section)
    if main_body is None or footnotes is None:
        return

    replacement_map = generate_footnote_dict(footnotes)

    def repl(m):
        return '{}<i class="footnote">{}</i>'.format(m.group(), replacement_map[m.group(1)])

    for segment in main_body.all_segment_refs():
        chunk = segment.text('he', segment.version_list()[0]['versionTitle'])
        fixed_text = re.sub('<sup>(\d{,2})</sup>', repl, chunk.text)
        chunk.text = fixed_text
        chunk.save()

    # Clean up original footnotes
    section_chunk = section.text('he', section.version_list()[0]['versionTitle'])
    text_list = section_chunk.text
    text_list[main_body.toSections[-1]-1] = re.sub(r'<br> ?_+ ?(<br>)?', '', text_list[main_body.toSections[-1]-1])
    del text_list[footnotes.sections[-1]-1:footnotes.toSections[-1]]
    section_chunk.text = text_list
    section_chunk.save(force_save=True)


def update_from_prod(ref):
    """
    :param Ref ref:
    :return:
    """
    vtitle = ref.version_list()[0]['versionTitle']
    url = 'https://www.sefaria.org/api/texts/{}/he/{}'.format(ref.url(), vtitle)
    result = requests.get(url, params={'commentary': 0, 'pad': 0})
    he = result.json()['he']
    tc = ref.text('he', vtitle)
    tc.text = he
    tc.save()
    ref.index.versionState().refresh()


def fix_footnotes_on_book(index):
    for section in index.all_section_refs():
        fix_footnotes(section)

run_on_books(fix_footnotes_on_book)
