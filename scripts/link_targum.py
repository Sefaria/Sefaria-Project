# -*- coding: utf-8 -*-

from optparse import OptionParser
from sefaria.model import *

cats = ["Tanakh", "Targum"]


def link_targums(prepend, titles):
    for title in titles:
        b_index = library.get_index(title)

        if options.verify_mode:
            b_ref = Ref(title)
            t_ref = Ref(prepend + title)
            b_len = len(TextChunk(b_ref, "he").text)
            t_len = len(TextChunk(t_ref, "he").text)
            if b_len != t_len: print("{}, {}/{}".format(b_ref.normal(), b_len, t_len))

            for b_ref in b_index.all_section_refs():
                t_ref = Ref(prepend + b_ref.normal())

                b_len = len(TextChunk(b_ref, "he").text)
                t_len = len(TextChunk(t_ref, "he").text)
                if b_len != t_len: print("{}, {}/{}".format(b_ref.normal(), b_len, t_len))

            for b_ref in b_index.all_segment_refs():
                t_ref = Ref(prepend + b_ref.normal())
                if t_ref.is_empty(): print("{} empty".format(t_ref.normal()))
                if b_ref.is_empty(): print("{} empty".format(b_ref.normal()))

        else:
            t_index = library.get_index(prepend + title)
            t_index.categories = cats[:]
            t_index.save()

            for b_ref in b_index.all_segment_refs():
                t_ref = Ref(prepend + b_ref.normal())
                Link({
                    "refs": [b_ref.normal(), t_ref.normal()],
                    "auto": True,
                    "type": "Targum",
                    "generated_by": "Targum Linker"
                }).save()

if __name__ == '__main__':
    parser = OptionParser()
    parser.add_option("-v", "--verify", dest="verify_mode", action='store_true', help="Test if input files have any error")

    options, user_args = parser.parse_args()

    link_targums("Targum Jonathan on ", ["Joshua", "Zephaniah", "Judges","I_Samuel","II_Samuel","I_Kings","II_Kings","Isaiah","Jeremiah","Ezekiel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Haggai","Zechariah","Malachi"])
    link_targums("Aramaic Targum to ", ["Psalms","Proverbs","Job","Ruth","Lamentations","Ecclesiastes","Esther"])



