import pytest, re
from sefaria.model.text import Ref, library
from sefaria.model.ref_part import *
from sefaria.model.abstract import AbstractMongoRecord
from sefaria.model.ref_part import RefPartType as RPT
from sefaria.model.schema import DiburHamatchilNodeSet
import spacy
from spacy.lang.he import Hebrew
from spacy.lang.en import English
from spacy.language import Language
from sefaria.model import schema
from sefaria.spacy_function_registry import custom_tokenizer_factory  # used by spacy.load()

@pytest.fixture(scope='module')
def duplicate_terms():
    initial_slug = "rashiBLAHBLAH"
    t = NonUniqueTerm({"slug": initial_slug, "titles": [{
        "text": "Rashi",
        "lang": "en",
        "primary": True
    }]})
    t.save()

    s = NonUniqueTerm({"slug": initial_slug, "titles": [{
        "text": "Rashi",
        "lang": "en",
        "primary": True
    }]})

    s.save()

    yield t, s, initial_slug

    t.delete()
    s.delete()

def model(project_name: str) -> Language:
    return spacy.load(f'/home/nss/sefaria/data/research/prodigy/output/{project_name}/model-last')

def create_raw_ref_params(lang, input_str, span_indexes, part_types):
    nlp = Hebrew() if lang == 'he' else English()
    doc = nlp(input_str)
    span = doc[0:]
    part_spans = [span[index] for index in span_indexes]
    return [RawRefPart(part_type, part_span) for part_type, part_span in zip(part_types, part_spans)], span

def create_raw_ref_data(context_tref, lang, input_str, span_indexes, part_types):
    ref_resolver = RefResolver(lang, None, None)
    raw_ref = RawRef(*create_raw_ref_params(lang, input_str, span_indexes, part_types))
    return ref_resolver, raw_ref, Ref(context_tref)


def test_duplicate_terms(duplicate_terms):
    t, s, initial_slug = duplicate_terms
    assert t.slug == AbstractMongoRecord.normalize_slug(initial_slug)
    assert s.slug == AbstractMongoRecord.normalize_slug(initial_slug) + "1"


def test_referenceable_child():
    i = library.get_index("Rashi on Berakhot")
    assert i.nodes.depth == 3
    child = i.nodes.get_referenceable_child(Ref("Rashi on Berakhot 2a"))
    assert isinstance(child, DiburHamatchilNodeSet)

