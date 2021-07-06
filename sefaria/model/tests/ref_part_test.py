import pytest
from sefaria.model.text import Ref, library
from sefaria.model.ref_part import *
from sefaria.model.abstract import AbstractMongoRecord
from sefaria.model.ref_part import RefPartType
from spacy.lang.he import Hebrew


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


@pytest.fixture(scope="module")
def resolver_data():
    ref_resolver = RefResolver('he')
    nlp = Hebrew()
    doc = nlp("בבלי ברכות דף ב")
    span = doc[0:]
    raw_ref = RawRef([
        RawRefPart("input", RefPartType.NAMED, span[0]),
        RawRefPart("input", RefPartType.NAMED, span[1]),
        RawRefPart("input", RefPartType.NUMBERED, span[2:4]),
    ], span)
    context_ref = Ref("Rashi on Berakhot 2a")

    yield ref_resolver, raw_ref, context_ref


def test_duplicate_terms(duplicate_terms):
    t, s, initial_slug = duplicate_terms
    assert t.slug == AbstractMongoRecord.normalize_slug(initial_slug)
    assert s.slug == AbstractMongoRecord.normalize_slug(initial_slug) + "1"


def test_resolver(resolver_data):
    ref_resolver, raw_ref, context_ref = resolver_data
    matches = ref_resolver.get_unrefined_ref_part_matches(context_ref, raw_ref)
    assert len(matches) == 1

    refined_matches = ref_resolver.refine_ref_part_matches(matches, raw_ref)
    assert len(refined_matches) == 1
    assert refined_matches[0].ref == Ref("Berakhot 2a")