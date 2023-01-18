import spacy
import structlog
from sefaria.model.linker.ref_part import TermContext, RefPartType
from sefaria.model.linker.ref_resolver import ResolvedRef, AmbiguousResolvedRef
from sefaria.model import text, library
from sefaria.model.webpage import WebPage
from sefaria.system.cache import django_cache
from typing import List, Union

logger = structlog.get_logger(__name__)


def add_webpage_hit_for_url(url):
    if url is None: return
    webpage = WebPage().load(url)
    if not webpage: return
    webpage.add_hit()
    webpage.save()


@django_cache(cache_type="persistent")
def make_find_refs_response(post_body, with_text, debug, max_segments):
    from sefaria.utils.hebrew import is_hebrew
    title_text = post_body['text']['title']
    body_text = post_body['text']['body']
    lang = 'he' if is_hebrew(body_text) else 'en'
    if lang == 'he':
        response = _make_find_refs_response_linker_v3(title_text, body_text, with_text, debug, max_segments, lang)
    else:
        response = _make_find_refs_response_linker_v2(title_text, body_text, with_text, debug, max_segments, lang)

    if 'metaDataForTracking' in post_body:
        meta_data = post_body['metaDataForTracking']
        _, webpage = WebPage.add_or_update_from_linker({
            "url": meta_data['url'],
            "title": meta_data['title'],
            "description": meta_data['description'],
            "refs": get_trefs_from_response(response),
        }, add_hit=False)
        if webpage:
            response['url'] = webpage.url

    return response


def _make_find_refs_response_linker_v3(title_text, body_text, with_text, debug, max_segments, lang):
    resolver = library.get_ref_resolver()
    resolved_title = resolver.bulk_resolve_refs(lang, [None], [title_text])
    context_ref = resolved_title[0][0].ref if (len(resolved_title[0]) == 1 and not resolved_title[0][0].is_ambiguous) else None
    resolved = resolver.bulk_resolve_refs(lang, [context_ref], [body_text], with_failures=True)

    response = {
        "title": make_find_refs_response_inner(resolved_title, with_text, debug, max_segments),
        "body": make_find_refs_response_inner(resolved, with_text, debug, max_segments),
    }

    return response


def _make_find_refs_response_linker_v2(title_text, body_text, with_text, debug, max_segments, lang):
    response = {
        "title": _make_find_refs_response_inner_linker_v2(lang, title_text, with_text, max_segments, debug),
        "body": _make_find_refs_response_inner_linker_v2(lang, body_text, with_text, max_segments, debug),
    }
    return response


def _make_find_refs_response_inner_linker_v2(lang, text, with_text, max_segments, debug):
    import re
    ref_results = []
    ref_data = {}

    def _find_refs_action(ref, match: re.Match):
        nonlocal ref_results, ref_data
        tref = ref.normal()
        ref_results += [{
            "startChar": match.start(0),
            "endChar": match.end(0),
            "text": match.group(0),
            "linkFailed": False,
            "refs": [tref]
        }]
        ref_data[tref] = make_ref_response_for_linker(ref, with_text, max_segments)

    library.apply_action_for_all_refs_in_string(text, _find_refs_action, lang, citing_only=True)
    response = {
        "results": ref_results,
        "refData": ref_data
    }
    if debug:
        # debugData has no meaning for linker v2 since there are no ref parts
        response['debugData'] = []

    return response


def get_trefs_from_response(response):
    trefs = []
    for key, value in response.items():
        if isinstance(value, dict) and 'refData' in value:
            trefs += list(value['refData'].keys())
    return trefs


