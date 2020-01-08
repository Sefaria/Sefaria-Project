# encoding=utf-8
import django
django.setup()

from sefaria.model import *
from sefaria.helper.schema import change_node_structure

def change_mishneh_torah():
    '''
    changes addressTypes of all Mishneh Torah indexs to ['Perek' , 'Halkhah']
    :return:
    '''

    yad_list = library.get_indexes_in_category("Mishneh Torah")
    schema_yad_dict = {}
    for title in yad_list:
        schema_yad_dict[title] = library.get_schema_node(title)

    for node in list(schema_yad_dict.values()):
        # excluding depth one ['Integer'] address types (ex, in category introduction)
        if len(node.sectionNames) != 2:
            continue
        change_node_structure(node, node.sectionNames, address_types=['Perek', 'Halakhah'])


def change_sa():
    '''
    changes addressTypes of Shulchan Arukh indexs to ['Siman', 'Seif']
    :return:
    '''

    SA_ind = ['Shulchan Arukh, Choshen Mishpat', 'Shulchan Arukh, Even HaEzer',
              'Shulchan Arukh, Orach Chayim', "Shulchan Arukh, Yoreh De'ah"]
    for title in SA_ind:
        node = library.get_schema_node(title)
        change_node_structure(node, node.sectionNames, address_types=['Siman', 'Seif'])

def change_tur():
    '''
    changes addressTypes of Tur nodes to ['Siman', 'Seif']
    :return:
    '''

    turim = library.get_index('Tur').nodes.children
    for tur in turim:
        change_node_structure(tur, tur.sectionNames, address_types=['Siman', 'Seif'])


def change_tanakh():
    '''
    changes addressTypes of all Tanakh books to ['Perek', 'Pasuk']
    :return:
    '''

    tanakh = library.get_indexes_in_category("Tanakh")
    for book in tanakh:
        node = library.get_schema_node(book)
        change_node_structure(node, node.sectionNames, address_types=['Perek', 'Pasuk'])


if __name__ == "__main__":
    # change_mishneh_torah()
    # change_sa()
    # change_tur()
    change_tanakh()
