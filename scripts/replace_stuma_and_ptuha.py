from sefaria.helper.text import *

books = ("Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy")
versions = ("Tanach with Ta'amei Hamikra", "Tanach with Text Only", "Tanach with Nikkud")

for book in books:
    for version in versions:
        find_and_replace_in_text(book, version, "he", "(פ)", "\n", 1)
        find_and_replace_in_text(book, version, "he", "(ס)", "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;", 1)
