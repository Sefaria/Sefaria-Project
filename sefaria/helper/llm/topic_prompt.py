from typing import List, Callable, Any, Optional, Dict, Tuple
from collections import defaultdict
import re
from sefaria.model.text import Ref, library, TextChunk
from sefaria.model.passage import Passage
from sefaria.model.topic import Topic, RefTopicLink
from sefaria.client.wrapper import get_links
from sefaria.datatype.jagged_array import JaggedTextArray
from sefaria_llm_interface.topic_prompt import TopicPromptGenerationOutput, TopicPromptInput, TopicPromptSource, TopicPromptCommentary
from sefaria_llm_interface import Topic as LLMTopic
from sefaria.utils.util import deep_update


def _lang_dict_by_func(func: Callable[[str], Any]) -> Dict[str, Any]:
    return {lang: func(lang) for lang in ('en', 'he')}


def _get_commentary_from_link_dict(link_dict: dict) -> Optional[TopicPromptCommentary]:
    if link_dict['category'] not in {'Commentary'}:
        return
    if not link_dict['sourceHasEn']:
        return
    commentary_text = _lang_dict_by_func(lambda lang: JaggedTextArray(link_dict.get('text' if lang == 'en' else 'he', '')).flatten_to_string())
    commentary_text = _lang_dict_by_func(lambda lang: re.sub(r"<[^>]+>", " ", TextChunk.strip_itags(commentary_text[lang])))
    return TopicPromptCommentary(
        ref=link_dict['sourceRef'],
        text=commentary_text
    )


def _get_commentary_for_tref(tref: str) -> List[TopicPromptCommentary]:
    """
    Return list of commentary for tref. Currently only considers English commentary.
    :param tref:
    :return: list where each element represents a single commentary on `tref`. Each element is a dict with keys `en`
    and `he` for the English and Hebrew text.
    """
    library.rebuild_toc()
    commentary = []

    for link_dict in get_links(tref, with_text=True):
        temp_commentary = _get_commentary_from_link_dict(link_dict)
        if not temp_commentary: continue
        commentary += [temp_commentary]
    return commentary


def _get_context_ref(segment_oref: Ref) -> Optional[Ref]:
    """
    Decide if `segment_oref` requires a context ref and if so, return it.
    A context ref is a ref which contains `segment_oref` and provides more context for it.
    E.g. Genesis 1 is a context ref for Genesis 1:13
    :param segment_oref:
    :return:
    """
    if segment_oref.primary_category == "Tanakh":
        return segment_oref.section_ref()
    elif segment_oref.index.get_primary_corpus() == "Bavli":
        passage = Passage.containing_segment(segment_oref)
        return passage.ref()
    return None


def _get_surrounding_text(oref: Ref) -> Optional[Dict[str, str]]:
    """
    Get the surrounding context text for `oref`. See _get_context_ref() for an explanation of what a context ref is.
    :param oref:
    :return: dict with keys "en" and "he" and values the English and Hebrew text of the surrounding text, respectively.
    """
    context_ref = _get_context_ref(oref)
    if context_ref:
        return _lang_dict_by_func(lambda lang: context_ref.text(lang).as_string())


def _make_llm_topic(sefaria_topic: Topic) -> LLMTopic:
    """
    Return a dict that can be instantiated as `sefaria_interface.Topic` in the LLM repo.
    This represents the basic metadata of a topic for the LLM repo to process.
    :param sefaria_topic:
    :return:
    """
    return LLMTopic(
        slug=sefaria_topic.slug,
        description=getattr(sefaria_topic, 'description', {}),
        title=_lang_dict_by_func(sefaria_topic.get_primary_title)
    )


def _make_topic_prompt_source(oref: Ref, context: str) -> TopicPromptSource:
    """
    Return a dict that can be instantiated as `sefaria_interface.TopicPromptSource` in the LLM repo.
    This represents the basic metadata of a source for the LLM repo to process.
    :param oref:
    :param context:
    :return:
    """

    index = oref.index
    text = _lang_dict_by_func(lambda lang: oref.text(lang).as_string())
    book_description = _lang_dict_by_func(lambda lang: getattr(index, f"{lang}Desc", "N/A"))
    book_title = _lang_dict_by_func(index.get_title)
    composition_time_period = index.composition_time_period()
    pub_year = composition_time_period.period_string("en") if composition_time_period else "N/A"
    try:
        author_name = Topic.init(index.authors[0]).get_primary_title("en") if len(index.authors) > 0 else "N/A"
    except AttributeError:
        author_name = "N/A"

    commentary = None
    if index.get_primary_category() == "Tanakh":
        commentary = _get_commentary_for_tref(oref.normal())
    surrounding_text = _get_surrounding_text(oref)

    return TopicPromptSource(
        ref=oref.normal(),
        categories=index.categories,
        book_description=book_description,
        book_title=book_title,
        comp_date=pub_year,
        author_name=author_name,
        context_hint=context,
        text=text,
        commentary=commentary,
        surrounding_text=surrounding_text,
    )


def make_topic_prompt_input(lang: str, sefaria_topic: Topic, orefs: List[Ref], contexts: List[str]) -> TopicPromptInput:
    """
    Return a dict that can be instantiated as `sefaria_interface.TopicPromptInput` in the LLM repo.
    This represents the full input required for the LLM repo to generate topic prompts.
    :param lang:
    :param sefaria_topic:
    :param orefs:
    :param contexts:
    :return:
    """
    return TopicPromptInput(
        lang=lang,
        topic=_make_llm_topic(sefaria_topic),
        sources=[_make_topic_prompt_source(oref, context) for oref, context in zip(orefs, contexts)]
    )


def save_topic_prompt_output(output: TopicPromptGenerationOutput) -> None:
    for prompt in output.prompts:
        query = {
            "ref": prompt.ref,
            "toTopic": prompt.slug,
            "dataSource": "learning-team",
            "linkType": "about",
        }
        link = RefTopicLink().load(query)
        if link is None:
            link = RefTopicLink(query)
        curr_descriptions = getattr(link, "descriptions", {})
        description_edits = {output.lang: {
            "title": prompt.title, "ai_title": prompt.title,
            "prompt": prompt.prompt, "ai_prompt": prompt.prompt,
            "published": False, "review_state": "not reviewed"
        }}
        setattr(link, "descriptions", deep_update(curr_descriptions, description_edits))
        link.save()


def get_ref_context_hints_by_lang(ref_topic_links: List[dict]) -> Dict[str, List[Tuple[Ref, str]]]:
    """
    Helper function for topic generation API
    Returns dict where keys are the languages of ref_topic_links that should be generated and the values are the Refs
    and context hints that should be inputs to the generation process
    @param ref_topic_links:
    @return:
    """
    ref__context_hints_by_lang = defaultdict(list)
    for ref_topic_link in ref_topic_links:
        oref = Ref(ref_topic_link['ref'])
        description = ref_topic_link.get('descriptions', {})
        for lang, prompt_dict in description.items():
            context_hint = prompt_dict.get('ai_context', '')
            curr_prompt = prompt_dict.get('prompt', '')
            if context_hint and not curr_prompt:
                ref__context_hints_by_lang[lang] += [(oref, context_hint)]
    return ref__context_hints_by_lang
