# This Python file uses the following encoding: utf-8
import django
django.setup()
import re
import collections
from sefaria.model import *

from pprint import pprint



def flatten(l):
   for el in l:
      if isinstance(el, collections.Iterable) and not isinstance(el, str):
         for sub in flatten(el):
            yield sub
      else:
         yield el


cutoff_length = 60000

books = set(flatten([(library.get_dependant_indices(book_title=r, dependence_type="Commentary")) for r in library.get_indexes_in_category("Tanakh")]))

#books = list(books)[:5]

commentator_words = {}

counter = 0

all_words_used = []

for book in books:
   counter = counter + 1
   print((" %i/%i: %s" % (counter, len(books), book)))
   book_index = Index().load({'title': book})
   text = [TextChunk(sectionRef, "he").text for sectionRef in book_index.all_section_refs()]

   try:
      author = book_index.authors[0]
   except:
      try:
         author = book_index.collective_title
      except:
         author = "unknown"

   merged = flatten(text)
   all_words = [re.sub(r'[^\u05D0-\u05EA]', '', word) for segment in merged for word in segment.split()]

   commentator_words[author] = commentator_words.get(author, []) + all_words
   all_words_used = all_words_used + all_words


all_words_used = collections.Counter(all_words_used)


for commentator in commentator_words:
   if len(commentator_words[commentator]) > cutoff_length:
       trimmed_list_of_words = commentator_words[commentator][:cutoff_length]
       unique_words = set(trimmed_list_of_words)
       special_words = [word for word in list(unique_words) if all_words_used[word] < 2]
       print("%s\t%d\t%f\t%d\t%d" % (commentator, len(unique_words), len(unique_words)/float(cutoff_length), len(special_words), len(commentator_words[commentator])))

