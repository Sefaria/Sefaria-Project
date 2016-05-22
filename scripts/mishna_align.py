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
import re
import diff_match_patch
import csv
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

    name = u'Comparison Test'
    depth = Ref.is_segment_level

    def __init__(self, book, language, versions):
        if len(versions) != 2:
            raise TypeError('You must have 2 versions to compare!')

        self.book = Ref(book)
        self.language = language
        self.v1 = versions[0]
        self.v2 = versions[1]
        self.test_results = {}
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

    def output_result(self, reference, output_file):
        """
        Defines how the test should output data to a file
        :param reference: key to look up a result object
        :param output_file: file to write results
        """

        try:
            result = self.test_results[reference]
        except KeyError:
            output_file.write(u'N/A,')
            return
        if result.passed:
            output_file.write(u'passed,')
        else:
            output_file.write(u'{},'.format(result.diff))

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

    def __init__(self, test_list, output_file, lang, versions, html=False):
        """
        :param test_list: A list of TestMeta objects
        :param output_file: File to write results.
        :param lang: language of texts to compare.
        :param versions: Names of versions to compare.
        """

        self.texts = get_relevant_books()
        self.tests = test_list
        self.output = output_file
        self.lang = lang
        if len(versions) != 2:
            raise AttributeError("Must have 2 versions to compare!")
        self.versions = versions
        self.html = html

        # Write column names to output file
        output_file.write(u'Reference,')
        for test in test_list:
            output_file.write(u'{},'.format(test.name))
        self.output.write(u'\n')

    def write_results(self, finished_tests, reference):
        """
        Take a series of completed tests and write results to file
        :param finished_tests: A list of instantiated test objects that have run their tests.
        :param reference: A reference to look up results
        """

        if self.html:
            self.output.write(u'<a href="http://draft.sefaria.org/{}">'.format(reference.replace(u' ', u'_')))
            self.output.write(u'{}'.format(reference))
            self.output.write(u'</a>,')

        else:
            self.output.write(u'{},'.format(reference))

        for test in finished_tests:
            test.output_result(reference, self.output)

        self.output.write(u'\n')

        if not Ref(reference).is_segment_level():
            for ref in Ref(reference).all_subrefs():
                self.write_results(finished_tests, ref.uid())

    def run_tests(self):
        """
        Call run_test_series on all texts and tests
        """

        for book in self.texts:

            finished_tests = []

            for test in self.tests:

                new_test = test(book, self.lang, self.versions)
                new_test.run_test_series()
                finished_tests.append(new_test)

            self.write_results(finished_tests, book)
            self.output.write(u'\n')


class CompareNumberOfMishnayot(ComparisonTest):
    """
    Compares number of mishnayot between two versions.
    """

    name = u'Mishna Count Test'
    depth = Ref.is_section_level

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

    name = u'Word Comparison Test'

    def run_test(self, mishna, max_diff=0):
        """
        :param ref: A ref object upon which to run the test
        :param max_diff: Maximum difference in words allowed before function declares a failed test
        """

        # instantiate result
        result = TestResult(mishna.uid(), [], False)

        # get TextChunks
        v1 = TextChunk(mishna, self.language, self.v1)
        v2 = TextChunk(mishna, self.language, self.v2)

        result.diff = abs(v1.word_count() - v2.word_count())

        if result.diff <= max_diff:
            result.passed = True

        return result


class CompareStrings(ComparisonTest):
    """
    Strips strings of anything not a hebrew letter or a single space, then checks if strings are identical
    """

    name = u'Exact String Match Test'

    def run_test(self, mishna):

        # instantiate result
        result = TestResult(mishna.uid(), [], False)

        # get TextChunks
        v1 = TextChunk(mishna, self.language, self.v1).text
        v2 = TextChunk(mishna, self.language, self.v2).text

        # strip out non hebrew letter characters or spaces
        v1 = re.sub(u'[^א-ת^ ^"^\(\)]+', u'', v1)
        v2 = re.sub(u'[^א-ת^ ]+', u'', v2)

        # remove multiple spaces
        v1 = re.sub(u' +', u' ', v1)
        v2 = re.sub(u' +', u' ', v2)

        if v1 == v2:
            result.passed = True

        # create diff object
        checker = diff_match_patch.diff_match_patch()
        diff = checker.diff_main(v1, v2)
        result.diff = checker.diff_prettyHtml(diff)

        return result


def run(outfile):

    books = get_relevant_books()

    outfile.write(u'Ref, Mishna Count Test, Word Count Test, String Match Test\n')

    for book in books:

        print book

        # instantiate test classes
        mi = CompareNumberOfMishnayot(book, 'he', ('Wikisource Mishna', 'Vilna Mishna'))
        mi.run_test_series()
        words = CompareNumberOfWords(book, 'he', ('Wikisource Mishna', 'Vilna Mishna'))
        words.run_test_series()
        exact = CompareStrings(book, 'he', ('Wikisource Mishna', 'Vilna Mishna'))
        exact.run_test_series()

        for ref in Ref(book).all_subrefs():
            outfile.write(u'{},'.format(ref.uid()))

            result = mi.test_results[ref.uid()]

            if result.passed:
                outfile.write(u'Passed,')
            else:
                outfile.write(u'Failed,')

            result = words.test_results[ref.uid()]

            if result.passed:
                outfile.write(u'Passed,')
            else:
                outfile.write(u'{},'.format(u' '.join(str(index) for index in result.diff)))

            result = exact.test_results[ref.uid()]

            if result.passed:
                outfile.write(u'Passed\n')
            else:
                outfile.write(u'{}\n'.format(u' '.join(str(index) for index in result.diff)))


def csv_to_html(infile, outfile):
    """
    Convert a csv file to html
    :param infile: input file
    :param outfile: output file
    """

    outfile.write(u'<!DOCTYPE html>\n<html><meta charset="utf-8">\n<body>\n<table>\n')

    for row in infile:
        row = row.replace(u'\n', u'')
        row = row.split(u',')
        outfile.write(u'<tr><td>')
        outfile.write(u'</td><td>'.join(row))
        outfile.write(u'</td></tr>\n')

    outfile.write(u'</table>\n</body>\n</html>')


tests = [CompareNumberOfMishnayot, CompareNumberOfWords, CompareStrings]
versions = ['Wikisource Mishna', 'Vilna Mishna']
output_file = codecs.open('Mishna version test.csv', 'w', 'utf-8')
testrunner = TestSuite(tests, output_file, 'he', versions, True)
testrunner.run_tests()
output_file.close()
input_file = codecs.open('Mishna version test.csv', 'r', 'utf-8')
html = codecs.open('Mishna version test.html', 'w', 'utf-8')
csv_to_html(input_file, html)
input_file.close()
html.close()

