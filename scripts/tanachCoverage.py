from sefaria.model import *

# For each book of Tanach
tanach_books = library.get_indexes_in_category("Torah") + library.get_indexes_in_category("Prophets") + library.get_indexes_in_category("Writings")

total_links = 0
total_verses = 0

print "Each book of Tanach, the verses in it that are referred in the Bavli, the total verses in the book, and the percentage of total book referenced in Bavli."
print

for book in tanach_books:

    # Get the number of unique verses in the book
    verses = TextChunk(Ref(book), "he").verse_count()

    # Get the linkset between this book and the Bavli
    links = get_book_category_linkset(book, "Bavli")

    # Get the number of unique links to the book.
    # we're assuming that there are no ranges, and that each link is to a specific verse
    linkTuples = links.refs_from(Ref(book), True)
    froms = [a[0] for a in linkTuples]
    link_count = len(set(froms))

    total_links += link_count
    total_verses += verses

    # unique links / verses = ratio for that book
    ratio = (float(link_count) / verses) * 100
    print "{}: {}/{} ({}%)".format(book, link_count, verses, round(ratio, 2))

print
ratio = (float(total_links) / total_verses) * 100
print "All of Tanach: {}/{} ({}%)".format(total_links, total_verses, round(ratio, 2))

# sum up each book linsk & verse for ratio of all tanach
