import re
from sefaria.model import *
import collections

# For each book of Tanach
tanach_books = library.get_indexes_in_category("Torah") + library.get_indexes_in_category("Prophets") + library.get_indexes_in_category("Writings")

total_links = 0
total_verses = 0
freqs = collections.Counter()

print("Each book of Tanach, the verses in it that are referred in the Bavli, the total verses in the book, and the percentage of total book referenced in Bavli.")
print()

print("Book, Referenced Verses, Total Verses, Percent")
for book in tanach_books:

    # Get the number of unique verses in the book
    verses = TextChunk(Ref(book), "he").verse_count()

    # Get the linkset between this book and the Bavli
    links = get_book_category_linkset(book, "Bavli")

    # Get the number of unique links to the book.
    # we're assuming that there are no ranges, and that each link is to a specific verse
    linkTuples = links.refs_from(Ref(book), True)
    froms = [a[0] for a in linkTuples if a[0].is_segment_level()]
    freqs.update(froms)
    link_count = len(set(froms))

    total_links += link_count
    total_verses += verses

    # unique links / verses = ratio for that book
    ratio = (float(link_count) / verses) * 100
#    print "{}: {}/{} ({}%)".format(book, link_count, verses, round(ratio, 2))
    print("{},{},{},{}".format(book, link_count, verses, round(ratio, 2)))



print()
ratio = (float(total_links) / total_verses) * 100
print("All of Tanach: {}/{} ({}%)".format(total_links, total_verses, round(ratio, 2)))
print()
print("Verses with more than one reference: {}".format(len({a:b for a,b in freqs.items() if b > 1})))
print()
print("20 Most Frequent")
for mc in freqs.most_common(20):
    ref = mc[0]
    print("{} - {} occurrences".format(ref.normal(), mc[1]))
    print(ref.text("en").text)
    print(ref.text("he").text)
    print()

# sum up each book link & verse for ratio of all tanach

# Do the same dance for Parasha
print("Parasha, Referenced Verses, Total Verses, Percent")
ts = TermSet({"scheme": "Parasha"})
prefs = [(t.name, Ref(t.ref)) for t in ts]
for (name, ref) in prefs:
    # Get the number of unique verses in the parasha
    verses = TextChunk(ref, "he").verse_count()

    # Get the linkset between this book and the Bavli
    links = ref.linkset().filter("Bavli")

    # Get the number of unique links to the book.
    # we're assuming that there are no ranges, and that each link is to a specific verse

    # copying LinkSet.refs_from, since it can't be used with filter(), yet
    # linkTuples = links.refs_from(ref, True)
    reg = re.compile(ref.regex())
    linkTuples = []
    for link in links:
        if reg.match(link.refs[1]):
            from_tref = link.refs[1]
            opposite_tref = link.refs[0]
        elif reg.match(link.refs[0]):
            from_tref = link.refs[0]
            opposite_tref = link.refs[1]
        else:
            opposite_tref = False

        if opposite_tref:
            try:
                linkTuples.append((text.Ref(from_tref), text.Ref(opposite_tref)))
            except:
                pass

    froms = [a[0] for a in linkTuples if a[0].is_segment_level()]
    freqs.update(froms)
    link_count = len(set(froms))

    total_links += link_count
    total_verses += verses

    # unique links / verses = ratio for that book
    ratio = (float(link_count) / verses) * 100
#    print "{}: {}/{} ({}%)".format(name, link_count, verses, round(ratio, 2))
    print("{},{},{},{}".format(name, link_count, verses, round(ratio, 2)))