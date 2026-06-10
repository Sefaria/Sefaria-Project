# encoding=utf-8
import re
import django
django.setup()
from sefaria.model import *
from sefaria.helper import schema
from sefaria.sheets import save_sheet
from sefaria.system.database import db
from sefaria.system.exceptions import BookNameError
import pytest


"""
Here is the text structure for the simple text MigrateBook
[
    [
        'This should eventually end up in MigrateBook, Part 1, 1:1',
        'This text is for 1:2-5',
        'This text is for 1:2-5', 'This text is for 1:2-5',
        'This text is for 1:2-5'
    ],
    [
        '',
        'This should eventually end up in MigrateBook, Part 1, 2:2'
    ],
    [
        '',
        '',
        'This should eventually end up in MigrateBook, Part 2, 3',
        '',
        'This text is just to allow for range 3:1-5'
    ],
    [
        'This should eventually end up in MigrateBook, Part 3, 1'
    ],
    [
        '',
        '',
        '',
        'This will eventually go nowhere'
    ]
]
"""

TEST_SHEET_ID = None


def create_test_sheet(list_of_trefs):
    sheet = {
        'title': 'schema test sheet',
        'status': 'unlisted',
        'tags': [],
        'options': {
            'language': 'english',
            'numbered': False,
        },
        'sources': []
    }
    for tref in list_of_trefs:
        sheet['sources'].append(
            {'ref': tref}
        )
    return sheet


def get_sheet_refs(sheet_id):
    sheet_json = db.sheets.find_one({'id': sheet_id})
    assert sheet_json is not None
    return [source.get('ref', '') for source in sheet_json['sources']]


def get_text_for_simple_text():
    return [
        "This should eventually end up in MigrateBook, Part 1, 1:1",
        "This should eventually end up in MigrateBook, Part 1, 2:2",
        "This should eventually end up in MigrateBook, Part 2, 3",
        "This should eventually end up in MigrateBook, Part 3, 1",
        "This will eventually go nowhere",
        "This text is just to allow for range 3:1-5",
        "This text is for 1:2-5",
    ]


def create_simple_text():
    try:
        library.get_index("Complex MigrateBook").delete()
        library.get_index("MigrateBook").delete()
    except BookNameError:
        pass

    index = Index().load({'title': 'MigrateBook'})
    if index is not None:
        ls = LinkSet(Ref("MigrateBook"))
        ls.delete()
        ns = NoteSet({"ref": {"$regex": "MigrateBook.*"}})
        ns.delete()
        index.delete()

    # Build an index with some nodes
    root = JaggedArrayNode()
    root.add_title('MigrateBook', 'en', primary=True)
    root.add_title('הספר', 'he', primary=True)
    root.key = 'MigrateBook'
    root.depth = 2
    root.addressTypes = ["Integer", "Integer"]
    root.sectionNames = ["Siman", "Paragraph"]
    root.validate()

    index = Index({
        'schema': root.serialize(),
        'title': 'MigrateBook',
        'categories': ['Liturgy'],
    })
    index.save()

    p1, p2, p3, p4, p5, p6, p7 = get_text_for_simple_text()

    chunk = TextChunk(Ref('MigrateBook 1:1'), 'en', 'Schema Test')
    chunk.text = p1
    chunk.save()
    for i in range(4):
        chunk = TextChunk(Ref("MigrateBook 1:{}".format(i+2)), 'en', 'Schema Test')
        chunk.text = p7
        chunk.save()
    chunk = TextChunk(Ref("MigrateBook 2:2"), 'en', 'Schema Test')
    chunk.text = p2
    chunk.save()
    chunk = TextChunk(Ref("MigrateBook 3:3"), 'en', 'Schema Test')
    chunk.text = p3
    chunk.save()
    chunk = TextChunk(Ref("MigrateBook 3:5"), 'en', 'Schema Test')
    chunk.text = p6
    chunk.save()
    chunk = TextChunk(Ref("MigrateBook 4:1"), 'en', 'Schema Test')
    chunk.text = p4
    chunk.save()
    chunk = TextChunk(Ref("MigrateBook 5:4"), 'en', 'Schema Test')
    chunk.text = p5
    chunk.save()

    Link({
        'refs': ['MigrateBook 1:1', 'Guide for the Perplexed, Part 1'],
        'type': 'None'
    }).save()

    Link({
        'refs': ['MigrateBook 2:2', 'Guide for the Perplexed, Part 1 2'],
        'type': 'None'
    }).save()

    Link({
        'refs': ['MigrateBook 3:3', 'Guide for the Perplexed, Part 2 4-8'],
        'type': 'None'
    }).save()

    Link({
        'refs': ['MigrateBook 4:1', 'Guide for the Perplexed, Part 3 1'],
        'type': 'None'
    }).save()

    Link({
        'refs': ['MigrateBook 5:4', 'Guide for the Perplexed, Introduction, Introduction 3'],
        'type': 'None'
    }).save()

    Link({
        'refs': ['MigrateBook 1:2-5', 'Genesis 3'],
        'type': 'None'
    }).save()

    Link({
        'refs': ['MigrateBook 2', 'Genesis 2'],
        'type': 'None'
    }).save()

    VersionState("MigrateBook").refresh()


