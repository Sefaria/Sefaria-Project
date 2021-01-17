from sefaria.model import *
from sefaria.system.exceptions import BookNameError


def moveIndexInto(index, cat):
    if not isinstance(index, Index):
        try:
            index = library.get_index(index)
        except BookNameError:
            print("Can not find: {}".format(index))
            return
    if not isinstance(cat, Category):
        cat = Category().load({"path": cat})

    index.categories = cat.path[:]
    print("Moving - " + index.get_title() + " to " + str(index.categories) + " (moveIndexInto)")
    index.save(override_dependencies=True)


def moveCategoryInto(cat, parent):
    """
    c = Category().load({'path': ["Tanaitic", "Minor Tractates"]})
    p = Category().load({"path": ["Talmud", "Bavli"]})
    moveCategoryInto(c, p)

    if parent is None, move to root.

    :param cat:
    :param parent:
    :return:
    """
    if not isinstance(cat, Category):
        cat = Category().load({"path": cat})
    assert isinstance(cat, Category)

    if not isinstance(parent, Category) and parent is not None:
        parent = Category().load({"path": parent})
    assert isinstance(parent, Category) or parent is None


    old_category_path = cat.path[:]
    old_parent_path = cat.path[:-1]
    new_parent_path = parent.path[:] if parent else []

    # move all matching categories
    clauses = [{"path." + str(i): cname} for i, cname in enumerate(old_category_path)]
    query = {"$and": clauses}
    old_parent_length = len(old_parent_path)
    for cat in CategorySet(query):
        # replace old_parent_path with new_parent_path
        cat.path = new_parent_path + cat.path[old_parent_length:]
        print("Saving moved category - " + str(cat.path))
        cat.save(override_dependencies=True)

    # move all matching Indexes
    clauses = [{"categories." + str(i): cname} for i, cname in enumerate(old_category_path)]
    query = {"$and": clauses}
    for ind in IndexSet(query):
        assert isinstance(ind, Index)
        ind.categories = new_parent_path + ind.categories[old_parent_length:]
        print("Moving - " + ind.get_title() + " to " + str(ind.categories) + " (moveCategoryInto)")
        ind.save(override_dependencies=True)

    """
     Handle commentary on parallel trees separately.
     "title": "Commentary of Chida on Tractate Gerim",
     "categories": [
     "Tanaitic",
     "Commentary",
     "Commentary of Chida",
     "Minor Tractates"
     ],
    """


def create_category(path, en=None, he=None, searchRoot=None):
    c = Category()
    if not Term().load({"name": path[-1]}):
        if en is None or he is None:
            raise Exception("Need term names for {}".format(path[-1]))
        print("adding term for " + en)
        term = Term()
        term.name = en
        term.add_primary_titles(en, he)
        term.scheme = "toc_categories"
        term.save()
    c.add_shared_term(path[-1])
    c.path = path
    c.lastPath = path[-1]
    if searchRoot is not None:
        c.searchRoot = searchRoot
    print("Creating - {}".format(" / ".join(c.path)))
    c.save(override_dependencies=True)
    return c
