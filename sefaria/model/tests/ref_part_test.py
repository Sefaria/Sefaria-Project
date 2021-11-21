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
    nlp = Hebrew() if lang == 'he' else library.get_ref_resolver().get_raw_ref_part_model(lang)
    doc = nlp(input_str)
    span = doc[0:]
    part_spans = [span[index] for index in span_indexes]
    return [RawRefPart(part_type, part_span) for part_type, part_span in zip(part_types, part_spans)], span

def create_raw_ref_data(context_tref, lang, input_str, span_indexes, part_types):
    raw_ref = RawRef(*create_raw_ref_params(lang, input_str, span_indexes, part_types))
    return raw_ref, Ref(context_tref), lang


def test_duplicate_terms(duplicate_terms):
    t, s, initial_slug = duplicate_terms
    assert t.slug == AbstractMongoRecord.normalize_slug(initial_slug)
    assert s.slug == AbstractMongoRecord.normalize_slug(initial_slug) + "1"


def test_referenceable_child():
    i = library.get_index("Rashi on Berakhot")
    assert i.nodes.depth == 3
    child = i.nodes.get_referenceable_child(Ref("Rashi on Berakhot 2a"))
    assert isinstance(child, DiburHamatchilNodeSet)

def test_resolved_raw_ref_clone():
    index = library.get_index("Berakhot")
    raw_ref, context_ref, lang = create_raw_ref_data("Job 1", 'he', "בבלי ברכות דף ב", [0, 1, slice(2, 4)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED])
    rrr = ResolvedRawRef(raw_ref, [], index.nodes, Ref("Berakhot"))
    rrr_clone = rrr.clone(ref=Ref("Genesis"))
    assert  rrr_clone.ref == Ref("Genesis")

