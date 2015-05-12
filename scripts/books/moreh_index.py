# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.tracker import add



root = SchemaNode()
root.add_title("New Guide for the Perplexed", "en", primary=True)
root.add_title(u"מורה נבוכים החדש", "he", primary=True)
root.key = "New Guide for the Perplexed"

trans_intro = SchemaNode()
trans_intro.add_title(u"", "he", primary=True)
trans_intro.add_title("Translator's Introductions", "en", primary=True)
trans_intro.key = "Translator's Introductions"

intro = SchemaNode()
intro.add_title(u"", "he", primary=True)
intro.add_title("Introduction", "en", primary=True)
intro.key = "Introduction"


part1 = JaggedArrayNode()
part1.add_title(u"", "he", primary=True)
part1.add_title("Part 1", "en", primary=True)
part1.depth = 2
part1.lengths = [76]
part1.sectionNames = ["Chapter", "Paragraph"]
part1.addressTypes = ["Integer", "Integer"]
part1.key = "Part 1"

part2 = JaggedArrayNode()
part2.add_title(u"", "he", primary=True)
part2.add_title("Part 2", "en", primary=True)
part2.depth = 2
part2.lengths = [48]
part2.sectionNames = ["Chapter", "Paragraph"]
part2.addressTypes = ["Integer", "Integer"]
part2.key = "Part 2"

part3 = JaggedArrayNode()
part3.add_title(u"", "he", primary=True)
part3.add_title("Part 3", "en", primary=True)
part3.depth = 2
part3.lengths = [54]
part3.sectionNames = ["Chapter", "Paragraph"]
part3.addressTypes = ["Integer", "Integer"]
part3.key = "Part 3"

root.append(trans_intro)
root.append(intro)
root.append(part1)
root.append(part2)
root.append(part3)

root.validate()

indx = {
    "title": "New Guide for the Perplexed",
    "categories": ["Philosophy"],
    "schema": root.serialize()
}

Index(indx).save()
# add("28", Index, indx)