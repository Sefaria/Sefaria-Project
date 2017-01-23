# encoding=utf-8
from sefaria.model import *
from sefaria.helper import schema
import pytest


@pytest.mark.deep
def setup_module():
    print 'Creating Dummy Index'

    # ensure dummy index was properly deleted
    index = Index().load({'title': 'Delete Me'})
    if index is not None:
        ls = LinkSet(Ref("Delete Me"))
        ls.delete()
        ns = NoteSet({"ref": {"$regex": "Delete Me.*"}})
        ns.delete()
        index.delete()

    # Build an index with some nodes
    root = SchemaNode()
    root.add_title('Delete Me', 'en', primary=True)
    root.add_title(u'תמחק אותי', 'he', primary=True)
    root.key = 'Delete Me'

    part1 = JaggedArrayNode()
    part1.add_title('Part1', 'en', primary=True)
    part1.add_title("Partone", 'en')
    part1.add_title(u'חלק 1', 'he', primary=True)
    part1.sectionNames = ['Chapter', 'Verse']
    part1.addressTypes = ['Integer', 'Integer']
    part1.depth = 2
    part1.key = 'Part1'
    root.append(part1)

    part2 = JaggedArrayNode()
    part2.add_title('Part2', 'en', primary=True)
    part2.add_title(u'חלק 2', 'he', primary=True)
    part2.sectionNames = ['Section', 'Segment']
    part2.addressTypes = ['Integer', 'Integer']
    part2.depth = 2
    part2.key = 'Part2'
    root.append(part2)

    root.validate()

    alt = ArrayMapNode()
    alt.depth = 0
    alt.wholeRef = 'Delete Me, Part1 1:2-3:1'
    alt.add_title('Something', 'en', True)
    alt.add_title(u'משהו', 'he', True)

    index = Index({
        'schema': root.serialize(),
        'title': 'Delete Me',
        'categories': ['Dummy'],
        'alt_structs': {'alt': alt.serialize()}
    })
    index.save()

    # add some text
    v = Version({
        "language": "en",
        "title": "Delete Me",
        "versionSource": "http://foobar.com",
        "versionTitle": "Schema Test",
        "chapter": root.create_skeleton()
    }).save()

    p1 = [['Part1 part1', 'Part1'], ['Part1'], ['Part1', '', 'part1']]
    chunk = TextChunk(Ref('Delete Me, Part1'), 'en', 'Schema Test')
    chunk.text = p1
    chunk.save()

    p2 = [['Part2 part2', 'Part2'], ['Part2'], ['Part2', '', 'part2']]
    chunk = TextChunk(Ref('Delete Me, Part2'), 'en', 'Schema Test')
    chunk.text = p2
    chunk.save()

    # add some links
    Link({
        'refs': ['Delete Me, Part1 1:1', 'Shabbat 2a:5'],
        'type': 'None'
    }).save()
    Link({
        'refs': ['Delete Me, Part1 2:1', 'Delete Me, Part2 2:1'],
        'type': 'None'
    }).save()
    Link({
        'refs': ['Delete Me, Part1 3', 'Shabbat 2a:5'],
        'type': 'None'
    }).save()
    Link({
        'refs': ['Delete Me, Part2 1:1', 'Shabbat 2a:5'],
        'type': 'None'
    }).save()
    Link({
        'refs': ['Delete Me, Part2 3', 'Shabbat 2a:5'],
        'type': 'None'
    }).save()

    # add a note
    Note({
        'owner': 23432,
        'public': False,
        'text': 'Some very important text',
        'type': 'note',
        'ref': 'Delete Me, Part1 1:1'

    }).save()
    print 'End of test setup'


@pytest.mark.deep
def teardown_module():
    print 'Cleaning Up'
    ls = LinkSet(Ref("Delete Me"))
    ls.delete()
    ns = NoteSet({"ref": {"$regex": "Delete Me.*"}})
    ns.delete()
    v = Version().load({'title': 'Delete Me'})
    v.delete()
    i = Index().load({'title': 'Delete Me'})
    i.delete()




