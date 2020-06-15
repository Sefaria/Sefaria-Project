# This Python file uses the following encoding: utf-8
import django
django.setup()
import re
import collections
from sefaria.model import *

from pprint import pprint

def flatten(l):
   for el in l:
      if isinstance(el, collections.Iterable) and not isinstance(el, basestring):
         for sub in flatten(el):
            yield sub
      else:
         yield el




books = library.get_indexes_in_category("Bavli")

print books

total = 0
all_words_used = []

for book in books:
    book_index = Index().load({'title': book})
    text = [TextChunk(sectionRef, "he").text for sectionRef in book_index.all_section_refs()]
    merged = flatten(text)
    all_words = [re.sub(ur'[^\u05D0-\u05EA]', '', word) for segment in merged for word in segment.split()]
    unique_words = collections.Counter(all_words)
    print("%s: Words: %i \tUnique Words: %i" % (book, len(all_words), len(unique_words)))
    total = total + len(all_words)
    all_words_used = all_words_used + all_words

print(total)

all_unique_words = collections.Counter(all_words_used)
print(len(all_unique_words))
