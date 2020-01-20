# encoding=utf-8

import sys
import django
django.setup()
from sefaria.model import *
from bs4 import BeautifulSoup
from collections import OrderedDict

c1 = Category().load({'path':  ["Halakhah", "Shulchan Arukh", "Commentary", "Beit Shmuel"]})
c2 = Category().load({'path':  ["Halakhah", "Shulchan Arukh", "Commentary", "Chelkat Mechokek"]})
if c1 is None or c2 is None:
    print("Missing Categories")
    sys.exit(1)

#  Ensure indices have the index set up properly
baer = library.get_index("Ba'er Hetev on Shulchan Arukh, Even HaEzer")
baer.collective_title = "Ba'er Hetev"
baer.dependence = "Commentary"
baer.base_text_titles = ["Shulchan Arukh, Even HaEzer"]
baer.save()

beit = library.get_index("Beit Shmuel")
beit.collective_title = "Beit Shmuel"
beit.dependence = "Commentary"
beit.base_text_titles = ["Shulchan Arukh, Even HaEzer"]
if len(beit.categories) == 2:
    beit.categories.extend(["Commentary", "Beit Shmuel"])
beit.save()

chelk = library.get_index("Chelkat Mechokek")
chelk. collective_title = "Chelkat Mechokek"
chelk.dependence = "Commentary"
chelk.base_text_titles = ["Shulchan Arukh, Even HaEzer"]
if len(chelk.categories) == 2:
    chelk.categories.extend(["Commentary", "Chelkat Mechokek"])
chelk.save()


def itag_finder(commentator):
    def finder(tag):
        return tag.name == 'i' and tag.has_attr('data-commentator') and tag['data-commentator'] == commentator
    return finder


def is_sorted(x, key=None):
    if key is not None:
        x = [key(i) for i in x]
    return all(x[i] < x[i+1] for i in range(len(x)-1))


def add_inline_ref(link, itag):
    irefs = {
        'data-commentator': itag['data-commentator'],
        'data-order': itag['data-order'],
    }
    link.inline_reference = irefs
    link.save()


def fix_links(commentator):
    def link_sort_key(link_obj):
        if Ref(link_obj.refs[0]).index.title == Ref(commentator).index.title:
            return Ref(link_obj.refs[0]).sections
        else:
            return Ref(link_obj.refs[1]).sections

    collective_title = library.get_index(commentator).collective_title
    orach_ref = Ref("Shulchan Arukh, Even HaEzer").default_child_ref()
    halitza_ref = Ref("Shulchan Arukh, Even HaEzer, Seder Halitzah")

    for r in (orach_ref.all_segment_refs() + halitza_ref.all_segment_refs()):
        try:
            if r.sections[0] % 20 == 1 and r.sections[1] == 1:
                print(r.sections[0], end=' ')
        except IndexError:
            pass
        t = r.text('he', 'Apei Ravrevei: Shulchan Aruch Even HaEzer, Lemberg, 1886')
        total_links = [l[0] for l in LinkSet(r).refs_from(Ref(commentator), as_link=True)]
        total_links = sorted(total_links, key=link_sort_key)
        soup = BeautifulSoup('<root>{}</root>'.format(t.text), 'xml')
        total_itags = soup.find_all(itag_finder(collective_title))

        if len(total_links) != len(total_itags):
            total_itags = list(OrderedDict.fromkeys(total_itags))
            if len(total_links) != len(total_itags):
                print("\nProblem with {} at {}. Skipping".format(collective_title, r.normal()))
                continue

        if not is_sorted(total_links, key=link_sort_key):
            print("Links not in order at {} Skipping".format(r.normal()))
            continue

        if is_sorted(total_itags, key=lambda x: int(x['data-order'])):
            for l, itag in zip(total_links, total_itags):
                add_inline_ref(l, itag)
        else:
            print("\nOut of order at {}".format(r.normal()))


fix_links("Ba'er Hetev on Shulchan Arukh, Even HaEzer")
fix_links("Beit Shmuel")
fix_links("Chelkat Mechokek")
