import os
from pprint import pprint

# To allow these files to be run directly from command line (w/o Django shell)
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

from texts import *

from pyes import *
es = ES('127.0.0.1:9200')


def index_text(ref, version=None, lang=None):
    """
    Index the text designated by ref.
    If no version and lang are given, this functon will be called for each availble version.
    Currently assumes ref is at section level. 
    """

    if not (version and lang):
        print ref
        for v in get_version_list(ref):
            index_text(ref, version=v["versionTitle"], lang=v["language"])
        return

    print version + " / " + lang
    doc = make_text_index_document(ref, version, lang)
    pprint(doc)

    es.index(doc, 'sefaria', 'text')



def make_text_index_document(ref, version, lang):
    """
    Create a document for indexing from the text specified by ref/version/lang
    """
    text = get_text(ref, context=0, commentary=False, version=version, lang=lang)
    ref = unicode(ref)

    title = text["book"] + " " + " ".join(["%s %d" % (p[0],p[1]) for p in zip(text["sectionNames"], text["sections"])])
    title += " (%s)" % version
    if isinstance(text["text"], list):
        content = " ".join(text["text"])
    else:
        content = text["text"]

    return {
        "title": title, 
        "ref": ref, 
        "version": version, 
        "lang": lang,
        "content":content,
        "category": text["type"],
        "category2": text["categories"][1] if len(text["categories"]) > 1 else None,        
        "category3": text["categories"][2] if len(text["categories"]) > 2 else None,
        }


def search(query):
    """
    Returns a list of search results for query.
    """

    return None


def test():
    clear_text_index()
    for i in range(50):
        ref = "Genesis %d" % (i+1)
        index_text(ref)
        text = get_text(ref)
        length = max(len(text["text"]), len(text["he"]))
        for j in range(length):
            index_text(ref + ":%d" % (j+1))
            

def clear_text_index():
    es.indices.delete_index("sefaria")