@pytest.mark.deep
def test_migrate_to_complex_structure():
    try:
        library.get_index("Crazy").delete()
        library.get_index("Complex Crazy").delete()
    except IndexError:
        pass

    index = Index().load({'title': 'Crazy'})
    if index is not None:
        ls = LinkSet(Ref("Crazy"))
        ls.delete()
        ns = NoteSet({"ref": {"$regex": "Crazy.*"}})
        ns.delete()
        index.delete()

    # Build an index with some nodes
    root = JaggedArrayNode()
    root.add_title('Crazy', 'en', primary=True)
    root.add_title(u'משוגע', 'he', primary=True)
    root.key = 'Crazy'
    root.depth = 2
    root.addressTypes = ["Integer", "Integer"]
    root.sectionNames = ["Siman", "Paragraph"]
    root.validate()

    index = Index({
        'schema': root.serialize(),
        'title': 'Crazy',
        'categories': ['Craziness'],
    })
    index.save()

    p1 = "Gonna be a Trump tower in every city?"
    p2 = "Maybe re-naming every organ of the body to Trump?"
    chunk = TextChunk(Ref('Crazy 1:1'), 'en', 'Schema Test')
    chunk.text = p1
    chunk.save()
    chunk = TextChunk(Ref("Crazy 2:2"), 'en', 'Schema Test')
    chunk.text = p2
    chunk.save()

    Link({
        'refs': ['Crazy 1:1', 'Guide for the Perplexed, Part 1'],
        'type': 'None'
    }).save()

    Link({
        'refs': ['Crazy 2:2', 'Guide for the Perplexed, Part 2'],
        'type': 'None'
    }).save()

    new_schema = SchemaNode()
    new_schema.key = "Crazy"
    new_schema.add_title("Crazy", "en", primary=True)
    new_schema.add_title(u"משוגע", "he", primary=True)

    j1 = JaggedArrayNode()
    j1.add_title('Trump', 'en', primary=True)
    j1.add_title(u'טראמפ', 'he', primary=True)
    j1.key = 'Trump'
    j1.depth = 1
    j1.addressTypes = ["Integer"]
    j1.sectionNames = ["Paragraph"]

    j2 = JaggedArrayNode()
    j2.add_title('Americans', 'en', primary=True)
    j2.add_title(u'אמרקיים', 'he', primary=True)
    j2.key = 'Americans'
    j2.depth = 1
    j2.addressTypes = ["Integer"]
    j2.sectionNames = ["Paragraph"]

    new_schema.append(j1)
    new_schema.append(j2)
    new_schema.validate()


    mappings = {}

    mappings["Crazy 1"] = "Crazy, Trump"
    mappings["Crazy 2"] = "Crazy, Americans"

    schema.migrate_to_complex_structure("Crazy", new_schema.serialize(), mappings)

    #Test that Crazy has two children named Trump and Americans, test the text, test the links

    children = library.get_index("Complex Crazy").nodes.children

    assert children[0].full_title() == "Complex Crazy, Trump"
    assert children[1].full_title() == "Complex Crazy, Americans"

    assert TextChunk(children[0].ref(), "en", 'Schema Test').text == [p1]
    assert TextChunk(children[1].ref(), "en", "Schema Test").text == ["", p2]

    assert isinstance(Link().load({'refs': ['Complex Crazy, Trump 1', 'Guide for the Perplexed, Part 1'],}), Link)
    assert isinstance(Link().load({'refs': ['Complex Crazy, Americans 2', 'Guide for the Perplexed, Part 2'],}), Link)

    library.get_index("Complex Crazy").delete()
    library.get_index("Crazy").delete()




