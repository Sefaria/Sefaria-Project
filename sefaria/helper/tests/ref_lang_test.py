"""
The ``_lang`` attribute every Ref must carry.

A Ref can be built from a data dict (``Ref(_obj=...)``), and ``RefCacheType`` hands that
instance back for a later tref lookup of the same string. Callers such as
``instantiate_ref_with_legacy_parse_fallback`` read ``_lang`` off such an instance, so a Ref
built from a data dict has to carry it too. When it did not, a partially matching ref raised
``AttributeError: 'Ref' object has no attribute '_lang'`` and ``/api/texts/<tref>`` answered
HTTP 500 instead of returning the partially matched ref.
"""

from types import SimpleNamespace

from sefaria.model.text import Ref


class TestRefLangAttribute:
    @staticmethod
    def _data_dict(**overrides):
        data = {
            "index": SimpleNamespace(title="Test Book"),
            "book": "Test Book",
            "primary_category": "Tanakh",
            "index_node": SimpleNamespace(
                full_title=lambda lang: "Test Book, Chapter",
                is_default=lambda: False,
            ),
            "sections": [],
            "toSections": [],
        }
        data.update(overrides)
        return data

    @staticmethod
    def _ref_from_data_dict(data):
        # Build without going through RefCacheType, so this needs neither the library
        # singleton nor a database and leaves the process-wide Ref cache untouched.
        oref = object.__new__(Ref)
        Ref.__init__(oref, _obj=data)
        return oref

    def test_lang_is_set_when_ref_is_built_from_data_dict(self):
        oref = self._ref_from_data_dict(self._data_dict())
        assert oref._lang == "en"

    def test_lang_supplied_in_data_dict_is_kept(self):
        oref = self._ref_from_data_dict(self._data_dict(_lang="he"))
        assert oref._lang == "he"
