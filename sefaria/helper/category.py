from sefaria.model import *
from sefaria.system.exceptions import BookNameError


def move_index_into(index, cat):
    if not isinstance(index, Index):
        try:
            index = library.get_index(index)
        except BookNameError:
            print("Can not find: {}".format(index))
            return
    if not isinstance(cat, Category):
        cat = Category().load({"path": cat})

    index.categories = cat.path[:]
    print("Moving - " + index.get_title() + " to " + str(index.categories) + " (move_index_into)")
    index.save(override_dependencies=True)


def rename_category(cat, en, he=None):
    """

    :param cat:
    :param en:
    :param he:
    :return:
    """
    if not isinstance(cat, Category):
        cat = Category().load({"path": cat})
    assert isinstance(cat, Category)

    if en is None:
        raise Exception("Need en name for category {} renaming.".format(cat.path[-1]))

    old_category_path = cat.path[:]
    path_length = len(old_category_path)

    if not Term().load({"name": en}):
        if he is None:
            raise Exception("Need Hebrew term names for {}".format(en))
        print("adding term for " + en)
        term = Term()
        term.name = en
        term.add_primary_titles(en, he)
        term.scheme = "toc_categories"
        term.save()
    cat.add_shared_term(en)
    cat.path[-1] = en
    cat.lastPath = en
    print("Renaming category to {}".format(en))
    cat.save(override_dependencies=True)

    # move all matching categories
    clauses = [{"path." + str(i): cname} for i, cname in enumerate(old_category_path)]
    query = {"$and": clauses}
    for c in CategorySet(query):
        # replace old_parent_path with new_parent_path
        c.path = cat.path + c.path[path_length:]
        print("Saving moved category - " + str(c.path) + " (rename_category)")
        c.save(override_dependencies=True)

    # move all matching Indexes
    clauses = [{"categories." + str(i): cname} for i, cname in enumerate(old_category_path)]
    query = {"$and": clauses}
    for ind in IndexSet(query):
        assert isinstance(ind, Index)
        ind.categories = cat.path + ind.categories[path_length:]
        print("Moving - " + ind.get_title() + " to " + str(ind.categories) + " (rename_category)")
        ind.save(override_dependencies=True)

    return cat


def move_category_into(cat, parent):
    """
    c = Category().load({'path': ["Tanaitic", "Minor Tractates"]})
    p = Category().load({"path": ["Talmud", "Bavli"]})
    move_category_into(c, p)

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
        print("Moving - " + ind.get_title() + " to " + str(ind.categories) + " (move_category_into)")
        ind.save(override_dependencies=True)


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
