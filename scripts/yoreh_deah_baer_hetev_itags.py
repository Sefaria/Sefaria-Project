# encoding=utf-8

import django
django.setup()
from sefaria.model import *
from bs4 import BeautifulSoup
from collections import OrderedDict

def itag_finder(tag):
    commentator = "Ba'er Hetev"
    return tag.name == 'i' and tag.has_attr('data-commentator') and tag['data-commentator'] == commentator


def is_sorted(x, key=None):
    if key is not None:
        x = [key(i) for i in x]
    return all(i < j for i, j in zip(x[:-1], x[1:]))


def add_inline_ref(link_obj, itag):
    irefs = {
        'data-commentator': itag['data-commentator'],
        'data-order': itag['data-order'],
    }
    link_obj.inline_reference = irefs
    link_obj.save()


def set_link_sort_key(commentator):
    def link_sort_key(link_obj):
        if Ref(link_obj.refs[0]).index.title == Ref(commentator).index.title:
            return Ref(link_obj.refs[0]).sections
        else:
            return Ref(link_obj.refs[1]).sections
    return link_sort_key


def fix_links(commentator):
    link_sort_key = set_link_sort_key(commentator)
    collective_title = library.get_index(commentator).collective_title
    yoreh_ref = Ref("Shulchan Arukh, Yoreh De'ah")
    version_title = "Shulchan Arukh, Yoreh De'ah Lemberg PlaceHolder VersionTitle"
    if version_title == "Shulchan Arukh, Yoreh De'ah Lemberg PlaceHolder VersionTitle":
        print("\033[91mUsing the placeholder versionTitle - this needs to be fixed ASAP!!!\033[0m")

    for segment in yoreh_ref.all_segment_refs():
        try:
            if segment.sections[0] % 20 == 1 and segment.sections[1] == 1:
                print(segment.sections[0], end=' ')
        except IndexError:
            pass

        segment_text = segment.text('he', version_title)
        total_links = sorted([l[0] for l in LinkSet(segment).refs_from(Ref(commentator), as_link=True)],
                             key=link_sort_key)
        soup = BeautifulSoup('<root>{}</root>'.format(segment_text.text), 'xml')
        total_itags = soup.find_all(itag_finder)

        if len(total_links) != len(total_itags):
            # Remove possible duplicates from itags
            total_itags = list(OrderedDict.fromkeys(total_itags))
            if len(total_links) != len(total_itags):
                print("Problem with Ba'er Hetev at {}. Skipping".format(segment.normal()))
                continue

        if not is_sorted(total_links, key=link_sort_key):
            print("Links not in order at {}. Skipping".format(segment.normal()))
            continue

        if is_sorted(total_itags, key=lambda x: int(x['data-order'])):
            for l, itag in zip(total_links, total_itags):
                add_inline_ref(l, itag)
        else:
            print("itags out of order at {}".format(segment.normal()))


if __name__ == '__main__':
    # make sure index is set up properly
    baer = library.get_index("Ba'er Hetev on Shulchan Arukh, Yoreh De'ah")
    baer.collective_title = "Ba'er Hetev"
    baer.dependence = "Commentary"
    baer.base_text_titles = ["Shulchan Arukh, Yoreh De'ah"]
    baer.save()

    fix_links("Ba'er Hetev on Shulchan Arukh, Yoreh De'ah")

