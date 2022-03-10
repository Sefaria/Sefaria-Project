# -*- coding: utf-8 -*-

import pytest
from sefaria.model import *
import re
from sefaria.system.exceptions import InputError, BookNameError



def setup_module(module):
    global root
    root = SchemaNode()
    root.add_title("Orot", "en", primary=True)
    root.add_title("אורות", "he", primary=True)
    root.key = "Orot"

    part1 = SchemaNode()
    part1.add_title("אורות מאופל", "he", primary=True)
    part1.add_title("Lights from Darkness", "en", primary=True)
    part1.key = "from darkness"

    part2 = JaggedArrayNode()
    part2.add_title("למהלך האידיאות בישראל", "he", primary=True)
    part2.add_title("The Process of Ideals in Israel", "en", primary=True)
    part2.depth = 1
    part2.lengths = [6]
    part2.sectionNames = ["Chapter"]
    part2.addressTypes = ["Integer"]
    part2.key = "ideals"

    part3 = JaggedArrayNode()
    part3.add_title("זרעונים", "he", primary=True)
    part3.add_title("Seeds", "en", primary=True)
    part3.depth = 1
    part3.lengths = [8]
    part3.sectionNames = ["Chapter"]
    part3.addressTypes = ["Integer"]
    part3.key = "seeds"

    part4 = JaggedArrayNode()
    part4.add_title("אורות ישראל", "he", primary=True)
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
        ["ארץ ישראל","Land of Israel", 8],
        ["המלחמה", "War", 10],
        ["ישראל ותחיתו", "Israel and its Rebirth", 32],
        ["אורות התחיה", "Lights of Rebirth", 72],
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
    n.add_title("קריאה גדולה", "he", primary=True)
    n.depth = 1
    n.sectionNames = ["Paragraph"]
    n.addressTypes = ["Integer"]
    n.append_to(part1)


    # Part 2
    part2_subsections = [
        ["האידיאה האלהית והאידיאה הלאומית באדם", "The Godly and the National Ideal in the Individual"],
        ["האידיאה האלהית והאידיאה הלאומית בישראל", "The Godly and the National Ideal in Israel"],
        ["מצב הירידה והפרוד בין האידיאות", "Dissolution of Ideals"],
        ["המצב בגלות", "The Situation in Exile"],
        ["בית ראשון ובית שני. האידיאה הדתית. המצב הישראלי ויחוסו לאנושיות", "The First and Second Temples; Religion"],
        ["התאחדות האידיאות בכנסת ישראל בתחיתה בארצה, רשמי דרכיה ופעולותיה", "Unification of Ideals"]
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
        ["צמאון לאל חי", "Thirst for the Living God"],
        ["חכם עדיף מנביא", "The Wise is Preferable to Prophet"],
        ["הנשמות של עולם התוהו", "The Souls of the World of Chaos"],
        ["מעשי יצירה", "Acts of Creation"],
        ["יסורים ממרקים", "Suffering Cleanses"],
        ["למלחמת הדעות והאמונות", "The War of Ideas"],
        ["נשמת הלאומיות וגופה", "National Soul and Body"],
        ["ערך התחיה", "The Value of Rebirth"]
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
        ["מהות כנסת ישראל ותכונה חייה", "The Essence of Israel", 16],
        ["קשר היחיד והכלל בישראל", "The Individual and the Collective", 8],
        ["התדבקות והתקשרות בכללות ישראל", "Connection to the Collective", 11],
        ["אהבת ישראל", "Love of Israel", 10],
        ["ישראל ואומות העולם", "Israel and the Nations", 16],
        ["לומיות ישראל", "Nationhood of Israel", 9],
        ["שלמות נשמת ישראל ותחיתו", "Israel's Soul and its Rebirth", 19],
        ["סגולת ישראל", "Preciousness of Israel", 9],
        ["קדושת ישראל", "Holiness of Israel", 9]
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
        s = re.sub(r'<.+?>','',s).strip()
        return re.split(r'\s+', s)


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
        assert ' '.join(tokenizer(ref_list[ri].text("he").text)) == ' '.join(mes_str_array[index_list[ri]:index_list[ri+1]])

    index = library.get_index("Genesis")
    nodes = index.nodes
    index_list, ref_list = nodes.text_index_map(tokenizer=tokenizer, lang="he", vtitle="Tanach with Text Only")
    mes_list = index.nodes.traverse_to_list(
        lambda n, _: TextChunk(n.ref(), lang="he", vtitle="Tanach with Text Only").ja().flatten_to_array() if not n.children else [])
    mes_str_array = [w for seg in mes_list for w in tokenizer(seg)]

    rand_inds = [1, 20, 245, len(index_list)-2]
    for ri in rand_inds:
        assert ' '.join(tokenizer(ref_list[ri].text(lang="he",vtitle="Tanach with Text Only").text)) == ' '.join(mes_str_array[index_list[ri]:index_list[ri+1]])


def test_ja_node_with_hyphens():
    node = JaggedArrayNode()
    node.add_primary_titles('Title with-this', 'משהו')
    node.add_structure(['Something'])
    with pytest.raises(InputError):
        node.validate()

def test_ja_node_without_primary():
    node = JaggedArrayNode()
    node.add_title('Title with this', 'en')
    node.add_title('משהו', 'he')
    node.add_structure(['Something'])
    with pytest.raises(InputError):
        node.validate()

def test_non_ascii():
    node = JaggedArrayNode()
    node.add_primary_titles('Title with this\u2019', 'משהו')
    node.add_structure(['Something'])
    with pytest.raises(InputError):
        node.validate()


@pytest.mark.deep
def test_nodes_missing_content():
    # check a known simple text and complex text
    assert library.get_index("Job").nodes.nodes_missing_content() == (False, [])
    assert library.get_index("Pesach Haggadah").nodes.nodes_missing_content() == (False, [])

    # construct a more complex schema. First, ensure that the index does not exist in the system
    try:
        test_index = library.get_index("test text")
        test_index.delete()
    except BookNameError:
        pass

    root_node = SchemaNode()
    root_node.add_primary_titles('test text', 'מבחן')
    middle1 = SchemaNode()
    middle1.add_primary_titles('mid1', 'אמצע1')
    for i in range(1, 4):
        leaf = JaggedArrayNode()
        leaf.add_primary_titles('leaf{}'.format(i), 'קצה{}'.format(i))
        leaf.add_structure(["Verse"])
        middle1.append(leaf)
    root_node.append(middle1)
    middle2 = SchemaNode()
    middle2.add_primary_titles('mid2', 'אמצע2')
    for i in range(4, 6):
        leaf = JaggedArrayNode()
        leaf.add_primary_titles('leaf{}'.format(i), 'קצה{}'.format(i))
        leaf.add_structure(["Verse"])
        middle2.append(leaf)
    root_node.append(middle2)
    root_node.validate()
    test_index = Index({
        'title': 'test text',
        'categories': ['Other'],
        'schema': root_node.serialize()
    })
    test_index.save()

    # add text
    chunk = Ref('test text, mid1, leaf1').text('en', 'test version')
    chunk.text = ['Lorem ipsum']
    chunk.save()

    result = test_index.nodes.nodes_missing_content()
    assert result[0] is False
    assert len(result[1]) == 3
    test_index.delete()

# Todo parametrize for all address types
def test_folio_type():
    folio = schema.AddressFolio(1)
    for i in [1,2,3,4,5,6,7,15,23,64,128]:
        assert folio.toNumber("en", folio.toStr("en", i)) == i


class TestDefaultNodeWithChildren:
    @classmethod
    def setup_class(cls):
        root_node = SchemaNode()
        root_node.add_primary_titles('test text', 'מבחן')
        leaf = JaggedArrayNode()
        leaf.add_primary_titles('leaf', 'קצה')
        leaf.add_structure(["Verse"])
        root_node.append(leaf)
        cls.test_index = Index({
            'title': 'test text',
            'categories': ['Tanakh'],
            'schema': root_node.serialize()
        })
        cls.test_index.save()
        cls.test_version = Version(
            {
                "chapter": cls.test_index.nodes.create_skeleton(),
                "versionTitle": "Version TEST",
                "versionSource": "blabla",
                "language": "en",
                "title": cls.test_index.title
            }
        )
        cls.test_version.save()

    @classmethod
    def teardown_class(cls):
        cls.test_index.delete()
        cls.test_version.delete()

    def test_default_node_with_children(self):
        from sefaria.helper.schema import insert_last_child, prepare_ja_for_children
        ja_parent = JaggedArrayNode()
        ja_parent.key = "default"
        ja_parent.default = True
        ja_parent.add_structure(["Part", "Perek"])
        insert_last_child(ja_parent, self.test_index.nodes)
        prepare_ja_for_children(ja_parent)

        # make sure prepare_ja_for_children worked
        v = Version().load({"title": self.test_index.title, "versionTitle": self.test_version.versionTitle})
        assert v.chapter['default'] == {}

        ja_leaf = JaggedArrayNode()
        ja_leaf.add_primary_titles('leaf2', 'קצה2')
        ja_leaf.add_structure(["Perek"])
        insert_last_child(ja_leaf, ja_parent)

        i = Index().load({"title": self.test_index.title})
        assert i.nodes.children[-1].children[-1].nodeType == "JaggedArrayNode"

        # verify that you can refer to leaf2 by either name or number
        assert Ref(f"{self.test_index.title}, leaf2") == Ref(f"{self.test_index.title} 1")

