
import sefaria.summaries as s
import sefaria.model as model
import sefaria.system.cache as scache



def test_update_table_of_contents():
    toc = s.update_table_of_contents()

    assert toc[0]["category"] == u'Tanach'
    assert toc[0]["contents"][0]["contents"][0]["title"] == u"Genesis"
    for n in toc:
        check_node(n)


def check_node(node):
    if set(node.keys()) == {'category', u'textComplete', u'percentAvailable', u'categories', u'availableCounts', 'num_texts', 'contents'}:
        for n in node["contents"]:
            check_node(n)
            return
    assert set(node.keys()) >= {u'sectionNames', 'availableCounts', u'title', 'isSparse', u'heTitle', 'percentAvailable', u'titleVariants', u'categories'}, node.keys()

def test_toc_update_in_index_change():
    toc = scache.get_cache_elem('toc_cache')
    assert toc[-1]['category'] == 'Other'
    for x in toc[-1]['contents']:
        if 'title' in x:
            continue
        if 'category' in x:
            assert x['category'] != 'Commentary'


    i = model.Index().load({"title": "Or HaChaim"})
    i.titleVariants.append("Or HaChaim HaKodesh")
    i.save()

    toc = scache.get_cache_elem('toc_cache')
    assert toc[-1]['category'] == 'Other'
    for x in toc[-1]['contents']:
        if 'title' in x:
            continue
        if 'category' in x:
            assert x['category'] != 'Commentary'
