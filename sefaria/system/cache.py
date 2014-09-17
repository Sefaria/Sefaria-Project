
import hashlib

from django.core.cache import cache

# Simple caches for indices, parsed refs, table of contents and texts list
indices = {}   # to be depricated in favor of index_cache
index_cache = {}
parsed = {}
toc_cache = None
texts_titles_cache = None
he_texts_titles_cache = None
texts_titles_json = None


def get_index(bookname):
    res = index_cache.get(bookname)
    if res:
        return res
    return None


def set_index(bookname, instance):
    index_cache[bookname] = instance


def reset_texts_cache():
    """
    Resets caches that only update when text index information changes.
    """
    global indices, index_cache, he_index_cache, parsed, texts_titles_cache, he_texts_titles_cache, texts_titles_json, toc_cache
    indices = {}
    index_cache = {}
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


def delete_template_cache(fragment_name='', *args):
    cache.delete('template.cache.%s.%s' % (fragment_name, hashlib.md5(u':'.join([arg for arg in args])).hexdigest()))