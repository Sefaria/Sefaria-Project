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
    v = Version().load({'title': 'Delete Me'})
    v.delete()
    i = Index().load({'title': 'Delete Me'})
    i.delete()


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
    assert isinstance(Note().load({'ref': 'Delete Me, Part 1 1:1:1'}), Note)
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
    assert isinstance(Note().load({'ref': 'Delete Me, Part 1 1:1'}), Note)
    assert library.get_index('Delete Me').get_alt_structure('alt').wholeRef == u'Delete Me, Part1 1:2-3:1'