@pytest.mark.deep
def setup_module():
    print('Creating Dummy Index')

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
    root.add_title('תמחק אותי', 'he', primary=True)
    root.key = 'Delete Me'

    part1 = JaggedArrayNode()
    part1.add_title('Part1', 'en', primary=True)
    part1.add_title("Partone", 'en')
    part1.add_title('חלק 1', 'he', primary=True)
    part1.sectionNames = ['Chapter', 'Verse']
    part1.addressTypes = ['Integer', 'Integer']
    part1.depth = 2
    part1.key = 'Part1'
    root.append(part1)

    part2 = JaggedArrayNode()
    part2.add_title('Part2', 'en', primary=True)
    part2.add_title('חלק 2', 'he', primary=True)
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
    alt.add_title('משהו', 'he', True)

    index = Index({
        'schema': root.serialize(),
        'title': 'Delete Me',
        'categories': ['Tanakh'],
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

    # an empty version
    v = Version({
        "language": "en",
        "title": "Delete Me",
        "versionSource": "http://foobar.com",
        "versionTitle": "Schema Test Blank",
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

    VersionState("Delete Me").refresh()
    sheet = save_sheet(create_test_sheet([
        'Delete Me, Part1 1:1',
        'MigrateBook 1:1',
        'MigrateBook 4:1'
    ]), 1)
    global TEST_SHEET_ID
    TEST_SHEET_ID = sheet['id']

    # set up the simple text
    create_simple_text()

    print('End of test setup')


@pytest.mark.deep
def teardown_module():
    print('Cleaning Up')
    ls = LinkSet(Ref("Delete Me"))
    ls.delete()
    ns = NoteSet({"ref": {"$regex": "Delete Me.*"}})
    ns.delete()
    v = VersionSet({'title': 'Delete Me'})
    v.delete()
    i = Index().load({'title': 'Delete Me'})
    i.delete()
    global TEST_SHEET_ID
    if TEST_SHEET_ID:
        db.sheets.delete_one({'id': TEST_SHEET_ID})
        TEST_SHEET_ID = None
    try:
        library.get_index("MigrateBook").delete()
    except BookNameError:
        pass


@pytest.mark.deep
def test_migrate_to_complex_structure():
    mappings = {
        "MigrateBook 1-2": "MigrateBook, Part 1",
        "MigrateBook 3:1-3": "MigrateBook, Part 2",
        "MigrateBook 4": "MigrateBook, Part 3"
    }

    new_schema = SchemaNode()
    new_schema.key = "MigrateBook"
    new_schema.add_title("MigrateBook", "en", primary=True)
    new_schema.add_title("הספר", "he", primary=True)

    depths = [2, 1, 2, 1, 1, 1, 1, 1, 1, 1]
    for i in range(10):
        ja = JaggedArrayNode()
        ja.add_title('Part {}'.format(i+1), 'en', primary=True)
        ja.add_title('חלק {}'.format(i+1), 'he', primary=True)
        ja.key = str(i)
        ja.depth = depths[i]
        ja.addressTypes = ["Integer"] * depths[i]
        ja.sectionNames = ["Paragraph"] * depths[i]
        new_schema.append(ja)

    new_schema.validate()

    schema.migrate_to_complex_structure("MigrateBook", new_schema.serialize(), mappings)
    with pytest.raises(BookNameError):
        library.get_index("Complex MigrateBook")
    children = library.get_index("MigrateBook").nodes.children

    assert children[0].full_title() == "MigrateBook, Part 1"
    assert children[1].full_title() == "MigrateBook, Part 2"

    p1, p2, p3, p4, p5, p6, p7 = get_text_for_simple_text()

    assert TextChunk(children[0].ref(), "en", 'Schema Test').text == [[p1, p7, p7, p7, p7], ["", p2]]
    assert TextChunk(children[1].ref(), "en", "Schema Test").text == ["", "", p3]
    assert TextChunk(children[2].ref(), "en", "Schema Test").text == [[p4]]

    assert isinstance(Link().load({'refs': sorted(['MigrateBook, Part 1 1:1', 'Guide for the Perplexed, Part 1']),}), Link)
    assert isinstance(Link().load({'refs': sorted(['MigrateBook, Part 1 2:2', 'Guide for the Perplexed, Part 1 2']),}), Link)
    assert isinstance(Link().load({'refs': sorted(['MigrateBook, Part 2 3', 'Guide for the Perplexed, Part 2 4-8']),}), Link)
    assert isinstance(Link().load({'refs': sorted(['MigrateBook, Part 3 1', 'Guide for the Perplexed, Part 3 1']),}), Link)
    assert Link().load({'refs': sorted(['MigrateBook 5:4', 'Guide for the Perplexed, Introduction, Introduction, 3']),}) is None
    assert isinstance(Link().load({'refs': sorted(['MigrateBook, Part 1 1:2-5', 'Genesis 3']),}), Link)
    assert isinstance(Link().load({'refs': sorted(['MigrateBook, Part 1 2', 'Genesis 2']),}), Link)

    sheet_sources = get_sheet_refs(TEST_SHEET_ID)
    assert all(not re.match(r'^MigrateBook [0-9]', source) for source in sheet_sources)
    assert any('MigrateBook, Part 1' in source for source in sheet_sources)
    assert any('MigrateBook, Part 3' in source for source in sheet_sources)

    # we don't go from complex back to simple, so we'll delete and recreate the simple index\
    # idempotency is broken in the event of a failed test
    library.get_index("MigrateBook").delete()
    create_simple_text()


@pytest.mark.deep
def test_change_node_title():
    node = library.get_index("Delete Me").nodes.children[0]
    schema.change_node_title(node, "Part1", "en", "1st Part")
    node = library.get_index("Delete Me").nodes.children[0]
    assert node.primary_title() == "1st Part"
    assert len(node.get_titles_object()) == 3
    assert isinstance(Link().load({'refs': ['Delete Me, 1st Part 1:1', 'Shabbat 2a:5']}), Link)
    assert isinstance(Link().load({'refs': ['Delete Me, 1st Part 2:1', 'Delete Me, Part2 2:1']}), Link)
    assert isinstance(Note().load({'ref': 'Delete Me, 1st Part 1:1'}), Note)
    assert Link().load({'refs': ['Delete Me, Part1 2:1', 'Delete Me, Part2 2:1']}) is None
    assert Note().load({'ref': 'Delete Me, Part1 1:1'}) is None
    sheet_refs = get_sheet_refs(TEST_SHEET_ID)
    assert any('Delete Me, 1st Part' in s for s in sheet_refs)
    assert all('Delete Me, Part1' not in s for s in sheet_refs)

    schema.change_node_title(node, "1st Part", "en", "Part1")
    node = library.get_index("Delete Me").nodes.children[0]
    assert node.primary_title() == "Part1"

    schema.change_node_title(node, "Partone", "en", "Part One")
    node = library.get_index("Delete Me").nodes.children[0]
    assert len(node.get_titles_object()) == 3
    assert any([title['text'] == 'Part One' for title in node.get_titles_object()])

    schema.change_node_title(node, "Part One", "en", "Partone")
    assert len(node.get_titles_object()) == 3
    assert any([title['text'] == 'Partone' for title in node.get_titles_object()])

    sheet_refs = get_sheet_refs(TEST_SHEET_ID)
    assert any('Delete Me, Part1' in s for s in sheet_refs)
    assert all('Delete Me, 1st Part' not in s for s in sheet_refs)


@pytest.mark.deep
def test_change_node_structure_complex():

    # increase depth
    node = library.get_index('Delete Me').nodes.children[0]
    schema.change_node_structure(node, ['SuperSection', 'Section', 'Segment'])

    assert node.depth == 3
    chunk = TextChunk(Ref('Delete Me, Part1'), 'en', 'Schema Test')
    assert chunk.text == [[['Part1 part1'], ['Part1']], [['Part1']], [['Part1'], [], ['part1']]]
    blank_chunk = TextChunk(Ref('Delete Me, Part1'), 'en', 'Schema Test Blank')
    assert len(blank_chunk.text) == 0
    assert isinstance(Link().load({'refs': ['Delete Me, Part1 1:1:1', 'Shabbat 2a:5'],}), Link)
    assert isinstance(Link().load({'refs': ['Delete Me, Part1 2:1:1', 'Delete Me, Part2 2:1'], }), Link)
    assert isinstance(Link().load({'refs': ['Delete Me, Part1 3:1', 'Shabbat 2a:5'], }), Link)
    assert isinstance(Link().load({'refs': ['Delete Me, Part2 1:1', 'Shabbat 2a:5'], }), Link)
    assert isinstance(Link().load({'refs': ['Delete Me, Part2 3', 'Shabbat 2a:5'], }), Link)
    assert isinstance(Note().load({'ref': 'Delete Me, Part1 1:1:1'}), Note)
    assert library.get_index('Delete Me').get_alt_structure('alt').wholeRef == 'Delete Me, Part1 1:2:1-3:1:1'

    sheet_refs = get_sheet_refs(TEST_SHEET_ID)
    assert any('Delete Me, Part1 1:1:1' in s for s in sheet_refs)
    assert all(not re.search(r'Delete Me, Part 1 1:1$', s) for s in sheet_refs)

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
    assert library.get_index('Delete Me').get_alt_structure('alt').wholeRef == 'Delete Me, Part1 1:2-3:1'

    sheet_refs = get_sheet_refs(TEST_SHEET_ID)
    assert all('Delete Me, Part1 1:1:1' not in s for s in sheet_refs)
    assert any(re.search(r'Delete Me, Part1 1:1$', s) for s in sheet_refs)


@pytest.mark.deep
def test_change_node_structure_simple():
    # increase depth
    node = library.get_index("MigrateBook").nodes
    schema.change_node_structure(node, ['SuperSection', 'Section', 'Segment'])

    assert node.depth == 3
    tc = TextChunk(Ref("MigrateBook 2:2:1"), "en", "Schema Test")
    assert tc.text == 'This should eventually end up in MigrateBook, Part 1, 2:2'

    # change depth back to 2
    node = library.get_index("MigrateBook").nodes
    schema.change_node_structure(node, ['Section', 'Segment'])
    assert node.depth == 2
    tc = TextChunk(Ref("MigrateBook 2:2"), "en", "Schema Test")
    assert tc.text == 'This should eventually end up in MigrateBook, Part 1, 2:2'

