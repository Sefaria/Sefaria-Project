import django
django.setup()
from sefaria.model import *
import re


def wrap_text_citations_with_span(tc):
	# modify tc.text to wrap citations in <span data-ref="Megillah 11b:1">{text of citation}</span>
	tc.save()



def wrap_all():
    cats = ["Midrash", "Mussar", "Chasidut", "Jewish Thought"]
    books = []
    for cat in cats:
        books.extend(library.get_indexes_in_category(cat))

    books.extend(library.get_dependant_indices())
    for book in books:
        wrap(book)


def wrap(book):
    for ref in book.all_segment_refs():
        for version in book.versionSet():
            versionTitle = version.versionTitle
            versionLang = version.language
            tc = TextChunk(ref, lang=versionLang, vtitle=versionTitle)
            wrap_text_citations_with_span(tc)


if __name__ == "__main__":
    for book in library.get_indices_by_collective_title("Rashi"):
        wrap(book)