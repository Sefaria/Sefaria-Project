# -*- coding: utf-8 -*-

"""
The text of different editions of the Mishnah can have significant differences. In addition, the Wikisource
 edition of the Mishnah originally hosted on Sefaria seems to be very inaccurate, and was ultimately replaced
 by the Vilna edition of the Mishna. The goal of this module is to assess the differences between the two
 versions and ultimately align and correct all commentaries so that they match the Vilna edition.
"""

import os
import sys
import codecs
p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
from sefaria.local_settings import *
os.environ['DJANGO_SETTINGS_MODULE'] = 'sefaria.settings'
from sefaria.model import *

tractates = library.get_indexes_in_category('Mishnah')


def get_relevant_books():
    """
    As not all tractates have had the Vilna edition uploaded yet, get those tractates for which the version has
    been uploaded.
    :return: List of tractates for which the Vilna edition has been uploaded.
    """

    relevant = []

    for book in tractates:

        ref = Ref(book)
        for version in ref.version_list():
            if version['versionTitle'] == 'Vilna Mishna':
                relevant.append(book)
                break
    return relevant


class ComparisonTest:
    """
    Parent class for testing classes.
    """
    depth = Ref.is_section_level
    drop_level = Ref.all_subrefs
    ref_list = []
    test_results = {}

    def __init__(self, book, language, versions):
        if len(versions) != 2:
            raise TypeError('You must have 2 versions to compare!')

        self.book = book
        self.language = language
        self.v1 = versions[0]
        self.v2 = versions[1]
        self.get_data(book)

    def run_test(self, test_data):
        return None

    def get_data(self, ref):
        """
        :param ref: a ref object used to extract data
        :return: A list of Ref objects upon which to run tests.
        """

        if not self.depth(ref):
            for data in self.drop_level(ref):
                self.get_data(data)
        else:
            self.ref_list.append(ref)

    def prepare_test(self, ref):
        """
        Gets necessary data for the test and instantiates a new test result class
        :param ref: Ref from which to extract results
        :return: Dictionary with keys v1, v2 and result
        """

        test_data = {}

        # get data and instantiate result object
        test_data['v1'] = TextChunk(ref, self.language, self.v1)
        test_data['v2'] = TextChunk(ref, self.language, self.v2)
        test_data['result'] = TestResult(ref.uid())

        return test_data

    def run_test_series(self):
        """
        Runs tests on all ref objects in ref_list
        """

        for ref in self.ref_list:
            self.test_results[ref.uid()] = self.run_test(self.prepare_test(ref))


class TestResult:
    """
    Holds result of the test. Members include identification for the texts on which the test was run,
    the exact difference between the texts as discovered by the test, and a boolean which declares if the
    test passed or failed.
    """

    def __init__(self, ref_id, diff=None, passed=True):
        """
        :param ref_id: Identifies the documents on which the test was run.
        :param diff: Holds numeric or textual data returned from the test.
        :param passed: Defaults to True, if a pass/fail condition was passed to the test, store it here.
        """

        self.id = ref_id
        self.diff = diff
        self.passed = passed


class TestSuite:
    """
    Class to get data and run a series of tests on them.
    """

    def __init__(self, test_list, output_file):
        """
        :param test_list: A list of TestMeta objects
        :param output_file: File to write results.
        """

        self.texts = get_relevant_books()
        self.tests = test_list
        self.output = output_file


class CompareNumberOfMishnayot(ComparisonTest):
    """
    Compares number of mishnayot between two versions.
    """

    depth = Ref.is_section_level

    def run_test(self, data, max_diff=0):
        """
        :param max_diff: Maximum difference in words allowed before function declares a failed test
        """

        data['result'].diff = abs(self.v1.word_count() - self.v2.word_count())

        if data['result'].diff > max_diff:
            data['result'].passed = False

        return data['result']


class CompareNumberOfWords(ComparisonTest):
    """
    Compares number of words in a mishna from two parallel versions
    """

    def run_test(self, data, max_diff=0):
        """
        :param ref: A ref object upon which to run the test
        :param max_diff: Maximum difference in words allowed before function declares a failed test
        """

        data['result'].diff = abs(data['v1'].word_count() - data['v2'].word_count())

        if data['result'].diff > max_diff:
            data['result'].passed = False

        return data['result']

def run(outfile):

    outfile.write(u'Tractate,Chapter,Mishnah Count,Word Count\n')
    books = get_relevant_books()
    for book in books:
        chapters = Ref(book).all_subrefs()

        for chap_ind, chapter in enumerate(chapters):
            outfile.write(u'{},{},'.format(book, chap_ind+1))
            v1 = TextChunk(chapter, 'he', 'Vilna Mishna')
            v2 = TextChunk(chapter, 'he', 'Wikisource Mishna')

            if compare_number_of_mishnayot((v1, v2)):
                outfile.write(u'Passed,')
            else:
                outfile.write(u'Failed,')

            word_count = []

            for m_index, mishna in enumerate(chapter.all_subrefs()):
                v1 = TextChunk(mishna, 'he', 'Vilna Mishna')
                v2 = TextChunk(mishna, 'he', 'Wikisource Mishna')
                if not compare_number_of_words((v1, v2), 1):
                    word_count.append(m_index+1)

            outfile.write(u'{}\n'.format(u' '.join(str(index) for index in word_count)))

output = codecs.open('Mishna version comparison.csv', 'w', 'utf-8')
run(output)
output.close()
