# -*- coding: utf-8 -*-

import pytest
from sefaria.model import *
import re
from sefaria.system.exceptions import InputError



def setup_module(module):
    global root
    root = SchemaNode()
    root.add_title("Orot", "en", primary=True)
    root.add_title(u"אורות", "he", primary=True)
    root.key = "Orot"

    part1 = SchemaNode()
    part1.add_title(u"אורות מאופל", "he", primary=True)
    part1.add_title("Lights from Darkness", "en", primary=True)
    part1.key = "from darkness"

    part2 = JaggedArrayNode()
    part2.add_title(u"למהלך האידיאות בישראל", "he", primary=True)
    part2.add_title("The Process of Ideals in Israel", "en", primary=True)
    part2.depth = 1
    part2.lengths = [6]
    part2.sectionNames = ["Chapter"]
    part2.addressTypes = ["Integer"]
    part2.key = "ideals"

    part3 = JaggedArrayNode()
    part3.add_title(u"זרעונים", "he", primary=True)
    part3.add_title("Seeds", "en", primary=True)
    part3.depth = 1
    part3.lengths = [8]
    part3.sectionNames = ["Chapter"]
    part3.addressTypes = ["Integer"]
    part3.key = "seeds"

    part4 = JaggedArrayNode()
    part4.add_title(u"אורות ישראל", "he", primary=True)
    part4.add_title("Lights of Israel", "en", primary=True)
    part4.depth = 1
    part4.lengths = [9]
    part4.sectionNames = ["Chapter"]
    part4.addressTypes = ["Integer"]
    part4.key = "israel"

    root.append(part1)
    root.append(part2)
    root.append(part3)
    root.append(part4)

    # Part 1

    part1_subsections = [
        [u"ארץ ישראל","Land of Israel", 8],
        [u"המלחמה", "War", 10],
        [u"ישראל ותחיתו", "Israel and its Rebirth", 32],
        [u"אורות התחיה", "Lights of Rebirth", 72],
    ]

    for sub in part1_subsections:
        n = JaggedArrayNode()
        n.key = sub[1]
        n.add_title(sub[1], "en", primary=True)
        n.add_title(sub[0], "he", primary=True)
        n.depth = 2
        n.lengths = [sub[2]]
        n.sectionNames = ["Chapter", "Paragraph"]
        n.addressTypes = ["Integer", "Integer"]
        n.append_to(part1)
    n = JaggedArrayNode()
    n.key = "Great Calling"
    n.add_title("Great Calling", "en", primary=True)
    n.add_title(u"קריאה גדולה", "he", primary=True)
    n.depth = 1
    n.sectionNames = ["Paragraph"]
    n.addressTypes = ["Integer"]
    n.append_to(part1)


    # Part 2
    part2_subsections = [
        [u"האידיאה האלהית והאידיאה הלאומית באדם", "The Godly and the National Ideal in the Individual"],
        [u"האידיאה האלהית והאידיאה הלאומית בישראל", "The Godly and the National Ideal in Israel"],
        [u"מצב הירידה והפרוד בין האידיאות", "Dissolution of Ideals"],
        [u"המצב בגלות", "The Situation in Exile"],
        [u"בית ראשון ובית שני. האידיאה הדתית. המצב הישראלי ויחוסו לאנושיות", "The First and Second Temples; Religion"],
        [u"התאחדות האידיאות בכנסת ישראל בתחיתה בארצה, רשמי דרכיה ופעולותיה", "Unification of Ideals"]
    ]
    for sub in part2_subsections:
        n = JaggedArrayNode()
        n.key = sub[1]
        n.add_title(sub[1], "en", primary=True)
        n.add_title(sub[0], "he", primary=True)
        n.depth = 1
        n.sectionNames = ["Paragraph"]
        n.addressTypes = ["Integer"]
        n.append_to(part2)

    # Part 3 -
    part3_subsections = [
        [u"צמאון לאל חי", "Thirst for the Living God"],
        [u"חכם עדיף מנביא", "The Wise is Preferable to Prophet"],
        [u"הנשמות של עולם התוהו", "The Souls of the World of Chaos"],
        [u"מעשי יצירה", "Acts of Creation"],
        [u"יסורים ממרקים", "Suffering Cleanses"],
        [u"למלחמת הדעות והאמונות", "The War of Ideas"],
        [u"נשמת הלאומיות וגופה", "National Soul and Body"],
        [u"ערך התחיה", "The Value of Rebirth"]
    ]

    for sub in part3_subsections:
        n = JaggedArrayNode()
        n.key = sub[1]
        n.add_title(sub[1], "en", primary=True)
        n.add_title(sub[0], "he", primary=True)
        n.depth = 1
        n.sectionNames = ["Paragraph"]
        n.addressTypes = ["Integer"]
        n.append_to(part3)

    # Part 4
    part4_subsections = [
        [u"מהות כנסת ישראל ותכונה חייה", "The Essence of Israel", 16],
        [u"קשר היחיד והכלל בישראל", "The Individual and the Collective", 8],
        [u"התדבקות והתקשרות בכללות ישראל", "Connection to the Collective", 11],
        [u"אהבת ישראל", "Love of Israel", 10],
        [u"ישראל ואומות העולם", "Israel and the Nations", 16],
        [u"לומיות ישראל", "Nationhood of Israel", 9],
        [u"שלמות נשמת ישראל ותחיתו", "Israel's Soul and its Rebirth", 19],
        [u"סגולת ישראל", "Preciousness of Israel", 9],
        [u"קדושת ישראל", "Holiness of Israel", 9]
    ]

    for sub in part4_subsections:
        n = JaggedArrayNode()
        n.key = sub[1]
        n.add_title(sub[1], "en", primary=True)
        n.add_title(sub[0], "he", primary=True)
        n.depth = 1
        n.lengths = [sub[2]]
        n.sectionNames = ["Subsection"]
        n.addressTypes = ["Integer"]
        n.append_to(part4)

    root.validate()


