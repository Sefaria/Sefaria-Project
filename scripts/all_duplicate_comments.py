__author__ = 'stevenkaplan'
from sefaria.model import *
import os
import sys


def check_library_for_duplicates(category):
    prev_segment_text = ""
    books = library.get_indexes_in_category(category, include_dependant=True)
    found_duplicate_file = open("duplicates_in_{}.txt".format(category), 'w')
    error_file = open("duplicate_errors_{}.txt".format(category), 'w')
    for book in books:
        print book
        try:
            for ref in library.get_index(book).all_segment_refs():
                segment_text = ref.text('he').text
                if len(segment_text) == 0:
                    continue
                if segment_text == prev_segment_text:
                    found_duplicate_file.write(ref.normal()+"\n")
                else:
                    prev_segment_text = segment_text
        except:
            error_file.write(book)


    found_duplicate_file.close()
    error_file.close()


if __name__ == "__main__":
    check_library_for_duplicates(sys.argv[1])