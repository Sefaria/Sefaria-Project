
import pytest
import sefaria.summaries as s
import sefaria.model as model
import sefaria.system.cache as scache


#create, update, delete, change categories
# test that old title goes away on index title change (regular + commentary)
# test that no commentator is added
# no wandering commentaries

""" SOME UTILS """

def get_all_toc_locations(title, toc=None):
    if toc is None:
        toc = s.get_toc()
    """
    Finds ALL occurrences of a text title in the toc. Recursively looks through the ToC to find the category paths
    of the given title
    :param title: the title to look for.
    :return: a list of lists of categories leading to the title or an empty array if not found.
    """
    results = []
    for toc_elem in toc:
        #base element, a text- check if title matches.
        if 'title' in toc_elem:
            if toc_elem['title'] == title:
                #if there is a match, append to this recursion's list of results.
                results.append(True)
        #category
        elif 'category' in toc_elem:
            #first go down the tree
            sub_result = get_all_toc_locations(title, toc_elem['contents'])
            #add the current category name to any already-found results (since at this point we are on our way up from the recursion.
            if sub_result:
                for path in sub_result:
                    new_path = [toc_elem['category']] + path if isinstance(path, list) else [toc_elem['category']]
                    results.append(new_path)
    return results

def get_lang_keys():
    return {'he', 'en'}

def toc_path_to_string(toc_path):
    return ",".join(toc_path)

def verify_title_existence_in_toc(title, expected_toc_location = None):
    locations_in_toc = get_all_toc_locations(title)
    #a title should always be in the toc no more than once. 0 if we do not expect to find it there.
    num_appearances_in_toc = 1 if expected_toc_location is not None else 0
    assert len(locations_in_toc) == num_appearances_in_toc, "title appears %d times" % len(locations_in_toc)
    if expected_toc_location:
        assert toc_path_to_string(expected_toc_location) == toc_path_to_string(locations_in_toc[0]), locations_in_toc

""" SOME SETUP """

text_titles = model.VersionSet({}).distinct('title')
s.update_table_of_contents()
scache.delete_cache_elem('toc_cache')


""" THE TESTS """

def test_toc_integrity():
    toc = s.get_toc()
    recur_toc_integrity(toc)


def recur_toc_integrity(toc, depth=0):
     for toc_elem in toc:
        if 'category' in toc_elem:
            #verify proper category node (including that it doesnt have a title attr)
            verify_category_node_integrity(toc_elem, depth)
            recur_toc_integrity(toc_elem['contents'], depth+1)
        elif 'title' in toc_elem:
            #verify text leaf integrity
            verify_text_node_integrity(toc_elem)

def verify_category_node_integrity(node, depth):
    lang_keys = get_lang_keys()
    #check all required attributes
    #make sure contents is an array
    assert node['category'] == node['categories'][depth]
    assert set(node.keys()) == {'category', u'availableCounts', u'textComplete', u'percentAvailable', 'contents', 'num_texts', u'categories'}
    assert 'title' not in node
    assert isinstance(node['availableCounts'], dict)
    assert set(node['availableCounts'].keys()) == lang_keys
    assert isinstance(node['textComplete'], dict)
    assert set(node['textComplete'].keys()) == lang_keys
    assert isinstance(node['percentAvailable'], dict)
    assert set(node['percentAvailable'].keys()) == lang_keys
    assert isinstance(node['contents'], list)
    assert isinstance(node['num_texts'], int)

def verify_text_node_integrity(node):
    global text_titles
    lang_keys = get_lang_keys()
    #do we need to assert that the title is not equal to any category name?

    assert set(node.keys()) >= {u'title','availableCounts', u'sectionNames', 'isSparse', 'percentAvailable', u'titleVariants', u'categories', 'textDepth'}, node.keys()
    assert (node['title'] in text_titles) or (not model.Index().load({"title": node['title']}).is_commentary()), node['title']
    assert 'category' not in node
    assert isinstance(node['availableCounts'], dict)
    assert set(node['availableCounts'].keys()) == lang_keys
    assert isinstance(node['percentAvailable'], dict)
    assert set(node['percentAvailable'].keys()) == lang_keys



