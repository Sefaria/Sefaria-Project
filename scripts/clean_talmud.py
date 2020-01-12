# encoding=utf-8

import re
import copy
import argparse
from sefaria.model import *
from bs4 import BeautifulSoup, Tag, NavigableString
from sefaria.helper.link import rebuild_links_from_text

mesechtot = ["Berakhot", "Shabbat", "Eruvin", "Pesachim", "Beitzah", "Chagigah", "Gittin", "Ketubot", "Kiddushin",
             "Megillah", "Moed Katan", "Nazir", "Nedarim", "Rosh Hashanah", "Sotah", "Sukkah", "Taanit", "Yevamot",
             "Yoma", "Bava Kamma", "Bava Metzia", "Bava Batra"]

class SegementFixer:

    def __init__(self):
        self.soup = BeautifulSoup('', 'html5lib')
        self.valid_classes = {'gemarra-italic', 'gemarra-regular', 'it-text'}

    def standardize_tag(self, element):
        """
        Takes an html "span" element and attempts to merge into an identical neighbor, then calls standardize
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
            self._standardize(element)

        elif isinstance(previous_element, NavigableString):
            if previous_element.isspace():
                element.insert(0, previous_element)
                self.standardize_tag(element)
                return

            else:
                self._standardize(element)
                return

        elif element['class'] == ['it-text']:
            if previous_element.name == 'i':
                previous_element.append(element)
            self._standardize(element)

        elif element['class'] == ['gemarra-regular']:
            if previous_element.name == 'b':
                previous_element.append(element)
            self._standardize(element)

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
                self._standardize(element)

    def _standardize(self, span):
        """
        Converts <span> elements with css attributes into <b> or <i> elements. Removes redundant elements and all css
        attributes.
        :param Tag span:
        """
        if span['class'] == ['it-text']:
            if span.parent.name == 'i':
                span.unwrap()
            else:
                span.name = 'i'

        elif span['class'] == ['gemarra-regular']:
            if span.parent.name == 'b':
                span.unwrap()
            else:
                span.name = 'b'

        elif span['class'] == ['gemarra-italic']:
            if span.parent.name == 'b' or span.parent.name == 'i':
                # This requirement is fulfilled within the logic of standaridze_tag.
                raise AttributeError("gemarra-italic cannot have 'b' or 'i' as a parent!")
            else:
                span.name = 'i'
                span.wrap(self.soup.new_tag('b'))
        else:
            raise AttributeError("Eelement has no valid class")
        for attr in list(span.attrs.keys()):
            del span[attr]

    def fix_segment(self, input_text):
        self.soup = BeautifulSoup('<body>{}</body>'.format(input_text), 'html5lib')
        for element in list(self.soup.body.children):
            self.standardize_tag(element)
        cleaned = ''.join([str(i) for i in self.soup.body.children])
        cleaned = re.sub('\s+', ' ', cleaned)
        cleaned = re.sub(r'<i> (.*?)</i>', r' <i>\1</i>',cleaned)
        cleaned = re.sub(r'<b> (.*?)</b>', r' <b>\1</b>', cleaned)
        cleaned = re.sub(r'<i>(.*?) </i>', r'<i>\1</i> ', cleaned)
        cleaned = re.sub(r'<b>(.*?) </b>', r'<b>\1</b> ', cleaned)
        return cleaned.strip()


def fix_tractate(tractate):
    chunk = Ref(tractate).text('en', 'William Davidson Edition - English')
    text_array = copy.deepcopy(chunk.text)
    fixer = SegementFixer()

    for daf in text_array:
        for loc, segment in enumerate(daf[:]):
            assert isinstance(segment, str)
            daf[loc] = fixer.fix_segment(segment)

    chunk.text = text_array
    chunk.save()


def span_attrs(tractate_list=None):
    classes = set()
    if tractate_list is None:
        tractate_list = mesechtot
    if isinstance(tractate_list, str):
        tractate_list = [tractate_list]
    for tractate in tractate_list:
        print(tractate)
        text_array = Ref(tractate).text('en', 'William Davidson Edition - English').text

        for daf in text_array:
            daf_text = ' '.join(daf)
            soup = BeautifulSoup(daf_text, 'html5lib')
            spans = soup.find_all('span')
            for span in spans:
                for item in span['class']:
                    classes.add(item)

    if len(classes) < 50:
        for i in classes:
            print(i)
    else:
        print("Found lots and lots of things")


class SegmentFixerTester(object):

    @staticmethod
    def test_base_cases():
        fixer = SegementFixer()

        test_bold = '<span class="gemarra-regular">this should be bold</span>'
        test_italic = '<span class="it-text">this should be italic</span>'
        test_combined = '<span class="gemarra-italic">this should be bold and italic</span>'
        test_extra_class = '<span class="gemarra-regular other_class">this should be bold</span>'

        assert fixer.fix_segment(test_bold) == '<b>this should be bold</b>'
        assert fixer.fix_segment(test_italic) == '<i>this should be italic</i>'
        assert fixer.fix_segment(test_combined) == '<b><i>this should be bold and italic</i></b>'
        assert fixer.fix_segment(test_extra_class) == '<b>this should be bold</b>'

    @staticmethod
    def test_merging():
        fixer = SegementFixer()

        bold = '<span class="gemarra-regular">this should be bold</span> <span class="gemarra-regular">so should this</span>'
        no_merge = '  <span class="gemarra-regular">this should be bold</span> some text <span class="gemarra-regular">so should this</span> '
        italic = '<span class="it-text">this should be italic</span> <span class="it-text">so should this</span>'
        no_merge_italic = '<span class="it-text">this should be italic</span> some text <span class="it-text">so should this</span>  '
        b_and_i = '  <span class="gemarra-regular">this should be bold</span> <span class="it-text">this is italic</span>'
        void_tag = 'mishnah <br> <span class="gemarra-regular">this should be bold</span> <span class="gemarra-regular">so should this</span>'

        assert fixer.fix_segment(bold) == '<b>this should be bold so should this</b>', fixer.fix_segment(bold)
        assert fixer.fix_segment(no_merge) == '<b>this should be bold</b> some text <b>so should this</b>', fixer.fix_segment(no_merge)
        assert fixer.fix_segment(italic) == '<i>this should be italic so should this</i>', fixer.fix_segment(italic)
        assert fixer.fix_segment(no_merge_italic) == '<i>this should be italic</i> some text <i>so should this</i>', fixer.fix_segment(no_merge_italic)
        assert fixer.fix_segment(b_and_i) == '<b>this should be bold</b> <i>this is italic</i>', fixer.fix_segment(b_and_i)
        assert fixer.fix_segment(void_tag) == 'mishnah <br/> <b>this should be bold so should this</b>', fixer.fix_segment(void_tag)

    @staticmethod
    def test_gemarra_italic():
        fixer = SegementFixer()

        bold_before = '<span class="gemarra-regular">this should be bold</span> <span class="gemarra-italic">this is italic</span>'
        bold_after = '<span class="gemarra-italic">this should be bold and italic</span> <span class="gemarra-regular">this is just bold</span>'
        italic_before = '<span class="it-text">this should be italic</span> <span class="gemarra-italic">this is bold</span>'
        italic_after = '<span class="gemarra-italic">this should be bold and italic</span> <span class="it-text">this is just italic</span>'
        consecutive = '<span class="gemarra-italic">this should be bold and italic</span> <span class="gemarra-italic">so should this</span>'
        recursive = '<span class="gemarra-regular">this is bold</span> <span class="gemarra-italic">this should be bold and italic</span> <span class="gemarra-italic">so should this</span>'

        assert fixer.fix_segment(bold_before) == '<b>this should be bold <i>this is italic</i></b>'
        assert fixer.fix_segment(bold_after) == '<b><i>this should be bold and italic</i> this is just bold</b>'
        assert fixer.fix_segment(italic_before) == '<i>this should be italic <b>this is bold</b></i>'
        assert fixer.fix_segment(
            italic_after) == '<b><i>this should be bold and italic</i></b> <i>this is just italic</i>'
        assert fixer.fix_segment(consecutive) == '<b><i>this should be bold and italic so should this</i></b>'
        assert fixer.fix_segment(
            recursive) == '<b>this is bold <i>this should be bold and italic so should this</i></b>'

    @staticmethod
    def run_tests():
        SegmentFixerTester.test_base_cases()
        SegmentFixerTester.test_merging()
        SegmentFixerTester.test_gemarra_italic()
        print("All tests passes successfully")


if __name__ == '__main__':

    argparser = argparse.ArgumentParser()
    argparser.add_argument("-l", "--link", action="store_true", help="Pass this flag to link the text. Requires a user id to run")
    argparser.add_argument("-u", "--user", default=-1, type=int, help="User id for the auto-linker")
    argparser.add_argument("-t", "--test", action="store_true", help="Run the tests without making any changes")

    arguments = argparser.parse_args()
    if arguments.test:
        SegmentFixerTester.run_tests()
        import sys
        sys.exit(0)

    if arguments.link:
        if arguments.user <= 0:
            raise argparse.ArgumentTypeError("A user id must be supplied if linking is desired")

    for tractate in mesechtot:
        print("formatting tractate {}".format(tractate))
        fix_tractate(tractate)
        if arguments.link:
            rebuild_links_from_text(tractate, arguments.user)
