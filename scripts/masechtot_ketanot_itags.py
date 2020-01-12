# encoding=utf-8

from sefaria.model import *
from bs4 import BeautifulSoup

"""
Grab all indices in category Masechtot Ketanot
Get all segment refs for each index
Get LinkSet for each segment ref
At each segment ref, scan text for itags
For each itag data-commentator filter the LinkSet
Grab each link and add appropriate fields
"""


def grab_itag_commetators(segment_ref):
    seg_text = segment_ref.text('he').text
    soup = BeautifulSoup('<root>{}</root>'.format(seg_text), 'xml')
    itags = soup.find_all(lambda x: x.name == 'i' and x.has_attr('data-commentator'))

    return set(["{}".format(i['data-commentator']) for i in itags])


def fix_links(seg_ref, commentators, test_mode=False):
    linkset = LinkSet(seg_ref)
    for commentator in commentators:
        subset = linkset.filter('{} on {}'.format(commentator, seg_ref.book))

        for link_obj in subset:
            comment_ref = Ref(link_obj.refs[1])
            if getattr(comment_ref.index, 'collective_title', '') != commentator:
                comment_ref = Ref(link_obj.refs[0])
            assert comment_ref.index.collective_title == commentator

            link_obj.inline_reference = {'data-commentator': commentator, 'data-order': comment_ref.sections[-1]}
            if test_mode:
                print(vars(link_obj))
            else:
                link_obj.save()

masechtot = library.get_indexes_in_category("Masechtot Ketanot")
for masechet in masechtot:
    r = Ref(masechet)
    if r.has_default_child():
        r = r.default_child_ref()
    segs = r.all_segment_refs()
    for segment in segs:
        i_commentators = grab_itag_commetators(segment)
        fix_links(segment, i_commentators)