def test_index_add_delete():
    #test that the index
    new_index = model.Index({
        "title": "New Toc Test",
        "titleVariants": [],
        "sectionNames": ["Chapter", "Paragraph"],
        "categories": ["Philosophy"]
    })
    verify_title_existence_in_toc(new_index.title, None)
    new_index.save()
    verify_title_existence_in_toc(new_index.title, new_index.categories)
    new_index.delete()
    verify_title_existence_in_toc(new_index.title, None)

    #commentator alone should not be in the toc
    new_commentator = model.Index({
        "title": "New Toc Commentator Test",
        "titleVariants": [],
        "sectionNames": ["Chapter", "Paragraph"],
        "categories": ["Commentary"]
    })
    new_commentator.save()
    verify_title_existence_in_toc(new_commentator.title, None)
    new_commentator.delete()
    verify_title_existence_in_toc(new_commentator.title, None)

    new_other_index = model.Index({
        "title": "New Toc Test",
        "titleVariants": [],
        "sectionNames": ["Chapter", "Paragraph"],
        "categories": ["Testing"]
    })
    verify_title_existence_in_toc(new_other_index.title, None)
    new_other_index.save()
    verify_title_existence_in_toc(new_other_index.title, ['Other'] + new_other_index.categories)
    new_other_index.delete()
    verify_title_existence_in_toc(new_other_index.title, None)



def test_index_attr_change():
    indx = model.Index().load({"title": "Or HaChaim"})
    verify_title_existence_in_toc(indx.title, None)
    verify_title_existence_in_toc(indx.title+' on Genesis', ['Tanach', 'Commentary', 'Torah', 'Genesis'])
    indx.titleVariants.append("Or HaChaim HaKadosh")
    indx.save()
    verify_title_existence_in_toc(indx.title, None)
    verify_title_existence_in_toc(indx.title+' on Genesis', ['Tanach', 'Commentary', 'Torah', 'Genesis'])

    indx2 = model.Index().load({"title": "Tanya"})
    verify_title_existence_in_toc(indx2.title, indx2.categories)
    indx2.titleVariants.append("Tanya Test")
    indx2.save()
    verify_title_existence_in_toc(indx2.title, indx2.categories)



def test_text_change():
    pass

@pytest.mark.deep
def test_index_title_change():
    old_title = 'Tanya'
    new_title = 'The Tanya'
    toc_location = ['Chasidut']
    old_toc_path = get_all_toc_locations(old_title)[0]
    assert toc_path_to_string(old_toc_path) == toc_path_to_string(toc_location)
    i = model.Index().load({"title": old_title})
    i.title = new_title
    i.save()
    #old title not there anymore
    verify_title_existence_in_toc(old_title, None)
    #new one in it's place
    verify_title_existence_in_toc(new_title, old_toc_path)
    #do testing: make sure new title is in the old place in the toc and that the old title is removed
    i.title = old_title
    i.save()
    #old title not there anymore
    verify_title_existence_in_toc(new_title, None)
    #new one in it's place
    verify_title_existence_in_toc(old_title, old_toc_path)

@pytest.mark.deep
def test_commentary_index_title_change():
    old_title = 'Sforno'
    new_title = 'Sforno New'
    i = model.Index().load({"title": old_title})
    verify_title_existence_in_toc(old_title, None)
    verify_title_existence_in_toc(old_title+' on Genesis', ['Tanach', 'Commentary', 'Torah', 'Genesis'])
    i.title = new_title
    i.save()
    #old title not there
    verify_title_existence_in_toc(old_title, None)
    #new one not either since it's just a commentator name
    verify_title_existence_in_toc(new_title, None)
    verify_title_existence_in_toc(new_title+' on Genesis', ['Tanach', 'Commentary', 'Torah', 'Genesis'])
    #do testing: make sure new title is in the old place in the toc and that the old title is removed
    i.title = old_title
    i.save()
    #old title not there anymore
    verify_title_existence_in_toc(new_title, None)
    #new one in it's place
    verify_title_existence_in_toc(old_title, None)
    verify_title_existence_in_toc(old_title+' on Genesis', ['Tanach', 'Commentary', 'Torah', 'Genesis'])





