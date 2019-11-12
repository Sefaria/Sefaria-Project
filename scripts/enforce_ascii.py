# encoding=utf-8


from sefaria.model import *
from sefaria.helper.schema import change_node_title


def get_all_node_titles(index):
    """
    Get all primary titles on all the nodes for this index
    :param Index index:
    :return: list of primary titles
    """
    def get_primary_titles(node, title_list=None):
        """
        Get all the English primary titles for a node and all it's children(if any)
        :param TitledTreeNode node:
        :param list title_list:
        :return: list of names
        """
        if title_list is None:
            title_list = []

        title_list.append(node.primary_title('en'))

        if node.has_children():
            for child in node.children:
                get_primary_titles(child, title_list)

        return title_list

    root_node = index.nodes
    if root_node:
        titles = get_primary_titles(root_node)
        return titles
    else:
        return [index.title]


def is_ascii(s):
    return all(ord(c) < 128 for c in s)


def multiple_replace(in_string, replace_dict):
    """
    Make multiple replacements based on key, value pairs in a dict
    :param unicode in_string: string to be edited
    :param dict replace_dict: key to be replaced by value
    :return: fixed string
    """
    for key in list(replace_dict.keys()):
        in_string = in_string.replace(key, replace_dict[key])
    return in_string


def fix_node_titles():
    def replace_title(node):
        """
        :param TitledTreeNode node:
        """
        old_title = node.primary_title('en')
        if is_ascii(old_title):
            return
        things_to_replace = {
            '\xa0': '',
            '\u015b': 's',
            '\u2018': "'",
            '\u2019': "'"
        }
        new_title = multiple_replace(old_title, things_to_replace)
        if old_title == new_title:
            print("Can't fix {}".format(node.full_title('en')))
            return
        print("Changing '{}' to '{}'".format(old_title, new_title))
        change_node_title(node, old_title, 'en', new_title)

    def run_on_nodes(node):
        if node is None:
            return
        replace_title(node)
        if node.has_children:
            for child in node.children:
                run_on_nodes(child)

    for index in IndexSet():
        run_on_nodes(index.nodes)


if __name__ == "__main__":
    fix_node_titles()