@pytest.mark.parametrize(('resolver_data', 'expected_trefs'), [
    # Numbered JAs
    [create_raw_ref_data("Job 1", 'he', "בבלי ברכות דף ב", [0, 1, slice(2, 4)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Berakhot 2",)],   # amud-less talmud
    [create_raw_ref_data("Job 1", 'he', "ברכות דף ב", [0, slice(1, 3)], [RPT.NAMED, RPT.NUMBERED]), ("Berakhot 2",)],  # amud-less talmud
    [create_raw_ref_data("Job 1", 'he', "בבלי שבת דף ב.", [0, 1, slice(2, 5)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Shabbat 2a",)],  # amud-ful talmud
    [create_raw_ref_data("Job 1", 'he', "בבלי דף ב עמוד א במכות", [0, slice(1, 5), 5], [RPT.NAMED, RPT.NUMBERED, RPT.NAMED]), ("Makkot 2a",)],  # out of order with prefix on title
    [create_raw_ref_data("Job 1", 'he', 'ספר בראשית פרק יג פסוק א', [slice(0, 2), slice(2, 4), slice(4, 6)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Genesis 13:1",)],
    [create_raw_ref_data("Job 1", 'he', 'ספר בראשית פסוק א פרק יג', [slice(0, 2), slice(2, 4), slice(4, 6)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Genesis 13:1",)],  # sections out of order

    [create_raw_ref_data("Job 1", 'he', "משנה ברכות פרק קמא", [0, 1, slice(2, 4)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Mishnah Berakhot 1",)],
    [create_raw_ref_data("Job 1", 'he', "משנה ברכות פרק בתרא", [0, 1, slice(2, 4)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Mishnah Berakhot 9",)],
    [create_raw_ref_data("Job 1", 'he', 'שמות א ב', [0, 1, 2], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Exodus 1:2",)],  # used to also match Exodus 2:1 b/c would allow mixing integer parts

    # Named alt structs
    [create_raw_ref_data("Job 1", 'he', "פרק אלו דברים בפסחים", [slice(0, 3), 3], [RPT.NAMED, RPT.NAMED]), ("Pesachim 65b:10-73b:16",)],  # talmud perek (that's ambiguous)
    [create_raw_ref_data("Job 1", 'he', "פרק אלו דברים", [slice(0, 3)], [RPT.NAMED]), ("Pesachim 65b:10-73b:16", "Berakhot 51b:11-53b:33")],  # talmud perek without book that's ambiguous
    [create_raw_ref_data("Job 1", 'he', "רש\"י פרק יום טוב בביצה", [0, slice(1, 4), 4], [RPT.NAMED, RPT.NAMED, RPT.NAMED]), ("Rashi on Beitzah 15b:1-23b:10",)],  # rashi perek
    [create_raw_ref_data("Job 1", 'he', "רש\"י פרק מאימתי", [0, slice(1, 3)], [RPT.NAMED, RPT.NAMED]), ("Rashi on Berakhot 2a:1-13a:15",)],  # rashi perek
    [create_raw_ref_data("Job 1", 'he', "רש\"י פרק כל כנויי נזירות בנזיר ד\"ה כל כינויי נזירות", [0, slice(1, 5), 5, slice(6, 10)], [RPT.NAMED, RPT.NAMED, RPT.NAMED, RPT.DH]), ("Rashi on Nazir 2a:1:1",)],  # rashi perek dibur hamatchil
    # Numbered alt structs
    [create_raw_ref_data("Job 1", 'he', "פרק קמא בפסחים", [slice(0, 2), 2], [RPT.NUMBERED, RPT.NAMED]), ("Pesachim 2a:1-21a:7", "Mishnah Pesachim 1", "Tosefta Pesachim 1", "Tosefta Pesachim (Lieberman) 1", "Jerusalem Talmud Pesachim 1")],  # numbered talmud perek
    [create_raw_ref_data("Job 1", 'he', 'פ"ק בפסחים', [0, 1], [RPT.NUMBERED, RPT.NAMED]), ("Pesachim 2a:1-21a:7", "Mishnah Pesachim 1", "Tosefta Pesachim 1", "Jerusalem Talmud Pesachim 1", "Tosefta Pesachim (Lieberman) 1")],  # numbered talmud perek
    [create_raw_ref_data("Job 1", 'he', "פרק ה בפסחים", [slice(0, 2), 2], [RPT.NUMBERED, RPT.NAMED]), ("Pesachim 58a:1-65b:9", "Mishnah Pesachim 5", "Tosefta Pesachim 5", "Jerusalem Talmud Pesachim 5", "Tosefta Pesachim (Lieberman) 5")],  # numbered talmud perek
    [create_raw_ref_data("Job 1", 'he', 'פ"ה בפסחים', [0, 1], [RPT.NUMBERED, RPT.NAMED]), ("Pesachim 58a:1-65b:9", "Mishnah Pesachim 5", "Pesachim 85", "Tosefta Pesachim 5", "Jerusalem Talmud Pesachim 5", "Tosefta Pesachim (Lieberman) 5")],  # numbered talmud perek
    [create_raw_ref_data("Job 1", 'he', "פרק בתרא בפסחים", [slice(0, 2), 2], [RPT.NUMBERED, RPT.NAMED]), ("Mishnah Pesachim 10", "Pesachim 99b:1-121b:3", "Tosefta Pesachim 10", "Jerusalem Talmud Pesachim 10", "Tosefta Pesachim (Lieberman) 10")],  # numbered talmud perek
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
    [create_raw_ref_data("Rashi on Berakhot 2a", 'he', 'ובתוס\' כ"ז ע"ב ד"ה והלכתא', [slice(0, 2), slice(2, 4), slice(4, 6)], [RPT.NAMED, RPT.NUMBERED, RPT.DH]), ("Tosafot on Berakhot 27b:14:2",)],

    # YERUSHALMI EN
    [create_raw_ref_data("Jerusalem Talmud Shabbat 1:1", 'en', 'Bavli 2a', [0, 1], [RPT.NAMED, RPT.NUMBERED]), ("Shabbat 2a",)],
    [create_raw_ref_data("Jerusalem Talmud Shabbat 1:1", 'en', 'Berakhot 2:1', [0, 1, 3], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Jerusalem Talmud Berakhot 2:1",)],
    [create_raw_ref_data("Jerusalem Talmud Shabbat 1:1", 'en', 'Bavli 2a/b', [0, 1, 2, 3], [RPT.NAMED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED]), ("Shabbat 2",)],
    [create_raw_ref_data("Jerusalem Talmud Shabbat 1:1", 'en', 'Halakha 2:3', [0, 1, 3], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Jerusalem Talmud Shabbat 2:3",)],
    [create_raw_ref_data("Jerusalem Talmud Shabbat 1:1", 'en', '2:3', [0, 2], [RPT.NUMBERED, RPT.NUMBERED]), ("Jerusalem Talmud Shabbat 2:3",)],
    [create_raw_ref_data("Jerusalem Talmud Shabbat 1:1", 'en', 'Chapter 2, Note 34', [slice(0, 2), slice(3, 5)], [RPT.NUMBERED, RPT.NUMBERED]), ("Jerusalem Talmud Shabbat 2:1:4",)],
    [create_raw_ref_data("Jerusalem Talmud Shabbat 1:1", 'en', 'Yalqut Psalms 116', [0, 1, 2], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Yalkut Shimoni on Nach 874:1-875:4",)],
    [create_raw_ref_data("Jerusalem Talmud Sheviit 1:1:3", 'en', 'Tosephta Ševi‘it 1:1', [0, slice(1,4), 4, 6], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Tosefta Sheviit 1:1", "Tosefta Sheviit (Lieberman) 1:1")],
    [create_raw_ref_data("Jerusalem Talmud Taanit 1:1:3", 'en', 'Babli 28b,31a', [0, 1, 2, 3], [RPT.NAMED, RPT.NUMBERED, RPT.NON_CTS, RPT.NUMBERED]), ("Taanit 28b", "Taanit 31a")],  # non-cts with talmud
    [create_raw_ref_data("Jerusalem Talmud Taanit 1:1:3", 'en', 'Exodus 21:1,3,22:5', [0, 1, 3, 4, 5, 6, 7, 9], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED, RPT.NON_CTS, RPT.NUMBERED, RPT.NON_CTS, RPT.NUMBERED, RPT.NUMBERED]), ("Exodus 21:1", "Exodus 21:3", "Exodus 22:5")],  # non-cts with tanakh
    [create_raw_ref_data("Jerusalem Talmud Taanit 1:1:3", 'en', 'Roš Haššanah 4, Notes 42–43', [slice(0, 2), 2, slice(4, 6), 6, 7], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED]), ("Jerusalem Talmud Rosh Hashanah 4",)],  # this is currently testing resolution of partial ranged refs since we don't support Note refs.
    [create_raw_ref_data("Jerusalem Talmud Pesachim 1:1:3", 'en', 'Tosaphot 85a, s.v. ולרבינא', [0, 1, slice(3, 8)], [RPT.NAMED, RPT.NUMBERED, RPT.DH]), ("Tosafot on Pesachim 85a:14:1",)],
    [create_raw_ref_data("Jerusalem Talmud Pesachim 1:1:3", 'en', 'Unknown book 2', [slice(0, 2), 1], [RPT.NAMED, RPT.NUMBERED]), tuple()],  # make sure title context doesn't match this
])
def test_resolve_raw_ref(resolver_data, expected_trefs):
    ref_resolver = library.get_ref_resolver()
    raw_ref, context_ref, lang = resolver_data
    print('Input:', raw_ref.text)
    matches = ref_resolver.resolve_raw_ref(lang, context_ref, raw_ref)
    matched_orefs = sorted([match.ref for match in matches], key=lambda x: x.normal())
    if len(expected_trefs) != len(matched_orefs):
        print(f"Found {len(matched_orefs)} refs instead of {len(expected_trefs)}")
        for matched_oref in matched_orefs:
            print("-", matched_oref.normal())
    assert len(expected_trefs) == len(matched_orefs)
    for expected_tref, matched_oref in zip(sorted(expected_trefs, key=lambda x: x), matched_orefs):
        assert matched_oref == Ref(expected_tref)


@pytest.mark.parametrize(('input_str', 'lang', 'expected_trefs'), [
    ["""גמ' שמזונותן עליך. עיין ביצה דף טו ע"ב רש"י ד"ה שמא יפשע:""", 'he', ("Rashi on Beitzah 15b:8:1",)],
    ["""שם אלא ביתך ל"ל. ע' מנחות מד ע"א תד"ה טלית:""", 'he', ("Tosafot on Menachot 44a:12:1",)],
    ["""גמ' במה מחנכין. עי' מנחות דף עח ע"א תוס' ד"ה אחת:""", 'he',("Tosafot on Menachot 78a:10:1",)],
])
def test_full_pipeline_ref_resolver(input_str, lang, expected_trefs):
    ref_resolver = library.get_ref_resolver()
    resolved = ref_resolver.resolve_refs_in_string(lang, Ref("Job 1"), input_str)
    assert len(resolved) == len(expected_trefs)
    resolved_orefs = sorted([match.ref for match in resolved], key=lambda x: x.normal())
    for expected_tref, matched_oref in zip(sorted(expected_trefs, key=lambda x: x), resolved_orefs):
        assert matched_oref == Ref(expected_tref)

@pytest.mark.parametrize(('input_addr_str', 'AddressClass','expected_sections'), [
    ['פ"ח', schema.AddressPerek, ([8, 88], [8, 88], [schema.AddressPerek, schema.AddressInteger])],
    ['מ"ד', schema.AddressTalmud, ([87], [88], [schema.AddressTalmud])],
    ['מ"ד.', schema.AddressTalmud, ([87], [87], [schema.AddressTalmud])],
    ['מ"ד ע"ב', schema.AddressTalmud, ([88], [88], [schema.AddressTalmud])],
    ['מ"ד', schema.AddressMishnah, ([4, 44], [4, 44], [schema.AddressMishnah, schema.AddressInteger])],
    ['פ"ק', schema.AddressPerek, ([1, 100], [1, 100], [schema.AddressPerek, schema.AddressPerek])],
])
def test_get_all_possible_sections_from_string(input_addr_str, AddressClass, expected_sections):
    exp_secs, exp2secs, exp_addrs = expected_sections
    sections, toSections, addr_classes = AddressClass.get_all_possible_sections_from_string('he', input_addr_str)
    sections = sorted(sections)
    toSections = sorted(toSections)
    assert sections == exp_secs
    assert toSections == exp2secs
    assert list(addr_classes) == exp_addrs

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
