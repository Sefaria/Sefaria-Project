#encoding=utf-8
from sefaria.model import *
from sefaria.helper.schema import *

if __name__ == "__main__":
    parents = []
    torah_books = library.get_indexes_in_category("Torah")
    ramban_books = ["Ramban on {}".format(torah_book) for torah_book in torah_books]
    for title in ramban_books:
        print(title)
        index = library.get_index(title)
        convert_simple_index_to_complex(index)
        VersionState(title).refresh()
        parents.append(library.get_index(title).nodes)

    genesis_foreword = JaggedArrayNode()
    genesis_foreword.add_primary_titles("Foreword", "פתיחה לפירוש התורה")
    genesis_foreword.add_structure(["Paragraph"])
    insert_first_child(genesis_foreword, parents[0])

    for parent_node in parents:
        print(parent_node)
        intro = JaggedArrayNode()
        intro.add_shared_term("Introduction")
        intro.add_structure(["Paragraph"])
        intro.key = "intro"
        insert_first_child(intro, parent_node)
