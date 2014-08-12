
from sefaria.utils.util import delete_template_cache

# Simple caches for indices, parsed refs, table of contents and texts list
indices = {}   # to be depricated in favor of index_cache
index_cache = {}
he_indices = {}    # to be depricated in favor of he_index_cache
he_index_cache = {}
parsed = {}
toc_cache = None
texts_titles_cache = None
he_texts_titles_cache = None
texts_titles_json = None


def get_index(bookname):
    res = index_cache.get(bookname)
    if res:
        return res.copy()


def set_index(bookname, instance):
    index_cache[bookname] = instance.copy()


def reset_texts_cache():
    """
    Resets caches that only update when text index information changes.
    """
    global indices, index_cache, he_index_cache, parsed, texts_titles_cache, he_texts_titles_cache, texts_titles_json, toc_cache
    indices = {}
    index_cache = {}
    he_index_cache = {}
    parsed = {}
    toc_cache = None
    texts_titles_cache = None
    he_texts_titles_cache = None
    texts_titles_json = None
    delete_template_cache('texts_list')
    delete_template_cache('leaderboards')


def process_index_title_change_in_cache(indx, **kwargs):
    """ TODO: Refactor caching system
    """
    reset_texts_cache()


def process_index_delete_in_cache(indx, **kwargs):
    reset_texts_cache()