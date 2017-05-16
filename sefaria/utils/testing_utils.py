import sefaria.summaries as s
import sefaria.model as model
import sefaria.system.cache as scache


""" SOME UTILS """

def get_all_toc_locations(title, toc):
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


def verify_title_existence_in_toc(title, expected_toc_location=None, toc=None):
    if toc is None:
        toc = model.library.get_toc()
    locations_in_toc = get_all_toc_locations(title, toc)
    #a title should always be in the toc no more than once. 0 if we do not expect to find it there.
    num_appearances_in_toc = 1 if expected_toc_location is not None else 0
    assert len(locations_in_toc) == num_appearances_in_toc, "title appears %d times" % len(locations_in_toc)
    if expected_toc_location:
        assert toc_path_to_string(expected_toc_location) == toc_path_to_string(locations_in_toc[0]), locations_in_toc


def verify_existence_across_tocs(title, expected_toc_location=None):
    tocs = [model.library.get_toc(), model.library.get_search_filter_toc()]
    for toc in tocs:
        verify_title_existence_in_toc(title, expected_toc_location, toc=toc)




"""def get_toc_location_reversed(title):
    toc = s.get_toc()
    #hack to look from the other direction, so we encounter a different path than the original function if there is more than one.
    r_toc = toc[::-1]
    return get_toc_location(title, r_toc)

def has_duplicate_toc_location(title,toc_path):
    res_path = get_toc_location_reversed(title)
    return toc_path_to_string(toc_path) == toc_path_to_string(res_path)

"""


"""
def get_toc_location(title, toc=None):
    if toc is None:
        toc = s.get_toc()
    for toc_elem in toc:
        if 'title' in toc_elem:
            if toc_elem['title'] == title:
                return True
        elif 'category' in toc_elem:
            result  = get_toc_location(title, toc_elem['contents'])
            if result:
                #if we have a result, add the index location to a list that will eventually map to this text.
                indices = [toc_elem['category']] + result if isinstance(result, list) else [toc_elem['category']]
                return indices
    return False
"""






