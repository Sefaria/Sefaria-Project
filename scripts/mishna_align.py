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
    def __init__(self, versions, result):
        if len(versions) != 2:
            raise TypeError('You must have 2 objects to compare!')

        self.v1 = versions[0]
        self.v2 = versions[1]
        self.result = result

    def run_test(self):
        return None


class TestMeta:
    """
    Contains meta-data necessary to run a test.
    """
    def __init__(self, test, test_name, required_depth, fail_condition=None):
        """
        :param test: The test to run
        :param test_name: The name of the test to display in output.
        :param required_depth: specifies what level of the jagged array is necessary to run test
        :param fail_condition: Indicates what constitutes a failure of the test.
        """

        self.test = test
        self.name = test_name
        self.depth = required_depth
        self.fail = fail_condition


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

    def run_test(self, max_diff=0):
        """
        :param max_diff: Maximum difference in words allowed before function declares a failed test
        """

        self.result.diff = abs(self.v1.word_count() - self.v2.word_count())

        if self.result.diff > max_diff:
            self.result.passed = False


class CompareNumberOfWords(ComparisonTest):
    """
    Compares number of words in a mishna from two parallel versions
    """

    def run_test(self, max_diff=0):
        """
        :param max_diff: Maximum difference in words allowed before function declares a failed test
        """
        self.result.diff = abs(self.v1.word_count() - self.v2.word_count())

        if self.result.diff > max_diff:
            self.result.passed = False


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
