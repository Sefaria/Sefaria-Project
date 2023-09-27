import dataclasses
import json
import spacy
import structlog
from sefaria.model.linker.ref_part import TermContext, RefPartType
from sefaria.model.linker.ref_resolver import ResolvedRef, AmbiguousResolvedRef
from sefaria.model import text, library
from sefaria.model.webpage import WebPage
from sefaria.system.cache import django_cache
from typing import List, Union, Optional, Tuple

logger = structlog.get_logger(__name__)


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


def make_find_refs_response(request):
    request_text, options, meta_data = _unpack_find_refs_request(request)
    if meta_data:
        _add_webpage_hit_for_url(meta_data.get("url", None))
    return _make_find_refs_response_with_cache(request_text, options, meta_data)


@dataclasses.dataclass
class _FindRefsTextOptions:
    """
    @attr debug: If True, adds field "debugData" to returned dict with debug information for matched refs.
    @attr max_segments: Maximum number of segments to return when `with_text` is true. 0 means no limit.
    @attr version_preferences_by_corpus: dict of dicts of the form { <corpus>: { <lang>: <vtitle> }}
    """

    debug: bool = False
    with_text: bool = False
    max_segments: int = 0
    version_preferences_by_corpus: dict = None


@dataclasses.dataclass
class _FindRefsText:
    title: str
    body: str
    lang: str

    # def __post_init__(self):
    #     from sefaria.utils.hebrew import is_mostly_hebrew
    #     self.lang = 'he' if is_mostly_hebrew(self.body) else 'en'


def _unpack_find_refs_request(request):
    post_body = json.loads(request.body)
    meta_data = post_body.get('metaDataForTracking')
    return _create_find_refs_text(post_body), _create_find_refs_options(request.GET, post_body), meta_data


def _create_find_refs_text(post_body) -> _FindRefsText:
    from sefaria.utils.hebrew import is_mostly_hebrew
    title = post_body['text']['title']
    body = post_body['text']['body']
    lang = post_body['lang'] if 'lang' in post_body else 'he' if is_mostly_hebrew(body) else 'en'
    return _FindRefsText(title, body, lang)


def _create_find_refs_options(get_body: dict, post_body: dict) -> _FindRefsTextOptions:
    with_text: bool = bool(int(get_body.get("with_text", False)))
    debug: bool = bool(int(get_body.get("debug", False)))
    max_segments: int = int(get_body.get("max_segments", 0))
    version_preferences_by_corpus: dict = post_body.get("version_preferences_by_corpus")
    return _FindRefsTextOptions(with_text, debug, max_segments, version_preferences_by_corpus)


def _add_webpage_hit_for_url(url):
    if url is None: return
    webpage = WebPage().load(url)
    if not webpage: return
    webpage.add_hit()
    webpage.save()


@django_cache(cache_type="persistent")
def _make_find_refs_response_with_cache(request_text: _FindRefsText, options: _FindRefsTextOptions, meta_data: dict) -> dict:
    if request_text.lang == 'he':
        response = _make_find_refs_response_linker_v3(request_text, options)
    else:
        response = _make_find_refs_response_linker_v2(request_text, options)

    if meta_data:
        _, webpage = WebPage.add_or_update_from_linker({
            "url": meta_data['url'],
            "title": meta_data['title'],
            "description": meta_data['description'],
            "refs": _get_trefs_from_response(response),
        }, add_hit=False)
        if webpage:
            response['url'] = webpage.url
    return response


def _make_find_refs_response_linker_v3(request_text: _FindRefsText, options: _FindRefsTextOptions) -> dict:
    resolver = library.get_ref_resolver()
    resolved_title = resolver.bulk_resolve_refs(request_text.lang, [None], [request_text.title])
    context_ref = resolved_title[0][0].ref if (len(resolved_title[0]) == 1 and not resolved_title[0][0].is_ambiguous) else None
    resolved_body = resolver.bulk_resolve_refs(request_text.lang, [context_ref], [request_text.body], with_failures=True)

    response = {
        "title": _make_find_refs_response_inner(resolved_title, options),
        "body": _make_find_refs_response_inner(resolved_body, options),
    }

    return response


def _make_find_refs_response_linker_v2(request_text: _FindRefsText, options: _FindRefsTextOptions) -> dict:
    response = {
        "title": _make_find_refs_response_inner_linker_v2(request_text.lang, request_text.title, options),
        "body": _make_find_refs_response_inner_linker_v2(request_text.lang, request_text.body, options),
    }
    return response


def _make_find_refs_response_inner_linker_v2(lang, text, options: _FindRefsTextOptions):
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
        ref_data[tref] = _make_ref_response_for_linker(ref, options)

    library.apply_action_for_all_refs_in_string(text, _find_refs_action, lang, citing_only=True)
    response = {
        "results": ref_results,
        "refData": ref_data
    }
    if options.debug:
        # debugData has no meaning for linker v2 since there are no ref parts
        response['debugData'] = []

    return response


def _get_trefs_from_response(response):
    trefs = []
    for key, value in response.items():
        if isinstance(value, dict) and 'refData' in value:
            trefs += list(value['refData'].keys())
    return trefs


def _make_find_refs_response_inner(resolved: List[List[Union[AmbiguousResolvedRef, ResolvedRef]]], options: _FindRefsTextOptions):
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
            ref_data[tref] = _make_ref_response_for_linker(rr.ref, options)
        if options.debug:
            debug_data += [[_make_debug_response_for_linker(rr) for rr in resolved_refs]]

    response = {
        "results": ref_results,
        "refData": ref_data
    }
    if options.debug:
        response['debugData'] = debug_data

    return response


def _make_ref_response_for_linker(oref: text.Ref, options: _FindRefsTextOptions) -> dict:
    res = {
        'heRef': oref.he_normal(),
        'url': oref.url(),
        'primaryCategory': oref.primary_category,
    }
    he, he_truncated = _get_ref_text_by_lang_for_linker(oref, "he", options)
    en, en_truncated = _get_ref_text_by_lang_for_linker(oref, "en", options)
    if options.with_text:
        res.update({
            'he': he,
            'en': en,
            'isTruncated': he_truncated or en_truncated,
        })

    return res


def _get_preferred_vtitle(oref: text.Ref, lang: str, version_preferences_by_corpus: dict) -> Optional[str]:
    vprefs = version_preferences_by_corpus
    corpus = oref.index.get_primary_corpus()
    # Make sure ref's corpus and current lang are specified in version_preferences_by_corpus.
    # If not, use default version
    if vprefs is None or corpus not in vprefs or lang not in vprefs[corpus]:
        return
    return vprefs[corpus][lang]


def _get_ref_text_by_lang_for_linker(oref: text.Ref, lang: str, options: _FindRefsTextOptions) -> Tuple[List[str], bool]:
    vtitle = _get_preferred_vtitle(oref, lang, options.version_preferences_by_corpus)
    chunk = text.TextChunk(oref, lang=lang, vtitle=vtitle, fallback_on_default_version=True)
    as_array = [chunk.strip_itags(s) for s in chunk.ja().flatten_to_array()]
    was_truncated = 0 < options.max_segments < len(as_array)
    return as_array[:options.max_segments or None], was_truncated


def _make_debug_response_for_linker(resolved_ref: ResolvedRef) -> dict:
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
