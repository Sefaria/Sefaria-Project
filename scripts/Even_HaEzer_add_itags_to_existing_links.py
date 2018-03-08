# encoding=utf-8

from sefaria.model import *
from bs4 import BeautifulSoup


def itag_finder(commentator):
    def finder(tag):
        return tag.name == 'i' and tag.has_attr('data-commentator') and tag['data-commentator'] == commentator
    return finder


def is_sorted(x, key=None):
    if key is not None:
        x = [key(i) for i in x]
    return all(x[i] < x[i+1] for i in xrange(len(x)-1))


def add_inline_ref(link, itag):
    irefs = {
        'data-commentator': itag['data-commentator'],
        'data-order': itag['data-order'],
    }
    link.inline_reference = irefs
    link.save()


def fix_links(commentator):
    collective_title = library.get_index(commentator).collective_title
    orach_ref = Ref("Shulchan Arukh, Orach Chayim")

    for r in orach_ref.all_segment_refs():
        if r.sections[0] % 20 == 1 and r.sections[1] == 1:
            print r.sections[0],
        t = r.text('he', u'Maginei Eretz: Shulchan Aruch Orach Chaim, Lemberg, 1893')
        total_links = [l[0] for l in LinkSet(r).refs_from(Ref(commentator), as_link=True)]
        soup = BeautifulSoup(u'<root>{}</root>'.format(t.text), 'xml')
        total_itags = soup.find_all(itag_finder(collective_title))

        if len(total_links) != len(total_itags):
            print "\nProblem with {} at {}. Skipping".format(collective_title, r.normal())
            continue

        if is_sorted(total_itags, key=lambda x: int(x['data-order'])):
            for l, itag in zip(total_links, total_itags):
                add_inline_ref(l, itag)
        else:
            print "\nOut of order at {}".format(r.normal())


fix_links("Ba'er Hetev on Shulchan Arukh, Orach Chayim")
fix_links("Magen Avraham")