@pytest.mark.deep
def test_change_node_title():
    node = library.get_index("Delete Me").nodes.children[0]
    schema.change_node_title(node, "Part1", "en", "1st Part")
    node = library.get_index("Delete Me").nodes.children[0]
    assert node.primary_title() == "1st Part"
    assert len(node.get_titles()) == 3
    assert isinstance(Link().load({'refs': ['Delete Me, 1st Part 1:1', 'Shabbat 2a:5']}), Link)
    assert isinstance(Link().load({'refs': ['Delete Me, 1st Part 2:1', 'Delete Me, Part2 2:1']}), Link)
    assert isinstance(Note().load({'ref': 'Delete Me, 1st Part 1:1'}), Note)
    assert Link().load({'refs': ['Delete Me, Part1 2:1', 'Delete Me, Part2 2:1']}) is None
    assert Note().load({'ref': 'Delete Me, Part1 1:1'}) is None

    schema.change_node_title(node, "1st Part", "en", "Part1")
    node = library.get_index("Delete Me").nodes.children[0]
    assert node.primary_title() == "Part1"

    schema.change_node_title(node, "Partone", "en", "Part One")
    node = library.get_index("Delete Me").nodes.children[0]
    assert len(node.get_titles()) == 3
    assert any([title['text'] == 'Part One' for title in node.get_titles()])

    schema.change_node_title(node, "Part One", "en", "Partone")
    assert len(node.get_titles()) == 3
    assert any([title['text'] == 'Partone' for title in node.get_titles()])


@pytest.mark.deep
def test_change_node_structure():

    # increase depth
    node = library.get_index('Delete Me').nodes.children[0]
    schema.change_node_structure(node, ['SuperSection', 'Section', 'Segment'])

    assert node.depth == 3
    chunk = TextChunk(Ref('Delete Me, Part1'), 'en', 'Schema Test')
    assert chunk.text == [[['Part1 part1'], ['Part1']], [['Part1']], [['Part1'], [], ['part1']]]
    assert isinstance(Link().load({'refs': ['Delete Me, Part1 1:1:1', 'Shabbat 2a:5'],}), Link)
    assert isinstance(Link().load({'refs': ['Delete Me, Part1 2:1:1', 'Delete Me, Part2 2:1'], }), Link)
    assert isinstance(Link().load({'refs': ['Delete Me, Part1 3:1', 'Shabbat 2a:5'], }), Link)
    assert isinstance(Link().load({'refs': ['Delete Me, Part2 1:1', 'Shabbat 2a:5'], }), Link)
    assert isinstance(Link().load({'refs': ['Delete Me, Part2 3', 'Shabbat 2a:5'], }), Link)
    assert isinstance(Note().load({'ref': 'Delete Me, Part1 1:1:1'}), Note)
    assert library.get_index('Delete Me').get_alt_structure('alt').wholeRef == u'Delete Me, Part1 1:2:1-3:1:1'

    # decrease depth
    node = library.get_index('Delete Me').nodes.children[0]
    schema.change_node_structure(node, ['Section', 'Segment'])

    assert node.depth == 2
    chunk = TextChunk(Ref('Delete Me, Part1'), 'en', 'Schema Test')
    assert chunk.text == [['Part1 part1', 'Part1'], ['Part1'], ['Part1', '', 'part1']]
    assert isinstance(Link().load({'refs': ['Delete Me, Part1 1:1', 'Shabbat 2a:5'], }), Link)
    assert isinstance(Link().load({'refs': ['Delete Me, Part1 2:1', 'Delete Me, Part2 2:1'], }), Link)
    assert isinstance(Link().load({'refs': ['Delete Me, Part1 3', 'Shabbat 2a:5'], }), Link)
    assert isinstance(Link().load({'refs': ['Delete Me, Part2 1:1', 'Shabbat 2a:5'], }), Link)
    assert isinstance(Link().load({'refs': ['Delete Me, Part2 3', 'Shabbat 2a:5'], }), Link)
    assert isinstance(Note().load({'ref': 'Delete Me, Part1 1:1'}), Note)
    assert library.get_index('Delete Me').get_alt_structure('alt').wholeRef == u'Delete Me, Part1 1:2-3:1'
