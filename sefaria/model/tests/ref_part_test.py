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

def create_raw_ref_data(context_tref, lang, tref, span_indexes, part_types):
    ref_resolver = RefResolver(lang, None, None)
    nlp = Hebrew() if lang == 'he' else English()
    doc = nlp(tref)
    span = doc[0:]
    part_spans = [span[index] for index in span_indexes]
    raw_ref = RawRef([RawRefPart("input", part_type, part_span) for part_type, part_span in zip(part_types, part_spans)], span)

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
    [create_raw_ref_data("Job 1", 'he', "בבלי ברכות דף ב", [0, 1, slice(2, 4)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Berakhot 2",)],   # amud-less talmud
    [create_raw_ref_data("Job 1", 'he', "בבלי שבת דף ב.", [0, 1, slice(2, 5)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Shabbat 2a",)],  # amud-ful talmud
    [create_raw_ref_data("Job 1", 'he', "בבלי דף ב עמוד א במכות", [0, slice(1, 5), 5], [RPT.NAMED, RPT.NUMBERED, RPT.NAMED]), ("Makkot 2a",)],  # out of order with prefix on title
    [create_raw_ref_data("Job 1", 'he', "רש\"י דף ב עמוד א בסוכה ד\"ה סוכה ורבי", [0, slice(1, 5), 5, slice(6, 9)], [RPT.NAMED, RPT.NUMBERED, RPT.NAMED, RPT.DH]), ("Rashi on Sukkah 2a:1:1",)],  # rashi dibur hamatchil
    [create_raw_ref_data("Job 1", 'he', "פרק אלו דברים בפסחים", [slice(0, 3), 3], [RPT.NAMED, RPT.NAMED]), ("Pesachim 65b:10-73b:16",)],  # talmud perek (that's ambiguous)
    [create_raw_ref_data("Job 1", 'he', "פרק אלו דברים", [slice(0, 3)], [RPT.NAMED]), ("Pesachim 65b:10-73b:16", "Berakhot 51b:11-53b:33")],  # talmud perek without book that's ambiguous
    [create_raw_ref_data("Job 1", 'he', "רש\"י פרק יום טוב בביצה", [0, slice(1, 4), 4], [RPT.NAMED, RPT.NAMED, RPT.NAMED]), ("Rashi on Beitzah 15b:1-23b:10",)],  # rashi perek
    [create_raw_ref_data("Job 1", 'he', "רש\"י פרק כל כנויי נזירות בנזיר ד\"ה כל כינויי נזירות", [0, slice(1, 5), 5, slice(6, 10)], [RPT.NAMED, RPT.NAMED, RPT.NAMED, RPT.DH]), ("Rashi on Nazir 2a:1:1",)],  # rashi perek dibur hamatchil
    [create_raw_ref_data("Job 1", 'he', "רש\"י יום טוב ד\"ה שמא יפשע", [0, slice(1, 3), slice(3, 6)], [RPT.NAMED, RPT.NAMED, RPT.DH]), ("Rashi on Beitzah 15b:8:1",)],
    [create_raw_ref_data("Job 1", 'he', "רש\"י ביצה ד\"ה שמא יפשע", [0, 1, slice(2, 5)], [RPT.NAMED, RPT.NAMED, RPT.DH]), ("Rashi on Beitzah 15b:8:1",)],
    [create_raw_ref_data("Job 1", 'he', "רש\"י יום טוב ד\"ה אלא ביבנה", [0, slice(1, 3), slice(3, 6)], [RPT.NAMED, RPT.NAMED, RPT.DH]), ("Rashi on Rosh Hashanah 29b:5:3",)],
    [create_raw_ref_data("Job 1", 'he', 'שבועות דף כה ע"א תוד"ה חומר', [0, slice(1, 4), 4, 5], [RPT.NAMED, RPT.NUMBERED, RPT.NAMED, RPT.DH]), ("Tosafot on Shevuot 25a:11:1",)],
])
def test_resolve_raw_ref(resolver_data, expected_trefs):
    ref_resolver, raw_ref, context_ref = resolver_data
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
])
def test_get_all_possible_sections_from_string(input_addr_str, AddressClass, expected_sections):
    exp_secs, exp2secs = expected_sections
    sections, toSections = AddressClass.get_all_possible_sections_from_string('he', input_addr_str)
    assert sections == exp_secs
    assert toSections == exp2secs