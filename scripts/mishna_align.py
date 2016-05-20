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

    def __init__(self, book, language, versions):
        if len(versions) != 2:
            raise TypeError('You must have 2 versions to compare!')

        self.book = Ref(book)
        self.language = language
        self.v1 = versions[0]
        self.v2 = versions[1]
        self.test_results = {}
        self.depth = Ref.is_section_level
        self.drop_level = Ref.all_subrefs
        self.ref_list = []
        self.get_data(self.book)

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



        return test_data

    def run_test_series(self):
        """
        Runs tests on all ref objects in ref_list
        """

        for ref in self.ref_list:
            self.test_results[ref.uid()] = self.run_test(ref)


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

    results = {}

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

    def run_test(self, ref, max_diff=0):
        """
        :param max_diff: Maximum difference in words allowed before function declares a failed test
        """
        # get data and instantiate result object
        v1 = TextChunk(ref, self.language, self.v1)
        v2 = TextChunk(ref, self.language, self.v2)
        result = TestResult(ref.uid())

        result.diff = abs(v1.verse_count() - v2.verse_count())

        if result.diff > max_diff:
            result.passed = False

        return result


class CompareNumberOfWords(ComparisonTest):
    """
    Compares number of words in a mishna from two parallel versions
    """

    def run_test(self, chapter, max_diff=0):
        """
        :param ref: A ref object upon which to run the test
        :param max_diff: Maximum difference in words allowed before function declares a failed test
        """

        # get segment level data and instantiate result
        ref_list = chapter.all_subrefs()
        result = TestResult(chapter.uid(), [], False)

        for index, ref in enumerate(ref_list):
            # get TextChunks
            v1 = TextChunk(ref, self.language, self.v1)
            v2 = TextChunk(ref, self.language, self.v2)

            if abs(v1.word_count() - v2.word_count()) > max_diff:
                result.diff.append(index+1)

        if len(result.diff) == 0:
            result.passed = True

        return result

def run(outfile):

    books = get_relevant_books()

    for book in books:

        print book

        # instantiate test classes
        mi = CompareNumberOfMishnayot(book, 'he', ('Wikisource Mishna', 'Vilna Mishna'))
        mi.run_test_series()
        words = CompareNumberOfWords(book, 'he', ('Wikisource Mishna', 'Vilna Mishna'))
        words.run_test_series()

        for ref in Ref(book).all_subrefs():
            outfile.write(u'{},'.format(ref.uid()))

            result = mi.test_results[ref.uid()]

            if result.passed:
                outfile.write(u'Passed,')
            else:
                outfile.write(u'Failed,')

            result = words.test_results[ref.uid()]

            if result.passed:
                outfile.write(u'Passed\n')
            else:
                outfile.write(u'{}\n'.format(u' '.join(str(index) for index in result.diff)))

output = codecs.open('Mishna version test.csv', 'w', 'utf-8')
run(output)
output.close()
