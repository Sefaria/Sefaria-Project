# -*- coding: utf-8 -*-

"""
The text of different editions of the Mishnah can have significant differences. In addition, the Wikisource
 edition of the Mishnah originally hosted on Sefaria seems to be very inaccurate, and was ultimately replaced
 by the Vilna edition of the Mishna. The goal of this module is to assess the differences between the two
 versions and ultimately align and correct all commentaries so that they match the Vilna edition.
"""

import codecs
import os
import re
import sys

import diff_match_patch

p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
from sefaria.local_settings import *

os.environ["DJANGO_SETTINGS_MODULE"] = "sefaria.settings"
from sefaria.model import *

tractates = library.get_indexes_in_category("Mishnah")


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
            if version["versionTitle"] == "Vilna Mishna":
                relevant.append(book)
                break
    return relevant


def my_prettyHtml(diff_class, diffs):
    """Convert a diff array into a pretty HTML report.

    Args:
      diffs: Array of diff tuples.

    Returns:
      HTML representation.
    """
    html = []
    for (op, data) in diffs:
        text = (
            data.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\n", "&para;<br>")
        )
        if op == diff_class.DIFF_INSERT:
            html.append('<ins class="diff_add">%s</ins>' % text)
        elif op == diff_class.DIFF_DELETE:
            html.append('<del class="diff_sub">%s</del>' % text)
        elif op == diff_class.DIFF_EQUAL:
            html.append("<span>%s</span>" % text)
    return "".join(html)


class ComparisonTest:
    """
    Parent class for testing classes.
    """

    name = "Comparison Test"
    depth = Ref.is_segment_level

    def __init__(self, book, language, versions):
        if len(versions) != 2:
            raise TypeError("You must have 2 versions to compare!")

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
            output_file.write(" ")
            return
        if result.passed:
            output_file.write("passed")
        else:
            output_file.write("{}".format(result.diff))

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

    def __init__(self, test_list, lang, versions, html=False, output_file=None):
        """
        :param test_list: A list of TestMeta objects
        :param output_file: File to write results. If not set, script will generate its own files for each
        book.
        :param lang: language of texts to compare.
        :param versions: Names of versions to compare.
        """

        self.texts = get_relevant_books()
        self.tests = test_list
        self.output = output_file
        if not self.output:
            self.new_file = True
        else:
            self.new_file = False
        self.lang = lang
        if len(versions) != 2:
            raise AttributeError("Must have 2 versions to compare!")
        self.versions = versions
        self.html = html

    def html_header(self):
        """
        Writes the HTML header to output file.
        """

        self.output.write(
            '<!DOCTYPE html>\n<html><meta charset="utf-8">\n<body>\n<table>\n'
        )
        self.output.write(
            '<style type="text/css">\
        table.diff {font-family:Courier; border:medium;}\
        .diff_header {background-color:#e0e0e0}\
        td.diff_header {text-align:right}\
        .diff_next {background-color:#c0c0c0}\
        .diff_add {background-color:#aaffaa}\
        .diff_chg {background-color:#ffff77}\
        .diff_sub {background-color:#ffaaaa}\
    </style>'
        )
        self.output.write(
            '<table class="diff" summary="Legends">\
        <tr> <th colspan="2"> Legends </th> </tr>\
        <tr> <td> <table border="" summary="Colors">\
                      <tr><th> Colors </th> </tr>\
                      <tr><td class="diff_add">&nbsp;Added to Vilna Mishna&nbsp;</td></tr>\
                      <tr><td class="diff_sub">Missing from Vilna Mishna</td> </tr>\
                  </table>'
        )
        self.output.write("<tr>")
        self.output.write("<td>Reference</td>")
        for test in self.tests:
            self.output.write("<td>{}</td>".format(test.name))
        self.output.write("</tr>")

    def html_footer(self):
        """
        Writes the HTML footer to output file
        """

        self.output.write("</table>\n</body>\n</html>")

    def write_results(self, finished_tests, reference):
        """
        Take a series of completed tests and write results to file
        :param finished_tests: A list of instantiated test objects that have run their tests.
        :param reference: A reference to look up results
        """

        if self.html:
            self.output.write("<tr><td>")
            self.output.write(
                '<a href="http://draft.sefaria.org/{}">'.format(
                    reference.replace(" ", "_")
                )
            )
            self.output.write("{}".format(reference))
            self.output.write("</a></td>")

        else:
            self.output.write("{},".format(reference))

        for test in finished_tests:

            if self.html:
                self.output.write("<td>")
                test.output_result(reference, self.output)
                self.output.write("</td>")
            else:
                test.output_result(reference, self.output)
                self.output.write(",")

        if self.html:
            self.output.write("</tr>")
        else:
            self.output.write("\n")

        if not Ref(reference).is_segment_level():
            for ref in Ref(reference).all_subrefs():
                self.write_results(finished_tests, ref.uid())

    def run_tests(self):
        """
        Call run_test_series on all texts and tests
        """

        if not self.new_file:
            self.html_header()

        for book in self.texts:

            if self.new_file:
                script_dir = os.path.dirname(os.path.dirname(__file__))
                rel_path = "data/test_results/{}.html".format(book)
                abs_file_path = os.path.join(script_dir, rel_path)
                self.output = codecs.open(abs_file_path, "w", "utf-8")
                self.html_header()

            finished_tests = []

            for test in self.tests:

                new_test = test(book, self.lang, self.versions)
                new_test.run_test_series()
                finished_tests.append(new_test)

            self.write_results(finished_tests, book)

            if self.new_file:
                self.html_footer()
                self.output.close()
        if not self.new_file:
            self.html_footer()


