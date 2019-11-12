# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.tracker import add



root = SchemaNode()
root.add_title("New Guide for the Perplexed", "en", primary=True)
root.add_title("מורה נבוכים החדש", "he", primary=True)
root.key = "New Guide for the Perplexed"

#Translators Intro
trans_intro = SchemaNode()
trans_intro.add_title("הקדמות המתרגמים", "he", primary=True)
trans_intro.add_title("Translator's Introductions", "en", primary=True)
trans_intro.key = "Translator's Introductions"

fried_intro = JaggedArrayNode()
fried_intro.add_title("הקדמת מ. פרידלנדר", "he", primary=True)
fried_intro.add_title("Introduction of M Friedlander", "en", primary=True)
fried_intro.depth = 1
fried_intro.sectionNames = ["Paragraph"]
fried_intro.addressTypes = ["Integer"]
fried_intro.key = "Introduction of M Friedlander"

tibon_intro = JaggedArrayNode()
tibon_intro.add_title("פתיחת אבן תיבון", "he", primary=True)
tibon_intro.add_title("Introduction of Ibn Tibon", "en", primary=True)
tibon_intro.depth = 1
tibon_intro.sectionNames = ["Paragraph"]
tibon_intro.addressTypes = ["Integer"]
tibon_intro.key = "Introduction of Ibn Tibon"

trans_intro.append(fried_intro)
trans_intro.append(tibon_intro)
#######

#Rambam's Intro
intro = SchemaNode()
intro.add_title("הקדמה", "he", primary=True)
intro.add_title("Introduction", "en", primary=True)
intro.key = "Introduction"

#####
iggeret = JaggedArrayNode()
iggeret.add_title("איגרת אל ר\' יוסף ש\"ץ ב\"ר יהודה", "he", primary=True)
iggeret.add_title("Letter to R Joseph son of Judah", "en", primary=True)
iggeret.depth = 1
iggeret.sectionNames = ["Paragraph"]
iggeret.addressTypes = ["Integer"]
iggeret.key = "Letter to R Joseph son of Judah"

peticha = JaggedArrayNode()
peticha.add_title("פתיחת הרמב\"ם", "he", primary=True)
peticha.add_title("Prefatory Remarks", "en", primary=True)
peticha.depth = 1
peticha.sectionNames = ["Paragraph"]
peticha.addressTypes = ["Integer"]
peticha.key = "Prefatory Remarks"

hakdama = JaggedArrayNode()
hakdama.add_title("הקדמה", "he", primary=True)
hakdama.add_title("Introduction", "en", primary=True)
hakdama.depth = 1
hakdama.sectionNames = ["Paragraph"]
hakdama.addressTypes = ["Integer"]
hakdama.key = "Introduction"

intro.append(iggeret)
intro.append(peticha)
intro.append(hakdama)

part1 = JaggedArrayNode()
part1.add_title("חלק א\'", "he", primary=True)
part1.add_title("Part 1", "en", primary=True)
part1.depth = 2
part1.lengths = [76]
part1.sectionNames = ["Chapter", "Paragraph"]
part1.addressTypes = ["Integer", "Integer"]
part1.key = "Part 1"

intro_to_part2 = JaggedArrayNode()
intro_to_part2.add_title("חלק ב\' הקדמה", "he", primary=True)
intro_to_part2.add_title("Part 2 Introduction", "en", primary=True)
intro_to_part2.depth = 1
intro_to_part2.sectionNames = [ "Paragraph"]
intro_to_part2.addressTypes = [ "Integer"]
intro_to_part2.key = "Part 2 Introduction"

part2 = JaggedArrayNode()
part2.add_title("חלק ב\'", "he", primary=True)
part2.add_title("Part 2", "en", primary=True)
part2.depth = 2
part2.lengths = [48]
part2.sectionNames = ["Chapter", "Paragraph"]
part2.addressTypes = ["Integer", "Integer"]
part2.key = "Part 2"

intro_to_part3 = JaggedArrayNode()
intro_to_part3.add_title("חלק ג\' הקדמה", "he", primary=True)
intro_to_part3.add_title("Part 3 Introduction", "en", primary=True)
intro_to_part3.depth = 1
intro_to_part3.sectionNames = [ "Paragraph"]
intro_to_part3.addressTypes = [ "Integer"]
intro_to_part3.key = "Part 3 Introduction"

part3 = JaggedArrayNode()
part3.add_title("חלק ג\'", "he", primary=True)
part3.add_title("Part 3", "en", primary=True)
part3.depth = 2
part3.lengths = [54]
part3.sectionNames = ["Chapter", "Paragraph"]
part3.addressTypes = ["Integer", "Integer"]
part3.key = "Part 3"

root.append(trans_intro)
root.append(intro)
root.append(part1)
root.append(intro_to_part2)
root.append(part2)
root.append(intro_to_part3)
root.append(part3)

root.validate()

indx = {
    "title": "New Guide for the Perplexed",
    "categories": ["Philosophy"],
    "schema": root.serialize()
}

Index(indx).save()
# add("28", Index, indx)