def test_relationships():
    assert root.first_child().first_child() is root.first_leaf()
    assert root.last_child().last_child() is root.last_leaf()
    assert root.first_child().next_sibling().prev_sibling() is root.first_child()
    assert root.first_child().last_child().next_leaf() is root.first_child().next_sibling().first_child()
    assert root.first_child().next_sibling().first_child().prev_leaf() is root.first_child().last_child()

    assert root.first_child().prev_sibling() is None
    assert root.last_child().next_sibling() is None
    assert root.first_leaf().prev_sibling() is None
    assert root.last_leaf().next_sibling() is None


def test_ancestors():
    assert root.last_leaf().ancestors() == [root, root.last_child()]


def test_text_index_map():
    def tokenizer(s):
        s = re.sub(ur'<.+?>',u'',s).strip()
        return re.split('\s+', s)


    nodes = library.get_index("Megillat Taanit").nodes
    index_list, ref_list = nodes.text_index_map(tokenizer=tokenizer)
    assert index_list[1] == 9
    assert index_list[2] == 20
    assert index_list[5] == 423

    #now let's get serious. run text_index_map and check for rand_inds that each ref at that ind matches the corresponding indices in index_list
    index = library.get_index("Otzar Midrashim")
    nodes = index.nodes
    index_list, ref_list = nodes.text_index_map(tokenizer=tokenizer)
    mes_list = index.nodes.traverse_to_list(
        lambda n, _: TextChunk(n.ref(), "he").ja().flatten_to_array() if not n.children else [])
    mes_str_array = [w for seg in mes_list for w in tokenizer(seg)]

    rand_inds = [1,20,45,1046,len(index_list)-2]
    for ri in rand_inds:
        assert u' '.join(tokenizer(ref_list[ri].text("he").text)) == u' '.join(mes_str_array[index_list[ri]:index_list[ri+1]])

    index = library.get_index("Genesis")
    nodes = index.nodes
    index_list, ref_list = nodes.text_index_map(tokenizer=tokenizer, lang="he", vtitle="Tanach with Text Only")
    mes_list = index.nodes.traverse_to_list(
        lambda n, _: TextChunk(n.ref(), lang="he", vtitle="Tanach with Text Only").ja().flatten_to_array() if not n.children else [])
    mes_str_array = [w for seg in mes_list for w in tokenizer(seg)]

    rand_inds = [1, 20, 245, len(index_list)-2]
    for ri in rand_inds:
        assert u' '.join(tokenizer(ref_list[ri].text(lang="he",vtitle="Tanach with Text Only").text)) == u' '.join(mes_str_array[index_list[ri]:index_list[ri+1]])


def test_ja_node_with_hyphens():
    node = JaggedArrayNode()
    node.add_primary_titles(u'Title with-this', u'משהו')
    node.add_structure(['Something'])
    with pytest.raises(InputError):
        node.validate()

def test_ja_node_without_primary():
    node = JaggedArrayNode()
    node.add_title(u'Title with this', 'en')
    node.add_title(u'משהו', 'he')
    node.add_structure(['Something'])
    with pytest.raises(InputError):
        node.validate()

def test_non_ascii():
    node = JaggedArrayNode()
    node.add_primary_titles(u'Title with this\u2019', u'משהו')
    node.add_structure(['Something'])
    with pytest.raises(InputError):
        node.validate()