@pytest.mark.parametrize(('resolver_data', 'expected_trefs'), [
    # Numbered JAs
    [create_raw_ref_data("Job 1", 'he', "בבלי ברכות דף ב", [0, 1, slice(2, 4)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Berakhot 2",)],   # amud-less talmud
    [create_raw_ref_data("Job 1", 'he', "ברכות דף ב", [0, slice(1, 3)], [RPT.NAMED, RPT.NUMBERED]), ("Berakhot 2",)],  # amud-less talmud
    [create_raw_ref_data("Job 1", 'he', "בבלי שבת דף ב.", [0, 1, slice(2, 5)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Shabbat 2a",)],  # amud-ful talmud
    [create_raw_ref_data("Job 1", 'he', "בבלי דף ב עמוד א במכות", [0, slice(1, 5), 5], [RPT.NAMED, RPT.NUMBERED, RPT.NAMED]), ("Makkot 2a",)],  # out of order with prefix on title
    [create_raw_ref_data("Job 1", 'he', 'ספר בראשית פרק יג פסוק א', [slice(0, 2), slice(2, 4), slice(4, 6)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Genesis 13:1",)],
    [create_raw_ref_data("Job 1", 'he', "משנה ברכות פרק קמא", [0, 1, slice(2, 4)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Mishnah Berakhot 1",)],
    [create_raw_ref_data("Job 1", 'he', "משנה ברכות פרק בתרא", [0, 1, slice(2, 4)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Mishnah Berakhot 9",)],

    # Named alt structs
    [create_raw_ref_data("Job 1", 'he', "פרק אלו דברים בפסחים", [slice(0, 3), 3], [RPT.NAMED, RPT.NAMED]), ("Pesachim 65b:10-73b:16",)],  # talmud perek (that's ambiguous)
    [create_raw_ref_data("Job 1", 'he', "פרק אלו דברים", [slice(0, 3)], [RPT.NAMED]), ("Pesachim 65b:10-73b:16", "Berakhot 51b:11-53b:33")],  # talmud perek without book that's ambiguous
    [create_raw_ref_data("Job 1", 'he', "רש\"י פרק יום טוב בביצה", [0, slice(1, 4), 4], [RPT.NAMED, RPT.NAMED, RPT.NAMED]), ("Rashi on Beitzah 15b:1-23b:10",)],  # rashi perek
    [create_raw_ref_data("Job 1", 'he', "רש\"י פרק כל כנויי נזירות בנזיר ד\"ה כל כינויי נזירות", [0, slice(1, 5), 5, slice(6, 10)], [RPT.NAMED, RPT.NAMED, RPT.NAMED, RPT.DH]), ("Rashi on Nazir 2a:1:1",)],  # rashi perek dibur hamatchil
    # Numbered alt structs
    [create_raw_ref_data("Job 1", 'he', "פרק קמא בפסחים", [slice(0, 2), 2], [RPT.NUMBERED, RPT.NAMED]), ("Pesachim 2a:1-21a:7", "Mishnah Pesachim 1")],  # numbered talmud perek
    [create_raw_ref_data("Job 1", 'he', 'פ"ק בפסחים', [0, 1], [RPT.NUMBERED, RPT.NAMED]), ("Pesachim 2a:1-21a:7", "Mishnah Pesachim 1")],  # numbered talmud perek
    [create_raw_ref_data("Job 1", 'he', "פרק ה בפסחים", [slice(0, 2), 2], [RPT.NUMBERED, RPT.NAMED]), ("Pesachim 58a:1-65b:9", "Mishnah Pesachim 5")],  # numbered talmud perek
    [create_raw_ref_data("Job 1", 'he', 'פ"ה בפסחים', [0, 1], [RPT.NUMBERED, RPT.NAMED]), ("Pesachim 58a:1-65b:9", "Mishnah Pesachim 5")],  # numbered talmud perek
    [create_raw_ref_data("Job 1", 'he', "פרק בתרא בפסחים", [slice(0, 2), 2], [RPT.NUMBERED, RPT.NAMED]), ("Mishnah Pesachim 10", "Pesachim 99b:1-121b:3",)],  # numbered talmud perek
    # Dibur hamatchils
    [create_raw_ref_data("Job 1", 'he', "רש\"י יום טוב ד\"ה שמא יפשע", [0, slice(1, 3), slice(3, 6)], [RPT.NAMED, RPT.NAMED, RPT.DH]), ("Rashi on Beitzah 15b:8:1",)],
    [create_raw_ref_data("Job 1", 'he', "רש\"י ביצה ד\"ה שמא יפשע", [0, 1, slice(2, 5)], [RPT.NAMED, RPT.NAMED, RPT.DH]), ("Rashi on Beitzah 15b:8:1",)],
    [create_raw_ref_data("Job 1", 'he', "רש\"י יום טוב ד\"ה אלא ביבנה", [0, slice(1, 3), slice(3, 6)], [RPT.NAMED, RPT.NAMED, RPT.DH]), ("Rashi on Rosh Hashanah 29b:5:3",)],
    [create_raw_ref_data("Job 1", 'he', 'שבועות דף כה ע"א תוד"ה חומר', [0, slice(1, 4), 4, 5], [RPT.NAMED, RPT.NUMBERED, RPT.NAMED, RPT.DH]), ("Tosafot on Shevuot 25a:11:1",)],
    [create_raw_ref_data("Job 1", 'he', "רש\"י דף ב עמוד א בסוכה ד\"ה סוכה ורבי", [0, slice(1, 5), 5, slice(6, 9)], [RPT.NAMED, RPT.NUMBERED, RPT.NAMED, RPT.DH]), ("Rashi on Sukkah 2a:1:1",)], # rashi dibur hamatchil
    # Ranged refs
    [create_raw_ref_data("Job 1", 'he', 'ספר בראשית פרק יג פסוק א עד פרק יד פסוק ד', [slice(0, 2), slice(2, 4), slice(4, 6), 6, slice(7, 9), slice(9, 11)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED, RPT.NUMBERED]), ("Genesis 13:1-14:4",)],
    [create_raw_ref_data("Job 1", 'he', 'בראשית יג:א-יד:ד', [0, 1, 3, 4, 5, 7], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED, RPT.NUMBERED]), ("Genesis 13:1-14:4",)],
    # Base text context
    [create_raw_ref_data("Gilyon HaShas on Berakhot 2a", 'he', 'ובתוס\' כ"ז ע"ב ד"ה והלכתא', [0, slice(1, 3), slice(3, 5)], [RPT.NAMED, RPT.NUMBERED, RPT.DH]), ("Tosafot on Berakhot 27b:14:2",)],
])
def test_resolve_raw_ref(resolver_data, expected_trefs):
    ref_resolver, raw_ref, context_ref = resolver_data
    print('Input:', raw_ref.text)
    matches = ref_resolver.resolve_raw_ref(context_ref, raw_ref)
    matched_orefs = sorted([match.ref for match in matches], key=lambda x: x.normal())
    for expected_tref, matched_oref in zip(sorted(expected_trefs, key=lambda x: x), matched_orefs):
        assert matched_oref == Ref(expected_tref)

ref_resolver = RefResolver('he', model('ref_tagging_gilyon'), model('sub_citation'))
@pytest.mark.parametrize(('input_str', 'expected_trefs'), [
    ["""גמ' שמזונותן עליך. עיין ביצה דף טו ע"ב רש"י ד"ה שמא יפשע:""", ("Rashi on Beitzah 15b:8:1",)],
    ["""שם אלא ביתך ל"ל. ע' מנחות מד ע"א תד"ה טלית:""", ("Tosafot on Menachot 44a:12:1",)],
    ["""גמ' במה מחנכין. עי' מנחות דף עח ע"א תוס' ד"ה אחת:""", ("Tosafot on Menachot 78a:10:1",)],
])
def test_full_pipeline_ref_resolver(input_str, expected_trefs):
    resolved = ref_resolver.resolve_refs_in_string(Ref("Job 1"), input_str)
    assert len(resolved) == len(expected_trefs)
    resolved_orefs = sorted([match.ref for match in resolved], key=lambda x: x.normal())
    for expected_tref, matched_oref in zip(sorted(expected_trefs, key=lambda x: x), resolved_orefs):
        assert matched_oref == Ref(expected_tref)

@pytest.mark.parametrize(('input_addr_str', 'AddressClass','expected_sections'), [
    ['פ"ח', schema.AddressPerek, ([8, 88], [8, 88])],
    ['מ"ד', schema.AddressTalmud, ([87], [88])],
    ['מ"ד.', schema.AddressTalmud, ([87], [87])],
    ['מ"ד ע"ב', schema.AddressTalmud, ([88], [88])],
    ['מ"ד', schema.AddressMishnah, ([4, 44], [4, 44])],
    ['פ"ק', schema.AddressPerek, ([1, 100], [1, 100])],
])
def test_get_all_possible_sections_from_string(input_addr_str, AddressClass, expected_sections):
    exp_secs, exp2secs = expected_sections
    sections, toSections = AddressClass.get_all_possible_sections_from_string('he', input_addr_str)
    assert sections == exp_secs
    assert toSections == exp2secs

@pytest.mark.parametrize(('raw_ref_params', 'expected_section_slices'), [
    [create_raw_ref_params('he', "בראשית א:א-ב", [0, 1, 3, 4, 5], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED]), (slice(1,3),slice(4,5))],  # standard case
    [create_raw_ref_params('he', "א:א-ב", [0, 2, 3, 4], [RPT.NUMBERED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED]), (slice(0,2),slice(3,4))],  # only numbered sections
    [create_raw_ref_params('he', "בראשית א:א-ב:א", [0, 1, 3, 4, 5, 7], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED, RPT.NUMBERED]), (slice(1,3),slice(4,6))],  # full sections and toSections
    [create_raw_ref_params('he', "בראשית א:א", [0, 1, 3], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), (None, None)],  # no ranged symbol
    [create_raw_ref_params('he', 'ספר בראשית פרק יג פסוק א עד פרק יד פסוק ד', [slice(0, 2), slice(2, 4), slice(4, 6), 6, slice(7, 9), slice(9, 11)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED, RPT.NUMBERED]), (slice(1,3), slice(4,6))],  # verbose range
])
def test_group_ranged_parts(raw_ref_params, expected_section_slices):
    raw_ref_parts, span = raw_ref_params
    raw_ref = RawRef(raw_ref_parts, span)
    exp_sec_slice, exp2sec_slice = expected_section_slices
    if exp_sec_slice is None:
        expected_raw_ref_parts = raw_ref_parts
    else:
        sections = raw_ref_parts[exp_sec_slice]
        toSections = sections[:]
        toSections[-(exp2sec_slice.stop-exp2sec_slice.start):] = raw_ref_parts[exp2sec_slice]
        expected_ranged_raw_ref_parts = RangedRawRefParts(sections, toSections)
        expected_raw_ref_parts = raw_ref_parts[:exp_sec_slice.start] + \
                                 [expected_ranged_raw_ref_parts] + \
                                 raw_ref_parts[exp2sec_slice.stop:]
        ranged_raw_ref_parts = raw_ref.raw_ref_parts[exp_sec_slice.start]
        assert ranged_raw_ref_parts.sections == expected_ranged_raw_ref_parts.sections
        assert ranged_raw_ref_parts.toSections == expected_ranged_raw_ref_parts.toSections
        start_span = sections[0].span
        end_span = toSections[-1].span
        start_token_i = start_span.start if isinstance(start_span, Span) else start_span.i
        end_token_i = end_span.end if isinstance(end_span, Span) else (end_span.i+1)
        full_span = start_span.doc[start_token_i:end_token_i]
        assert ranged_raw_ref_parts.span.text == full_span.text
    assert raw_ref.raw_ref_parts == expected_raw_ref_parts
