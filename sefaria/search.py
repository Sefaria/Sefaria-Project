from whoosh.index import create_in
from whoosh.fields import *
from whoosh.qparser import QueryParser

from texts import *


schema = Schema(
    title=TEXT(stored=True),
    ref=ID(stored=True),
    version=ID(stored=True),
    lang=ID(stored=True),
    content = TEXT
    )
index_dir = os.path.dirname(os.path.dirname(os.path.realpath(__file__))) + "/data/index"
ix = create_in(index_dir, schema)
writer = ix.writer()


def index_text(ref, version=None, lang=None):
    """
    Index the text designated by ref.
    If no version and lang are given, this functon will be called for each availble version.
    Currently assumes ref is at section level. 
    """

    if not version and lang:
        text = get_text(ref, context=0, commentary=False)
        for v in text["versions"]:
            index_text(ref, version=v["versionTitle"], lang=v["language"])
        return

    text = get_text(ref, context=0, commentary=False, version=version, lang=lang)
    ref = unicode(ref)

    title = text["book"] + " ".join(["%s %d" % (p[0],p[1]) for p in zip(text["sectionNames"], text["sections"])])
    title += "(%s)" % version
    content = " ".join(text["text"])
    content = "\n".join([title, text["heTitle"] or "", content])

    writer.add_document(title=title, ref=ref, version=version, lang=lang, content=content)


def search(query):
    """
    Returns a list of search results for query.
    """
    parser = QueryParser("content", ix.schema)
    pquery = parser.parse(unicode(query))
    with ix.searcher() as searcher:
        results = searcher.search(pquery)

    return results
