import pytest
from sefaria.model import *
from sefaria.system.exceptions import InputError

@pytest.fixture()
def index_offsets_by_depth():
    return {
            '1': 4,
            '2': [0, 3, 6, 9],
            '3': [[0, 2], [2, 6], [8, 10], [12, 14]]
        }

@pytest.fixture()
def node(index_offsets_by_depth):
    node = JaggedArrayNode({'depth': 3,
                            'addressTypes': ['Integer', 'Talmud', 'Integer'],
                            'sectionNames': ['Chapter','Chapter', 'Chapter'],
                            'index_offsets_by_depth': index_offsets_by_depth
                            })
    node.add_primary_titles('test', 'בדיקה')
    return node

@pytest.fixture()
def false_node(node):
    node.index_offsets_by_depth['1'] = [5]
    return node

@pytest.fixture()
def another_false_node(node):
    node.index_offsets_by_depth['3'] = [1, 2, 5]
    return node

def test_node(node):
    node.validate()

def test_false_node(false_node):
    with pytest.raises(AssertionError):
        false_node.validate()

def test_another_false_node(another_false_node):
    with pytest.raises(TypeError):
        another_false_node.validate()

@pytest.fixture()
def index(node):
    index = Index({'title': 'test',
              'categories': ['Talmud'],
              'schema': node.serialize()})
    index.save()
    yield index
    index.delete()

@pytest.fixture()
def text():
    return [[['hello', 'world'], ['my', 'name']], [['is'], ['skippy']], [['and', 'I'], ['am', 'going']], [['to', 'sleep'], ['now', 'bye']]]

@pytest.fixture()
def version(index, text):
    v = Version({
        "language": 'en',
        "title": 'test',
        "versionSource": '',
        "versionTitle": 'test',
        "chapter": text
    })
    return v

def test_version(version):
    version._validate()
    version.chapter.append([['bar']])
    with pytest.raises(AssertionError):
        version._validate()

def test_invalid_version(version):
    version.chapter[0].append(['foo', 'bar'])
    with pytest.raises(AssertionError):
        version._validate()

@pytest.fixture()
def textchunck(text, index):
    t = Ref('test').text('en', 'test')
    t.text = text
    t.save()
    index.versionState().refresh()
    yield
    Version().load({'title': 'Test'}).delete()

def test_refs(textchunck, index, node):
    assert Ref('test 5').sections == [1]
    with pytest.raises(InputError):
        Ref('test 4')
    assert Ref('test 7:4b:15').sections == [3, 2, 5]
    with pytest.raises(InputError):
        Ref('test 10:1')
    assert Ref('test 5:1a:1-7:4b:15').toSections == [3, 2, 5]
    assert Ref('test 5:1a:1-7:4b:15').sections == [1, 1, 1]
    assert Ref(_obj={'index': index,
                 'book': 'Test',
                 'primary_category': 'Talmud',
                 'index_node': node,
                 'sections': [1, 1, 1],
                 'toSections': [3, 2, 5]}) == Ref('test 5:1a:1-7:4b:15')
    assert Ref('Test 5-6').all_segment_refs() == [Ref('Test 5:1a:1'), Ref('Test 5:1a:2'), Ref('Test 5:1b:3'), Ref('Test 5:1b:4'),  Ref('Test 6:2b:3'), Ref('Test 6:3a:7')]

def test_text(textchunck):
    assert Ref('Test 5').text('en').text == [['hello', 'world'], ['my', 'name']]
    assert Ref('Test 5:1b:4-7:4a:10').text('en').text == [[['name']], [['is'], ['skippy']], [['and', 'I']]]

def test_api(textchunck, index_offsets_by_depth):
    tf = TextFamily(Ref('Test'), pad=False)
    assert tf.contents()['index_offsets_by_depth'] == index_offsets_by_depth
    tf = TextFamily(Ref('Test 5:1b:4-7:4a:9'), pad=False)
    assert tf.contents()['index_offsets_by_depth'] == {
            '1': 4,
            '2': [0, 3, 6],
            '3': [[2], [2, 6], [8]]
        }
    tf = TextFamily(Ref('Test 6:2b:7-7:4a:9'), pad=False)
    assert tf.contents()['index_offsets_by_depth'] == {
            '1': 4,
            '2': [3, 6],
            '3': [[2, 6], [8]]
        }
    tf = TextFamily(Ref('Test 6:3a:7-7:4a:9'), pad=False)
    assert tf.contents()['index_offsets_by_depth'] == {
            '1': 4,
            '2': [3, 6],
            '3': [[6], [8]]
        }