class CompareNumberOfMishnayot(ComparisonTest):
    """
    Compares number of mishnayot between two versions.
    """

    name = "Mishna Count Test"
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

    name = "Word Comparison Test"

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

    name = "Exact String Match Test"

    def run_test(self, mishna):

        # instantiate result
        result = TestResult(mishna.uid(), [], False)

        # get TextChunks
        v1 = TextChunk(mishna, self.language, self.v1).text
        v2 = TextChunk(mishna, self.language, self.v2).text

        # strip out non hebrew letter characters or spaces
        v1 = re.sub('[^א-ת^ ^"^\(^\)]+', "", v1)
        v2 = re.sub('[^א-ת^ ^"^\(^\)]+', "", v2)

        # remove multiple spaces
        v1 = re.sub(" +", " ", v1)
        v2 = re.sub(" +", " ", v2)

        if v1 == v2:
            result.passed = True

        # create diff object
        checker = diff_match_patch.diff_match_patch()
        diff = checker.diff_main(v1, v2)
        result.diff = my_prettyHtml(checker, diff)

        return result


def run(outfile):

    books = get_relevant_books()

    outfile.write("Ref, Mishna Count Test, Word Count Test, String Match Test\n")

    for book in books:

        print(book)

        # instantiate test classes
        mi = CompareNumberOfMishnayot(book, "he", ("Wikisource Mishna", "Vilna Mishna"))
        mi.run_test_series()
        words = CompareNumberOfWords(book, "he", ("Wikisource Mishna", "Vilna Mishna"))
        words.run_test_series()
        exact = CompareStrings(book, "he", ("Wikisource Mishna", "Vilna Mishna"))
        exact.run_test_series()

        for ref in Ref(book).all_subrefs():
            outfile.write("{},".format(ref.uid()))

            result = mi.test_results[ref.uid()]

            if result.passed:
                outfile.write("Passed,")
            else:
                outfile.write("Failed,")

            result = words.test_results[ref.uid()]

            if result.passed:
                outfile.write("Passed,")
            else:
                outfile.write(
                    "{},".format(" ".join(str(index) for index in result.diff))
                )

            result = exact.test_results[ref.uid()]

            if result.passed:
                outfile.write("Passed\n")
            else:
                outfile.write(
                    "{}\n".format(" ".join(str(index) for index in result.diff))
                )


def csv_to_html(infile, outfile):
    """
    Convert a csv file to html
    :param infile: input file
    :param outfile: output file
    """

    outfile.write('<!DOCTYPE html>\n<html><meta charset="utf-8">\n<body>\n<table>\n')

    for row in infile:
        row = row.replace("\n", "")
        row = row.split(",")
        outfile.write("<tr><td>")
        outfile.write("</td><td>".join(row))
        outfile.write("</td></tr>\n")

    outfile.write("</table>\n</body>\n</html>")


# output_file = codecs.open('Mishna version test.html', 'w', 'utf-8')
tests = [CompareNumberOfMishnayot, CompareNumberOfWords, CompareStrings]
versions = ["Wikisource Mishna", "Vilna Mishna"]
testrunner = TestSuite(tests, "he", versions, True)
testrunner.run_tests()
# output_file.close()
