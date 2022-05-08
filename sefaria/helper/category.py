from sefaria.model import *
from sefaria.system.exceptions import BookNameError


def move_index_into(index, cat):
    """
    :param index: (String)  The primary name of the Index to move.
    :param cat:  (model.Category or List) Category to move into - either a Category object, or a List with the path leading to the Category
    :return: None
    """
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
    :param cat: (model.Category or List) Either a Category object or a list of category keys defining a category
    :param en:  (String)    The new English name of the category.  If `en`` is a key for a Term, the Term will be used.
    Otherwise, the `he` is required, and the two will be used to create a new Term.
    :param he:  (String, optional)
    :return: model.Category - the newly renamed Category
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
    Move category `cat` to be a child of `parent`.  If `parent` is None, move `cat` to root.

    :param cat: (model.Category or List) either a Category object, or a list of keys for the path of a category
    :param parent: (model.Category or List) either a Category object, or a list of keys for the path of a category
    :return:

    >>> c = Category().load({'path': ["Tanaitic", "Minor Tractates"]})
    >>> p = Category().load({"path": ["Talmud", "Bavli"]})
    >>> move_category_into(c, p)

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
    """
    Will create a new category at the location in the TOC indicated by `path`.
    If there is a term for `path[-1]`, then that term will be used for this category.
    Otherwise, a new Term will be created with titles `en` and `he`.

    :param path: (List) the full path of the category to create
    :param en: (String, optional)
    :param he: (String, optional)
    :param searchRoot: (String, optional) If this is present, then in the context of search filters, this category will appear under `searchRoot`.
    :return: (model.Category) the new category object
    """
    existing_c = Category().load({"path": path})
    if existing_c:
        print("Already exists")
        return existing_c
    new_c = Category()
    if not Term().load({"name": path[-1]}):
        if en is None or he is None:
            raise Exception("Need term names for {}".format(path[-1]))
        print("adding term for " + en)
        term = Term()
        term.name = en
        term.add_primary_titles(en, he)
        term.scheme = "toc_categories"
        term.save()
    new_c.add_shared_term(path[-1])
    new_c.path = path
    new_c.lastPath = path[-1]
    if searchRoot is not None:
        new_c.searchRoot = searchRoot
    print("Creating - {}".format(" / ".join(new_c.path)))
    new_c.save(override_dependencies=True)
    return new_c


def get_category_paths(path):
    """
    Returns a list of all of the category paths one level below `path`.
    Used for populating rows of the Categories spreadsheet, e.g. to add all the categories that
    appear as Tanakh Commentaries
    """
    from sefaria.model.category import TocCategory
    root = library.get_toc_tree().lookup(path)
    return [cat.full_path for cat in root.children if isinstance(cat, TocCategory)]