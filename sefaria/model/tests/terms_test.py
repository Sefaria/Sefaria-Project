# -*- coding: utf-8 -*-

import pytest
from sefaria.model import *
from sefaria.system.exceptions import InputError, DuplicateRecordError


class Test_Terms_Validation(object):
    @classmethod
    def setup_class(cls):
        TermSet({"scheme": "testing_terms"}).delete()

    @classmethod
    def teardown_class(cls):
        TermSet({"scheme": "testing_terms"}).delete()

    def test_existing_term(self):
        Term().load({"name": 'Bereshit'}).title_group.validate()
        Term().load({"name": 'Rashi'}).title_group.validate()
        Term().load({"name": 'Torah'}).title_group.validate()
        Term().load({"name": 'Verse'}).title_group.validate()

    def test_add_duplicate_primary(self):
        with pytest.raises(InputError):
            term = Term({
                "name": "Test Dup Primary",
                "scheme": "testing_terms",
                "titles": [
                    {
                        "lang": "en",
                        "text": "Test Dup Primary",
                        "primary": True
                    },
                    {
                        "lang": "he",
                        "text": "ראשי כפול",
                        "primary": True
                    },
                    {
                        "lang": "en",
                        "text": "Test Dup Primary",
                    },
                    {
                        "lang": "he",
                        "text": "ראשי כפול",
                    }
                ]
            })
            term.save()

    def test_add_new_term(self):
        term = Term({
            "name"   : "Test One",
            "scheme" : "testing_terms",
            "titles" : [
                {
                    "lang": "en",
                    "text": "Test One",
                    "primary": True
                },
                {
                    "lang": "he",
                    "text": "גלדכחשדף",
                    "primary": True
                }
            ]
        })
        term.save()

        Term({
            "name": "Test Two",
            "scheme": "testing_terms",
            "titles": [
                {
                    "lang": "en",
                    "text": "Test Two",
                    "primary": True,
                    "presentation" : "alone"
                },
                {
                    "lang": "he",
                    "text": "גלדכחשדף ב",
                    "primary": True,
                    "presentation": "alone"
                }
            ]
        }).save()

    def test_duplicate_terms(self):
        with pytest.raises(DuplicateRecordError):
            Term({
                "scheme": "commentary_works",
                "titles": [
                    {
                        "lang": "en",
                        "text": "Ramban",
                        "primary": True
                    },
                    {
                        "lang": "he",
                        "text": "רמב\"ן",
                        "primary": True
                    },
                ],
                "name": "Ramban"
            }).save()


    def test_valid_duplicate_title(self):
        Term({
            "scheme": "commentary_works",
            "titles": [
                {
                    "lang": "en",
                    "text": "New Ramban",
                    "primary": True
                },
                {
                    "lang": "en",
                    "text": "Ramban",
                },
                {
                    "lang": "he",
                    "text": "רמב\"ן חדש",
                    "primary": True
                },
            ],
            "name": "New Ramban"
        }).save()

    def test_add_invalid_terms(self):
        with pytest.raises(InputError): # no heb title at all
            Term({
                "name": "Test Fail One",
                "scheme": "testing_terms",
                "titles": [
                    {
                        "lang": "en",
                        "text": "Test Fail One",
                        "primary": True
                    }
                ]
            }).save()

        with pytest.raises(InputError):
            Term({
                "name": "Test Fail Two", # no primaries
                "scheme": "testing_terms",
                "titles": [
                    {"lang": "en", "text": "Test Fail Two"},
                    {"lang": "he", "text": "גלדכחשדף"}
                ]
            }).save()

        with pytest.raises(InputError):
            Term({
                "name": "Test Fail-Three", # hyphen in 'en' primary
                "scheme": "testing_terms",
                "titles" : [
                    {
                        "lang": "en",
                        "text": "Test Fail-Three",
                        "primary": True
                    },
                    {
                        "lang": "he",
                        "text": "גלדכחשדף",
                        "primary": True
                    }
                ]
            }).save()

        with pytest.raises(InputError):
            Term({
                "name": "Test Fail Four", # extra attr
                "scheme": "testing_terms",
                "titles" : [
                    {
                        "lang": "en",
                        "text": "Test Fail Four",
                        "primary": True,
                        "junkattr": "great"
                    },
                    {
                        "lang": "he",
                        "text": "גלדכחשדף",
                        "primary": True
                    }
                ]
            }).save()

        # for ascii validation
        with pytest.raises(InputError):
            Term({
                "name": "Test Fail Six\u2019", # primary contains non ascii
                "scheme": "testing_terms",
                "titles" : [
                    {
                        "lang": "en",
                        "text": "Test Fail Six\u2019",
                        "primary": True
                    },
                    {
                        "lang": "he",
                        "text": "גלדכחשדף",
                        "primary": True
                    }
                ]
            }).save()

