import pytest, re
from functools import reduce
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


def create_raw_ref_data(context_tref, lang, input_str, span_indexes, part_types, prev_matches_trefs=None):
    """
    Just reflecting prev_matches_trefs here b/c pytest.parametrize cant handle optional parameters
    """
    raw_ref = RawRef(*create_raw_ref_params(lang, input_str, span_indexes, part_types))
    context_oref = context_tref and Ref(context_tref)
    return raw_ref, context_oref, lang, prev_matches_trefs


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
    raw_ref, context_ref, lang, _ = create_raw_ref_data(None, 'he', "בבלי ברכות דף ב", [0, 1, slice(2, 4)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED])
    rrr = ResolvedRawRef(raw_ref, [], index.nodes, Ref("Berakhot"))
    rrr_clone = rrr.clone(ref=Ref("Genesis"))
    assert rrr_clone.ref == Ref("Genesis")


crrd = create_raw_ref_data


@pytest.mark.parametrize(('resolver_data', 'expected_trefs'), [
    # Numbered JAs
    [crrd(None, 'he', "בבלי ברכות דף ב", [0, 1, slice(2, 4)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Berakhot 2",)],   # amud-less talmud
    [crrd(None, 'he', "ברכות דף ב", [0, slice(1, 3)], [RPT.NAMED, RPT.NUMBERED]), ("Berakhot 2",)],  # amud-less talmud
    [crrd(None, 'he', "בבלי שבת דף ב.", [0, 1, slice(2, 5)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Shabbat 2a",)],  # amud-ful talmud
    [crrd(None, 'he', "בבלי דף ב עמוד א במכות", [0, slice(1, 5), 5], [RPT.NAMED, RPT.NUMBERED, RPT.NAMED]), ("Makkot 2a",)],  # out of order with prefix on title
    [crrd(None, 'he', 'ספר בראשית פרק יג פסוק א', [slice(0, 2), slice(2, 4), slice(4, 6)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Genesis 13:1",)],
    [crrd(None, 'he', 'ספר בראשית פסוק א פרק יג', [slice(0, 2), slice(2, 4), slice(4, 6)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Genesis 13:1",)],  # sections out of order

    [crrd(None, 'he', "משנה ברכות פרק קמא", [0, 1, slice(2, 4)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Mishnah Berakhot 1",)],
    [crrd(None, 'he', "משנה ברכות פרק בתרא", [0, 1, slice(2, 4)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Mishnah Berakhot 9",)],
    [crrd(None, 'he', 'שמות א ב', [0, 1, 2], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Exodus 1:2",)],  # used to also match Exodus 2:1 b/c would allow mixing integer parts

    # Named alt structs
    [crrd(None, 'he', "פרק אלו דברים בפסחים", [slice(0, 3), 3], [RPT.NAMED, RPT.NAMED]), ("Pesachim 65b:10-73b:16",)],  # talmud perek (that's ambiguous)
    [crrd(None, 'he', "פרק אלו דברים", [slice(0, 3)], [RPT.NAMED]), ("Pesachim 65b:10-73b:16", "Berakhot 51b:11-53b:33")],  # talmud perek without book that's ambiguous
    [crrd(None, 'he', "רש\"י פרק יום טוב בביצה", [0, slice(1, 4), 4], [RPT.NAMED, RPT.NAMED, RPT.NAMED]), ("Rashi on Beitzah 15b:1-23b:10",)],  # rashi perek
    [crrd(None, 'he', "רש\"י פרק מאימתי", [0, slice(1, 3)], [RPT.NAMED, RPT.NAMED]), ("Rashi on Berakhot 2a:1-13a:15",)],  # rashi perek
    [crrd(None, 'he', "רש\"י פרק כל כנויי נזירות בנזיר ד\"ה כל כינויי נזירות", [0, slice(1, 5), 5, slice(6, 10)], [RPT.NAMED, RPT.NAMED, RPT.NAMED, RPT.DH]), ("Rashi on Nazir 2a:1:1",)],  # rashi perek dibur hamatchil

    # Numbered alt structs
    pytest.param(crrd(None, 'he', "פרק קמא בפסחים", [slice(0, 2), 2], [RPT.NUMBERED, RPT.NAMED]), ("Pesachim 2a:1-21a:7", "Mishnah Pesachim 1", "Tosefta Pesachim 1", "Tosefta Pesachim (Lieberman) 1", "Jerusalem Talmud Pesachim 1"), marks=pytest.mark.xfail(reason='need to add lengths to yerushalmi and tosefta lieberman')),  # numbered talmud perek
    pytest.param(crrd(None, 'he', 'פ"ק בפסחים', [0, 1], [RPT.NUMBERED, RPT.NAMED]), ("Pesachim 2a:1-21a:7", "Mishnah Pesachim 1", "Tosefta Pesachim 1", "Jerusalem Talmud Pesachim 1", "Tosefta Pesachim (Lieberman) 1"), marks=pytest.mark.xfail(reason='need to add lengths to yerushalmi and tosefta lieberman')),  # numbered talmud perek
    [crrd(None, 'he', "פרק ה בפסחים", [slice(0, 2), 2], [RPT.NUMBERED, RPT.NAMED]), ("Pesachim 58a:1-65b:9", "Mishnah Pesachim 5", "Tosefta Pesachim 5", "Jerusalem Talmud Pesachim 5", "Tosefta Pesachim (Lieberman) 5")],  # numbered talmud perek
    pytest.param(crrd(None, 'he', 'פ"ה בפסחים', [0, 1], [RPT.NUMBERED, RPT.NAMED]), ("Pesachim 58a:1-65b:9", "Mishnah Pesachim 5", "Pesachim 85", "Tosefta Pesachim 5", "Jerusalem Talmud Pesachim 5", "Tosefta Pesachim (Lieberman) 5"), marks=pytest.mark.xfail(reason='need to add lengths to yerushalmi and tosefta lieberman')),  # numbered talmud perek
    [crrd(None, 'he', "פרק בתרא בפסחים", [slice(0, 2), 2], [RPT.NUMBERED, RPT.NAMED]), ("Mishnah Pesachim 10", "Pesachim 99b:1-121b:3", "Tosefta Pesachim 10", "Jerusalem Talmud Pesachim 10", "Tosefta Pesachim (Lieberman) 10")],  # numbered talmud perek
    [crrd(None, 'he', '''מגמ' דרפ"ו דנדה''', [slice(0, 2), 2, 3], [RPT.NAMED, RPT.NUMBERED, RPT.NAMED]), ("Niddah 48a:11-54b:9",)],  # prefixes in front of perek name

    # Dibur hamatchils
    [crrd(None, 'he', "רש\"י יום טוב ד\"ה שמא יפשע", [0, slice(1, 3), slice(3, 6)], [RPT.NAMED, RPT.NAMED, RPT.DH]), ("Rashi on Beitzah 15b:8:1",)],
    [crrd(None, 'he', "רש\"י ביצה ד\"ה שמא יפשע", [0, 1, slice(2, 5)], [RPT.NAMED, RPT.NAMED, RPT.DH]), ("Rashi on Beitzah 15b:8:1",)],
    [crrd(None, 'he', "רש\"י יום טוב ד\"ה אלא ביבנה", [0, slice(1, 3), slice(3, 6)], [RPT.NAMED, RPT.NAMED, RPT.DH]), ("Rashi on Rosh Hashanah 29b:5:3",)],
    [crrd(None, 'he', 'שבועות דף כה ע"א תוד"ה חומר', [0, slice(1, 4), 4, 5], [RPT.NAMED, RPT.NUMBERED, RPT.NAMED, RPT.DH]), ("Tosafot on Shevuot 25a:11:1",)],
    [crrd(None, 'he', "רש\"י דף ב עמוד א בסוכה ד\"ה סוכה ורבי", [0, slice(1, 5), 5, slice(6, 9)], [RPT.NAMED, RPT.NUMBERED, RPT.NAMED, RPT.DH]), ("Rashi on Sukkah 2a:1:1",)], # rashi dibur hamatchil

    # Ranged refs
    [crrd(None, 'he', 'ספר בראשית פרק יג פסוק א עד פרק יד פסוק ד', [slice(0, 2), slice(2, 4), slice(4, 6), 6, slice(7, 9), slice(9, 11)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED, RPT.NUMBERED]), ("Genesis 13:1-14:4",)],
    [crrd(None, 'he', 'בראשית יג:א-יד:ד', [0, 1, 3, 4, 5, 7], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED, RPT.NUMBERED]), ("Genesis 13:1-14:4",)],

    # Base text context
    [crrd("Rashi on Berakhot 2a", 'he', 'ובתוס\' כ"ז ע"ב ד"ה והלכתא', [slice(0, 2), slice(2, 4), slice(4, 6)], [RPT.NAMED, RPT.NUMBERED, RPT.DH]), ("Tosafot on Berakhot 27b:14:2",)],  # shared context child via graph context

    # Ibid
    [crrd(None, 'he', 'פרק ד', [slice(0, 2)], [RPT.NUMBERED], ["Genesis 1"]), ("Genesis 4",)],
    [crrd(None, 'he', 'פרק ד', [slice(0, 2)], [RPT.NUMBERED], ["Genesis 1", None]), tuple()],
    [crrd(None, 'he', 'תוספות ד"ה והלכתא', [0, slice(1, 3)], [RPT.NAMED, RPT.DH], ["Berakhot 27b"]), ("Tosafot on Berakhot 27b:14:2",)],
    [crrd('Berakhot 2a', 'he', 'דף כ', [slice(0, 2)], [RPT.NUMBERED], ["Shabbat 2a"]), ("Berakhot 20", "Shabbat 20")],  # conflicting contexts
    [crrd('Berakhot 2a', 'he', 'דף כ שם', [slice(0, 2), 2], [RPT.NUMBERED, RPT.IBID], ["Shabbat 2a"]), ("Shabbat 20",)],  # conflicting contexts which can be resolved by explicit sham
    [crrd("Gilyon HaShas on Berakhot 30a:2", 'he', '''ותוס' שם ד"ה תרי''', [slice(0, 2), 2, slice(3, 5)], [RPT.NAMED, RPT.IBID, RPT.DH], ["Berakhot 17b"]), ("Tosafot on Berakhot 17b:5:1",)],  # Ibid.
    [crrd("Mishnah Berakhot 1", 'he', 'שם שם ב', [0, 1, slice(2, 4)], [RPT.IBID, RPT.IBID, RPT.NUMBERED], ['Mishnah Shabbat 1:1']), ("Mishnah Shabbat 1:2",)],  # multiple shams. TODO failing because we're not enforcing order

    # Relative (e.g. Lekaman)
    [crrd("Gilyon HaShas on Berakhot 2a:2", 'he', '''תוס' לקמן ד ע"ב ד"ה דאר"י''', [slice(0, 2), 2, slice(3, 5), slice(5, 7)], [RPT.NAMED, RPT.RELATIVE, RPT.NUMBERED, RPT.DH]), ("Tosafot on Berakhot 4b:6:1",)],  # likaman + abbrev in DH
    [crrd("Mishnah Berakhot 1", 'he', 'לקמן משנה א', [0, slice(1, 3)], [RPT.RELATIVE, RPT.NUMBERED], ['Mishnah Shabbat 1']), ("Mishnah Berakhot 1:1",)],  # competing relative and sham

    # YERUSHALMI EN
    [crrd("Jerusalem Talmud Shabbat 1:1", 'en', 'Bavli 2a', [0, 1], [RPT.NAMED, RPT.NUMBERED]), ("Shabbat 2a",)],
    [crrd("Jerusalem Talmud Shabbat 1:1", 'en', 'Berakhot 2:1', [0, 1, 3], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Jerusalem Talmud Berakhot 2:1",)],
    [crrd("Jerusalem Talmud Shabbat 1:1", 'en', 'Bavli 2a/b', [0, 1, 2, 3], [RPT.NAMED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED]), ("Shabbat 2",)],
    [crrd("Jerusalem Talmud Shabbat 1:1", 'en', 'Halakha 2:3', [0, 1, 3], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Jerusalem Talmud Shabbat 2:3",)],
    [crrd("Jerusalem Talmud Shabbat 1:1", 'en', '2:3', [0, 2], [RPT.NUMBERED, RPT.NUMBERED]), ("Jerusalem Talmud Shabbat 2:3",)],
    #[crrd("Jerusalem Talmud Shabbat 1:1", 'en', 'Chapter 2, Note 34', [slice(0, 2), slice(3, 5)], [RPT.NUMBERED, RPT.NUMBERED]), ("Jerusalem Talmud Shabbat 2:1:4",)],
    #[crrd("Jerusalem Talmud Shabbat 1:1", 'en', 'Yalqut Psalms 116', [0, 1, 2], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Yalkut Shimoni on Nach 874:1-875:4",)],
    [crrd("Jerusalem Talmud Sheviit 1:1:3", 'en', 'Tosephta Ševi‘it 1:1', [0, slice(1,4), 4, 6], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Tosefta Sheviit 1:1", "Tosefta Sheviit (Lieberman) 1:1")],
    [crrd("Jerusalem Talmud Taanit 1:1:3", 'en', 'Babli 28b,31a', [0, 1, 2, 3], [RPT.NAMED, RPT.NUMBERED, RPT.NON_CTS, RPT.NUMBERED]), ("Taanit 28b", "Taanit 31a")],  # non-cts with talmud
    [crrd("Jerusalem Talmud Taanit 1:1:3", 'en', 'Exodus 21:1,3,22:5', [0, 1, 3, 4, 5, 6, 7, 9], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED, RPT.NON_CTS, RPT.NUMBERED, RPT.NON_CTS, RPT.NUMBERED, RPT.NUMBERED]), ("Exodus 21:1", "Exodus 21:3", "Exodus 22:5")],  # non-cts with tanakh
    [crrd("Jerusalem Talmud Taanit 1:1:3", 'en', 'Roš Haššanah 4, Notes 42–43', [slice(0, 2), 2, slice(4, 6), 6, 7], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED, RPT.RANGE_SYMBOL, RPT.NUMBERED]), ("Jerusalem Talmud Rosh Hashanah 4",)],  # this is currently testing resolution of partial ranged refs since we don't support Note refs.
    [crrd("Jerusalem Talmud Pesachim 1:1:3", 'en', 'Tosaphot 85a, s.v. ולרבינא', [0, 1, slice(3, 8)], [RPT.NAMED, RPT.NUMBERED, RPT.DH]), ("Tosafot on Pesachim 85a:14:1",)],
    [crrd("Jerusalem Talmud Pesachim 1:1:3", 'en', 'Unknown book 2', [slice(0, 2), 1], [RPT.NAMED, RPT.NUMBERED]), tuple()],  # make sure title context doesn't match this
    [crrd("Jerusalem Talmud Pesachim 1:1:3", 'en', 'Tosafot Megillah 21b, s. v . כנגד', [0, 1, 2, slice(4, 9)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED, RPT.DH]), ("Tosafot on Megillah 21b:7:1",)],  # make sure title context doesn't match this
    [crrd("Jerusalem Talmud Pesachim 1:1:3", 'en', 'Sifra Behar Parašah 6(5', [0, 1, slice(2, 4), 5], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Sifra, Behar, Section 6 5",)],
    [crrd("Jerusalem Talmud Pesachim 1:1:3", 'en', 'Sifra Saw Parashah 2(9–10', [0, 1, slice(2, 8)], [RPT.NAMED, RPT.NAMED, RPT.NAMED]), ("Sifra, Tzav",)], # if raw ref gets broken into incorrect parts, make sure it handles it correctly

    # gilyon hashas
    [crrd("Gilyon HaShas on Berakhot 51b:1", 'he', '''תוספות ד"ה אין''', [0, slice(1, 3)], [RPT.NAMED, RPT.DH]), ("Tosafot on Berakhot 51b:8:1",)],  # commentator with implied book and daf from context commentator
    [crrd("Gilyon HaShas on Berakhot 21a:3", 'he', '''קדושין טו ע"ב תוס' ד"ה א"ק''', [0, slice(1, 3), slice(3, 5), slice(5, 7)], [RPT.NAMED, RPT.NUMBERED, RPT.NAMED, RPT.DH]), ("Tosafot on Kiddushin 15b:3:1", "Tosafot on Kiddushin 15b:4:1",)],  # abbrev in DH. ambiguous.
    [crrd("Gilyon HaShas on Berakhot 21a:3", 'he', '''בב"מ פח ע"ב''', [0, slice(1, 3)], [RPT.NAMED, RPT.NUMBERED]), ("Bava Metzia 88b",)],  # TODO should this match Gilyon HaShas as well?
    [crrd("Gilyon HaShas on Berakhot 48b:1", 'he', '''תשב"ץ ח"ב (ענין קסא''', [0, 1, slice(3, 5)], [RPT.NAMED, RPT.NUMBERED, RPT.NUMBERED]), ("Sefer HaTashbetz, Part II 161",)],  # complex text

    # specific books
    [crrd(None, 'he', 'טור אורח חיים סימן א', [0, slice(1, 3), slice(3, 5)], [RPT.NAMED, RPT.NAMED, RPT.NUMBERED]), ("Tur, Orach Chaim 1", )],
])
def test_resolve_raw_ref(resolver_data, expected_trefs):
    ref_resolver = library.get_ref_resolver()
    ref_resolver.reset_ibid_history()  # reset from previous test runs
    raw_ref, context_ref, lang, prev_matches_trefs = resolver_data
    if prev_matches_trefs:
        for prev_tref in prev_matches_trefs:
            if prev_tref is None:
                ref_resolver.reset_ibid_history()
            else:
                ref_resolver._ibid_history.last_match = Ref(prev_tref)
    print('Input:', raw_ref.text)
    matches = ref_resolver.resolve_raw_ref(lang, context_ref, raw_ref)
    matched_orefs = sorted(reduce(lambda a, b: a + b, [[match.ref] if not match.is_ambiguous else [inner_match.ref for inner_match in match.resolved_raw_refs] for match in matches], []), key=lambda x: x.normal())
    if len(expected_trefs) != len(matched_orefs):
        print(f"Found {len(matched_orefs)} refs instead of {len(expected_trefs)}")
        for matched_oref in matched_orefs:
            print("-", matched_oref.normal())
    assert len(expected_trefs) == len(matched_orefs)
    for expected_tref, matched_oref in zip(sorted(expected_trefs, key=lambda x: x), matched_orefs):
        assert matched_oref == Ref(expected_tref)


@pytest.mark.parametrize(('context_tref', 'input_str', 'lang', 'expected_trefs'), [
    [None, """גמ' שמזונותן עליך. עיין ביצה דף טו ע"ב רש"י ד"ה שמא יפשע:""", 'he', ("Rashi on Beitzah 15b:8:1",)],
    [None, """שם אלא ביתך ל"ל. ע' מנחות מד ע"א תד"ה טלית:""", 'he', ("Tosafot on Menachot 44a:12:1",)],
    [None, """גמ' במה מחנכין. עי' מנחות דף עח ע"א תוס' ד"ה אחת:""", 'he',("Tosafot on Menachot 78a:10:1",)],
    [None, """cf. Ex. 9:6,5""", 'en', ("Exodus 9:6", "Exodus 9:5")],
    ["Gilyon HaShas on Berakhot 25b:1", 'רש"י תמורה כח ע"ב ד"ה נעבד שהוא מותר. זה רש"י מאוד יפה.', 'he', ("Rashi on Temurah 28b:4:2",)],
])
def test_full_pipeline_ref_resolver(context_tref, input_str, lang, expected_trefs):
    ref_resolver = library.get_ref_resolver()
    context_oref = context_tref and Ref(context_tref)
    resolved = ref_resolver.bulk_resolve_refs(lang, [context_oref], [input_str])[0]
    assert len(resolved) == len(expected_trefs)
    resolved_orefs = sorted([match.ref for match in resolved], key=lambda x: x.normal())
    for expected_tref, matched_oref in zip(sorted(expected_trefs, key=lambda x: x), resolved_orefs):
        assert matched_oref == Ref(expected_tref)
    for match in resolved:
        assert input_str[slice(*match.raw_ref.char_indices)] == match.raw_ref.text


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


@pytest.mark.parametrize(('context_tref', 'match_title', 'common_title', 'expected_sec_cons'), [
    ['Gilyon HaShas on Berakhot 12b:1', 'Tosafot on Berakhot', 'Berakhot', (('Talmud', 'Daf', 24),)],
    ['Berakhot 2a:1', 'Berakhot', 'Berakhot', (('Talmud', 'Daf', 3),)]  # skip "Line" address which isn't referenceable
])
def test_get_section_contexts(context_tref, match_title, common_title, expected_sec_cons):
    context_ref = Ref(context_tref)
    match_index = library.get_index(match_title)
    common_index = library.get_index(common_title)
    section_contexts = RefResolver._get_section_contexts(context_ref, match_index, common_index)
    if len(section_contexts) != len(expected_sec_cons):
        print(f"Found {len(section_contexts)} sec cons instead of {len(expected_sec_cons)}")
        for sec_con in section_contexts:
            print("-", sec_con)
    assert len(section_contexts) == len(expected_sec_cons)
    for i, (addr_str, sec_name, address) in enumerate(expected_sec_cons):
        assert section_contexts[i] == SectionContext(schema.AddressType.to_class_by_address_type(addr_str), sec_name, address)


def test_address_matches_section_context():
    r = Ref("Berakhot")
    sec_con = SectionContext(schema.AddressType.to_class_by_address_type('Talmud'), 'Daf', 34)
    assert r.index_node.address_matches_section_context(0, sec_con)


@pytest.mark.parametrize(('last_n_to_store', 'trefs', 'expected_title_len'), [
    [1, ('Job 1', 'Job 2', 'Job 3'), (1, 1, 1)],
    [1, ('Job 1', 'Genesis 2', 'Exodus 3'), (1, 1, 1)],
    [2, ('Job 1', 'Genesis 2', 'Exodus 3'), (1, 2, 2)],

])
def test_ibid_history(last_n_to_store, trefs, expected_title_len):
    ibid = IbidHistory(last_n_to_store)
    orefs = [Ref(tref) for tref in trefs]
    for i, (oref, title_len) in enumerate(zip(orefs, expected_title_len)):
        ibid.last_match = oref
        end = i-len(orefs)+1
        start = end-title_len
        end = None if end == 0 else end
        curr_refs = orefs[start:end]
        assert ibid._last_titles == [r.index.title for r in curr_refs]
        assert len(ibid._title_ref_map) == title_len
        for curr_ref in curr_refs:
            assert ibid._title_ref_map[curr_ref.index.title] == curr_ref
