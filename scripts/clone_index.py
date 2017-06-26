# -*- coding: utf-8 -*-

__author__ = 'stevenkaplan'
import sys
from sefaria.system.exceptions import *
from sefaria.model import *
from sources.functions import *
from sefaria.model.schema import TitleGroup
'''
Take an index, serialize schema, travel through schema replacing every instance of old_title with new_title
and then load new index with this schema
'''

def verify_titles_and_return_contents(base_text_title, existing_index_title, new_index_titles):
    '''
    Check that the existing index title exists and that the new index title does NOT exist.
    :param existing_index_title: Name of existing index who's structure will be cloned
    :param new_index_title: Name of new index
    :return:
    '''
    try:
        old_index = library.get_index(existing_index_title)
    except BookNameError:
        raise BookNameError, "{} can't be found in library.".format(existing_index_title)

    base_text_match = False
    for base_title in old_index.base_text_titles:
        if base_text_title == base_title:
            base_text_match = True

    if not base_text_match or (" on " in new_index_title and new_index_title.split(" on ")[-1] != base_text_title):
        raise InputError, "The new index must comment on the same text as the existing index."

    try:
        library.get_index(new_index_title)
        raise InputError, "{} already exists.  You can clone the structure of {} only for a new index.".format(new_index_title, existing_index_title)
    except BookNameError:
        term_title = new_index_title.split(" on ")[0]
        term = Term().load({"name": term_title})
        if not term:
            raise InputError, "Before adding the book {}, please add {} as a term.".format(new_index_title, term_title)

        #verify base_text_title
        return old_index.contents(v2=True), term



def copy_keys(contents):
    keys_to_copy = ["base_text_titles", "base_text_mapping", "dependence", "addressTypes", "sectionNames", "depth"]
    new_contents = {key: contents[key] for key in contents if key in keys_to_copy}
    if "base_text_titles" in new_contents:
        base_text_titles = contents["base_text_titles"]
        new_contents["base_text_titles"] = [x['en'] for x in base_text_titles]
    return new_contents




def alter_contents(contents, new_index_title, book_term):
    new_contents = copy_keys(contents)

    new_contents["title"] = new_index_title

    new_heTerm = book_term.titles[0]["text"] if book_term.titles[0]["lang"] == "he" else book_term.titles[1]["text"]
    new_enTerm = book_term.titles[0]["text"] if book_term.titles[0]["lang"] == "en" else book_term.titles[1]["text"]
    old_heTerm = contents["heTitle"].split(u" על ")[0]
    old_enTerm = contents["title"].split(" on ")[0]

    new_contents["heTitle"] = new_index_he_title = contents["heTitle"].replace(old_heTerm, new_heTerm)
    new_contents["collective_title"] = new_enTerm

    new_contents["schema"] = alter_schema(contents["schema"], new_index_title, new_index_he_title)

    new_contents["categories"] = [cat.replace(old_enTerm, new_enTerm) for cat in contents["categories"]]
    new_contents["titleVariants"] = [title.replace(old_enTerm, new_enTerm) for title in contents["titleVariants"]]
    new_contents["heTitleVariants"] = [title.replace(old_heTerm, new_heTerm) for title in contents["heTitleVariants"]]

    return new_contents


def alter_schema(schema, new_index_title, new_index_he_title):
    schema["key"] = schema["title"] = new_index_title
    schema["heTitle"] = new_index_he_title
    title_group = TitleGroup()
    title_group.add_title(new_index_title, 'en', primary=True)
    title_group.add_title(new_index_he_title, 'he', primary=True)
    title_group.validate()
    schema["titles"] = title_group.titles
    return schema

def build_new_index(contents):
    new_index = Index(contents).save()
    print new_index.contents(v2=True)

if __name__ == "__main__":
    add_term("Zeroa Yamin", u"זרוע ימין", server="http://proto.sefaria.org")
    base_text_title = sys.argv[1]
    existing_index_title = sys.argv[2]
    new_index_title = sys.argv[3]
    existing_index_contents, book_term = verify_titles_and_return_contents(base_text_title, existing_index_title, new_index_title)
    if existing_index_contents:
        new_index_contents = alter_contents(existing_index_contents, new_index_title, book_term)
        build_new_index(new_index_contents)