def make_find_refs_response_inner(resolved: List[List[Union[AmbiguousResolvedRef, ResolvedRef]]], with_text=False, debug=False, max_segments=0):
    """

    @param resolved:
    @param with_text:
    @param debug: If True, adds field "debugData" to returned dict with debug information for matched refs.
    @param max_segments: Maximum number of segments to return when `with_text` is true. 0 means no limit.
    @return:
    """
    ref_results = []
    ref_data = {}
    debug_data = []
    resolved_ref_list = [resolved_ref for inner_resolved in resolved for resolved_ref in inner_resolved]
    for resolved_ref in resolved_ref_list:
        resolved_refs = resolved_ref.resolved_raw_refs if resolved_ref.is_ambiguous else [resolved_ref]
        start_char, end_char = resolved_ref.raw_ref.char_indices
        text = resolved_ref.pretty_text
        link_failed = resolved_refs[0].ref is None
        if not link_failed and resolved_refs[0].ref.is_book_level(): continue
        ref_results += [{
            "startChar": start_char,
            "endChar": end_char,
            "text": text,
            "linkFailed": link_failed,
            "refs": None if link_failed else [rr.ref.normal() for rr in resolved_refs]
        }]
        for rr in resolved_refs:
            if rr.ref is None: continue
            tref = rr.ref.normal()
            if tref in ref_data: continue
            ref_data[tref] = make_ref_response_for_linker(rr.ref, with_text, max_segments)
        if debug:
            debug_data += [[make_debug_response_for_linker(rr) for rr in resolved_refs]]

    response = {
        "results": ref_results,
        "refData": ref_data
    }
    if debug:
        response['debugData'] = debug_data

    return response


def make_ref_response_for_linker(oref: text.Ref, with_text=False, max_segments=0) -> dict:
    res = {
        'heRef': oref.he_normal(),
        'url': oref.url(),
        'primaryCategory': oref.primary_category,
    }
    he, he_truncated = get_ref_text_by_lang_for_linker(oref, "he", max_segments)
    en, en_truncated = get_ref_text_by_lang_for_linker(oref, "en", max_segments)
    if with_text:
        res.update({
            'he': he,
            'en': en,
            'isTruncated': he_truncated or en_truncated,
        })

    return res


def get_ref_text_by_lang_for_linker(oref: text.Ref, lang: str, max_segments: int = 0):
    chunk = text.TextChunk(oref, lang=lang)
    as_array = [chunk.strip_itags(s) for s in chunk.ja().flatten_to_array()]
    was_truncated = 0 < max_segments < len(as_array)
    return as_array[:max_segments or None], was_truncated


def make_debug_response_for_linker(resolved_ref: ResolvedRef) -> dict:
    debug_data = {
        "orig_part_strs": [p.text for p in resolved_ref.raw_ref.raw_ref_parts],
        "orig_part_types": [p.type.name for p in resolved_ref.raw_ref.raw_ref_parts],
        "final_part_strs": [p.text for p in resolved_ref.raw_ref.parts_to_match],
        "final_part_types": [p.type.name for p in resolved_ref.raw_ref.parts_to_match],
        "resolved_part_strs": [p.term.slug if isinstance(p, TermContext) else p.text for p in resolved_ref.resolved_parts],
        "resolved_part_types": [p.type.name for p in resolved_ref.resolved_parts],
        "resolved_part_classes": [p.__class__.__name__ for p in resolved_ref.resolved_parts],
        "context_ref": resolved_ref.context_ref.normal() if resolved_ref.context_ref else None,
        "context_type": resolved_ref.context_type.name if resolved_ref.context_type else None,
    }
    if RefPartType.RANGE.name in debug_data['final_part_types']:
        range_part = next((p for p in resolved_ref.raw_ref.parts_to_match if p.type == RefPartType.RANGE), None)
        debug_data.update({
            'input_range_sections': [p.text for p in range_part.sections],
            'input_range_to_sections': [p.text for p in range_part.toSections]
        })
    return debug_data


def load_spacy_model(path: str) -> spacy.Language:
    import re, tarfile
    from tempfile import TemporaryDirectory
    from sefaria.google_storage_manager import GoogleStorageManager
    from sefaria.spacy_function_registry import inner_punct_tokenizer_factory  # this looks unused, but spacy.load() expects this function to be in scope

    using_gpu = spacy.prefer_gpu()
    logger.info(f"Spacy successfully connected to GPU: {using_gpu}")

    if path.startswith("gs://"):
        # file is located in Google Cloud
        # file is expected to be a tar.gz of the model folder
        match = re.match(r"gs://([^/]+)/(.+)$", path)
        bucket_name = match.group(1)
        blob_name = match.group(2)
        model_buffer = GoogleStorageManager.get_filename(blob_name, bucket_name)
        tar_buffer = tarfile.open(fileobj=model_buffer)
        with TemporaryDirectory() as tempdir:
            tar_buffer.extractall(tempdir)
            nlp = spacy.load(tempdir)
    else:
        nlp = spacy.load(path)
    return nlp
