# encoding=utf-8

import re
import copy
import argparse
from sefaria.model.text import library, Ref
from bs4 import BeautifulSoup, Tag, NavigableString
from sefaria.helper.link import rebuild_links_from_text


class SegementFixer:

    def __init__(self):
        self.soup = BeautifulSoup(u'', 'html5lib')
        self.valid_classes = {'gemarra-italic', 'gemarra-regular', 'it-text'}

    def standardize_tag(self, element):
        """
        :param Tag element:
        """

        if element.name != 'span':
            return

        if len(element['class']) > 1:
            for loc, klass in enumerate(element['class']):
                if klass not in self.valid_classes:
                    element['class'].pop(loc)

        previous_element = element.previousSibling
        if previous_element is None:
            self.standardize(element)

        elif isinstance(previous_element, NavigableString):
            if previous_element.isspace():
                element.insert(0, previous_element)
                self.standardize_tag(element)
                return

            else:
                self.standardize(element)
                return

        elif element['class'] == ['it-text']:
            if previous_element.name == 'i':
                previous_element.append(element)
            self.standardize(element)

        elif element['class'] == ['gemarra-regular']:
            if previous_element.name == 'b':
                previous_element.append(element)
            self.standardize(element)

        elif element['class'] == ['gemarra-italic']:
            """
            The idea here is to drop to a simpler case in the event of a merge. So if this is preceded by a b tag,
            merge into the b tag, but change the class so that it represents an i tag. Then this method can be run again
            on the simple case of something that needs to be converted or merged into i.
            """

            if previous_element.name == 'b':
                previous_element.append(element)
                element['class'] = ['it-text']
                self.standardize_tag(element)

            elif previous_element.name == 'i':
                previous_element.append(element)
                element['class'] = ['gemarra-regular']
                self.standardize_tag(element)

            else:
                self.standardize(element)

    def standardize(self, span):
        """
        :param Tag span:
        """
        if span['class'] == [u'it-text']:
            if span.parent.name == 'i':
                span.unwrap()
            else:
                span.name = 'i'

        elif span['class'] == [u'gemarra-regular']:
            if span.parent.name == 'b':
                span.unwrap()
            else:
                span.name = 'b'

        elif span['class'] == [u'gemarra-italic']:
            if span.parent.name == 'b' or span.parent.name == 'i':
                raise AttributeError("gemarra-italic cannot have 'b' or 'i' as a parent!")
            else:
                span.name = 'i'
                span.wrap(self.soup.new_tag('b'))
        else:
            raise AttributeError("Eelement has no valid class")
        for attr in span.attrs.keys():
            del span[attr]

    def fix_segment(self, input_text):
        self.soup = BeautifulSoup(u'<body>{}</body>'.format(input_text), 'html5lib')
        for element in list(self.soup.body.children):
            self.standardize_tag(element)
        cleaned = u''.join([unicode(i) for i in self.soup.body.children])
        cleaned = re.sub(ur'<i> (.*?)</i>', ur' <i>\1</i>',cleaned)
        cleaned = re.sub(ur'<b> (.*?)</b>', ur' <b>\1</b>', cleaned)
        cleaned = re.sub(ur'<i>(.*?) </i>', ur'<i>\1</i> ', cleaned)
        cleaned = re.sub(ur'<b>(.*?) </b>', ur'<b>\1</b> ', cleaned)
        return cleaned


def fix_tractate(tractate):
    chunk = Ref(tractate).text('en', 'William Davidson Edition - English')
    text_array = copy.deepcopy(chunk.text)
    fixer = SegementFixer()

    for daf in text_array:
        for loc, segment in enumerate(daf[:]):
            assert isinstance(segment, basestring)
            daf[loc] = fixer.fix_segment(segment)

    chunk.text = text_array
    chunk.save()


def span_attrs(tractate_list=None):
    classes = set()
    if tractate_list is None:
        tractate_list = library.get_indexes_in_category("Bavli")[:22]
    if isinstance(tractate_list, basestring):
        tractate_list = [tractate_list]
    for tractate in tractate_list:
        print tractate
        text_array = Ref(tractate).text('en', 'William Davidson Edition - English').text

        for daf in text_array:
            daf_text = u' '.join(daf)
            soup = BeautifulSoup(daf_text, 'html5lib')
            spans = soup.find_all('span')
            for span in spans:
                for item in span['class']:
                    classes.add(item)

    if len(classes) < 50:
        for i in classes:
            print i
    else:
        print "Found lots and lots of things"


if __name__ == '__main__':

    argparser = argparse.ArgumentParser()
    argparser.add_argument("-l", "--link", action="store_true", help="Pass this flag to link the text. Requires a user id to run")
    argparser.add_argument("-u", "--user", default=-1, type=int, help="User id for the auto-linker")

    arguments = argparser.parse_args()
    if arguments.link:
        if arguments.user <= 0:
            raise argparse.ArgumentTypeError("A user id must be supplied if linking is desired")

    for tractate in library.get_indexes_in_category('Bavli')[:22]:
        print "formatting tractate {}".format(tractate)
        fix_tractate(tractate)
        if arguments.link:
            rebuild_links_from_text(tractate, arguments.user)


