import django
django.setup()
from sefaria.model import *
from sefaria.helper.schema import *

books = {"Sefer HaIkkarim": ["Editor's Introduction"], "Midrash Tanchuma": ["Foreword", "Introduction"], "Or Neerav": ["Introduction"], "Sefer HaYashar": ["Translator's Foreword", "Addendum I", "Addendum II"], "Ibn Ezra on Isaiah": ["Translator's Foreword"]}
for book in books:
	for node in library.get_index(book).nodes.children:
		if node.get_primary_title('en') in books[book]:
			print(f"Deleting {node.get_primary_title('en')} from {book}")
			remove_branch(node)
