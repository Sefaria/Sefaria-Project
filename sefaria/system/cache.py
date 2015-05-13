
import hashlib

from django.core.cache import cache

# Simple caches for indices, parsed refs, table of contents and texts list
index_cache = {}


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
    import sefaria.model as model
    global index_cache
    index_cache = {}
    keys = [
        'toc_cache',
        'toc_json_cache',
        'texts_titles_json',
        'texts_titles_json_he',
        'all_titles_regex_en',
        'all_titles_regex_he',
        'all_titles_regex_en_commentary',
        'all_titles_regex_he_commentary',
        'all_titles_regex_en_terms',
        'all_titles_regex_he_terms',
        'all_titles_regex_en_commentary_terms',
        'all_titles_regex_he_commentary_terms',
        'full_title_list_en',
        'full_title_list_he',
        'full_title_list_en_commentary',
        'full_title_list_he_commentary',
        'full_title_list_en_commentators',
        'full_title_list_he_commentators',
        'full_title_list_en_commentators_commentary',
        'full_title_list_he_commentators_commentary',
        'full_title_list_en_terms',
        'full_title_list_he_terms',
        'full_title_list_en_commentary_terms',
        'full_title_list_he_commentary_terms',
        'full_title_list_en_commentators_terms',
        'full_title_list_he_commentators_terms',
        'full_title_list_en_commentators_commentary_terms',
        'full_title_list_he_commentators_commentary_terms',
        'title_node_dict_en',
        'title_node_dict_he',
        'title_node_dict_en_commentary',
        'title_node_dict_he_commentary',
        'term_dict_en',
        'term_dict_he'
    ]
    for key in keys:
        delete_cache_elem(key)

    delete_template_cache('texts_list')
    delete_template_cache('leaderboards')
    model.Ref.clear_cache()
    model.library.local_cache = {}


def process_index_change_in_cache(indx, **kwargs):
    reset_texts_cache()


def process_new_commentary_version_in_cache(ver, **kwargs):
    if " on " in ver.title:
        reset_texts_cache()

def get_cache_elem(key):
    return cache.get(key)


def set_cache_elem(key, value, duration = 600000):
    return cache.set(key, value, duration)


def delete_cache_elem(key):
    return cache.delete(key)


def get_template_cache(fragment_name='', *args):
    cache_key = 'template.cache.%s.%s' % (fragment_name, hashlib.md5(u':'.join([arg for arg in args])).hexdigest())
    print cache_key
    return get_cache_elem(cache_key)


def delete_template_cache(fragment_name='', *args):
    delete_cache_elem('template.cache.%s.%s' % (fragment_name, hashlib.md5(u':'.join([arg for arg in args])).hexdigest()))

