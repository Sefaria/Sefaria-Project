# -*- coding: utf-8 -*-
"""
Run me with:
python manage.py test reader
"""
import sys

# Tells sefaria.system.database to use a test db
sys._called_from_test = True

from copy import deepcopy
from pprint import pprint
import json

from django.test import TestCase
from django.test.client import Client
from django.contrib.auth.models import User
# import selenium

import sefaria.utils.testing_utils as tutils

from sefaria.model import library, Index, IndexSet, VersionSet, LinkSet, NoteSet, HistorySet, Ref, VersionState, \
    VersionStateSet, TextChunk, Category, UserHistory, UserHistorySet
from sefaria.system.database import db
import sefaria.system.cache as scache
import random as rand

c = Client()


class SefariaTestCase(TestCase):
    def make_test_user(self):
        user = User.objects.create_user(username="test@sefaria.org", email='test@sefaria.org', password='!!!')
        user.set_password('!!!')
        user.first_name = "Test"
        user.last_name = "Testerberg"
        user.is_staff = True
        user.save()
        c.login(email="test@sefaria.org", password="!!!")

    def in_cache(self, title):
        self.assertTrue(title in library.full_title_list())
        self.assertTrue(title in json.loads(library.get_text_titles_json()))

    def not_in_cache(self, title):
        self.assertFalse(title in library._index_map)
        self.assertTrue(title not in library.full_title_list())
        self.assertTrue(title not in json.loads(library.get_text_titles_json()))
        self.assertFalse(any(key.startswith(title) for key, value in Ref._raw_cache().items()))


class PagesTest(SefariaTestCase):
    """
    Tests that an assortment of important pages can load without error.
    """

    def test_root(self):
        response = c.get('/')
        self.assertEqual(200, response.status_code)

    def test_activity(self):
        response = c.get('/activity')
        self.assertEqual(200, response.status_code)

    def test_text_history(self):
        response = c.get('/activity/Genesis_12/en/The_Holy_Scriptures:_A_New_Translation_(JPS_1917)')
        self.assertEqual(200, response.status_code)

    def test_toc(self):
        response = c.get('/texts')
        self.assertEqual(200, response.status_code)

    def test_dashboard(self):
        response = c.get('/dashboard')
        self.assertEqual(200, response.status_code)

    def test_get_text_tanakh(self):
        response = c.get('/Genesis.1')
        self.assertEqual(200, response.status_code)

    def test_get_text_talmud(self):
        response = c.get('/Shabbat.32a')
        self.assertEqual(200, response.status_code)

    def test_get_text_tanakh_commentary(self):
        response = c.get('/Rashi_on_Genesis.2.3')
        self.assertEqual(200, response.status_code)

    def test_get_text_talmud_commentary(self):
        response = c.get('/Tosafot_on_Sukkah.2a.1.1')
        self.assertEqual(200, response.status_code)

    def test_get_tanakh_toc(self):
        response = c.get('/Genesis')
        self.assertEqual(200, response.status_code)

    def test_get_talmud_toc(self):
        response = c.get('/Shabbat')
        self.assertEqual(200, response.status_code)

    def test_get_tanakh_commentary_toc(self):
        response = c.get('/Rashi_on_Genesis')
        self.assertEqual(200, response.status_code)

    def test_get_talmud_commentary_toc(self):
        response = c.get('/Tosafot_on_Sukkah')
        self.assertEqual(200, response.status_code)

    def test_get_text_unknown(self):
        response = c.get('/Gibbledeegoobledeemoop')
        self.assertEqual(404, response.status_code)

    def test_sheets_splash(self):
        response = c.get('/sheets')
        self.assertEqual(200, response.status_code)

    def test_new_sheet(self):
        response = c.get('/sheets/new?editor=1')
        self.assertEqual(200, response.status_code)

    def test_new_sheet(self):
        response = c.get('/sheets/tags')
        self.assertEqual(200, response.status_code)

    def test_profile(self):
        response = c.get('/profile/brett-lockspeiser')
        self.assertEqual(200, response.status_code)

    def test_explorer(self):
        response = c.get('/explore')
        self.assertEqual(200, response.status_code)

    def test_discussions(self):
        response = c.get('/discussions')
        self.assertEqual(200, response.status_code)

    def test_login(self):
        response = c.post('/login/', {'username': 'john', 'password': 'smith'})
        self.assertEqual(200, response.status_code)


class ApiTest(SefariaTestCase):
    """
    Test data returned from GET calls to various APIs.
    """

    def setUp(self):
        pass

    def test_api_get_text_tanakh(self):
        response = c.get('/api/texts/Genesis.1')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["text"]) > 0)
        self.assertTrue(len(data["he"]) > 0)
        self.assertTrue(len(data["commentary"]) > 0)
        self.assertEqual(data["book"], "Genesis")
        self.assertEqual(data["categories"], ["Tanakh", "Torah"])
        self.assertEqual(data["sections"], [1])
        self.assertEqual(data["toSections"], [1])

    def test_api_get_text_talmud(self):
        response = c.get('/api/texts/Shabbat.22a')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["text"]) > 0)
        self.assertTrue(len(data["he"]) > 0)
        self.assertTrue(len(data["commentary"]) > 0)
        self.assertEqual(data["book"], "Shabbat")
        self.assertEqual(data["categories"], ["Talmud", "Bavli", "Seder Moed"])
        self.assertEqual(data["sections"], ["22a"])
        self.assertEqual(data["toSections"], ["22a"])

    def test_api_get_text_tanakh_commentary(self):
        response = c.get('/api/texts/Rashi_on_Genesis.2.3')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["he"]) > 0)
        self.assertTrue(len(data["commentary"]) > 0)
        self.assertEqual(data["book"], "Rashi on Genesis")
        self.assertEqual(data["collectiveTitle"], "Rashi")
        self.assertEqual(data["categories"], ["Tanakh", "Commentary", "Rashi", "Torah"])
        self.assertEqual(data["sections"], [2, 3])
        self.assertEqual(data["toSections"], [2, 3])

    def test_api_get_text_talmud_commentary(self):
        response = c.get('/api/texts/Tosafot_on_Sukkah.2a.4.1')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["he"]) > 0)
        self.assertTrue(len(data["commentary"]) > 0)
        self.assertEqual(data["book"], "Tosafot on Sukkah")
        self.assertEqual(data["collectiveTitle"], "Tosafot")
        self.assertEqual(data["categories"], ["Talmud", "Bavli", "Commentary", "Tosafot", "Seder Moed"])
        self.assertEqual(data["sections"], ["2a", 4, 1])
        self.assertEqual(data["toSections"], ["2a", 4, 1])

    def test_api_get_text_range(self):
        response = c.get('/api/texts/Job.5.2-4')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["sections"], [5, 2])
        self.assertEqual(data["toSections"], [5, 4])

    def test_api_get_text_bad_text(self):
        response = c.get('/api/texts/Protocols_of_the_Elders_of_Zion.13.13')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"],
                         "Failed to parse sections for ref Protocols_of_the_Elders_of_Zion.13.13")  # "Unrecognized Index record: Protocols of the Elders of Zion.13.13")

    def test_api_get_text_out_of_bound(self):
        response = c.get('/api/texts/Genesis.999')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "Genesis ends at Chapter 50.")

    def test_api_get_text_too_many_hyphens(self):
        response = c.get('/api/texts/Genesis.9-4-5')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "Couldn't understand ref 'Genesis.9-4-5' (too many -'s).")

    def test_api_get_text_bad_sections(self):
        response = c.get('/api/texts/Job.6-X')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "Couldn't understand text sections: 'Job.6-X'.")

    def text_api_get_index(self):
        response = c.get('/api/index/Job')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["title"], "Job")
        self.assertEqual(data["sectionNames"], ["Chapter", "Verse"])
        self.assertEqual(data["categories"], ["Tanakh", "Writings"])

    def text_api_get_commentator_index(self):
        response = c.get('/api/index/Rashi')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "No book named 'Rashi'.")

    def text_api_get_toc(self):
        response = c.get('/api/index')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data) > 10)
        self.assertTrue(data[0]["category"] == "Tanakh")
        self.assertTrue(data[0]["contents"][0]["category"] == "Torah")
        self.assertTrue(len(data[0]["contents"][0]["contents"]) == 5)
        self.assertTrue(data[-1]["category"] == "Other")

    def text_api_get_books(self):
        response = c.get('/api/index/titles/')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["books"]) > 1000)
        test_names = ("Genesis", "Sukkah", "Ex.", "Mishlei", "Mishnah Peah")
        for name in test_names:
            self.assertTrue(name in data["books"])

    def links_api_get(self):
        response = c.get("/api/links/Exodus.1.12")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data) > 20)


class LoginTest(SefariaTestCase):
    def setUp(self):
        self.make_test_user()

    def test_logged_in(self):
        response = c.get('/')
        self.assertTrue(response.content.find("Log In") == -1)


class PostV2IndexTest(SefariaTestCase):
    def setUp(self):
        self.make_test_user()

    def tearDown(self):
        IndexSet({"title": "Complex Book"}).delete()

    def test_add_alt_struct(self):
        # Add a simple Index
        index = {
            "title": "Complex Book",
            "titleVariants": [],
            "heTitle": "Hebrew Complex Book",
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Musar"],
        }
        response = c.post("/api/index/Complex_Book", {'json': json.dumps(index)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertNotIn("error", data)

        # Get it in raw v2 form
        response = c.get("/api/v2/raw/index/Complex_Book")
        data = json.loads(response.content)
        self.assertNotIn("error", data)

        # Add some alt structs to it
        data["alt_structs"] = {
            "Special Sections": {
                "nodes": [
                    {
                        "nodeType": "ArrayMapNode",
                        "depth": 1,
                        "titles": [
                            {
                                "lang": "en",
                                "text": "Idrah Rabbah",
                                "primary": True
                            },
                            {
                                "lang": "he",
                                "text": "אידרה רבה",
                                "primary": True
                            }
                        ],
                        "addressTypes": [
                            "Integer"
                        ],
                        "sectionNames": [
                            "Paragraph"
                        ],
                        "wholeRef": "Complex Book 3:4-7:1",
                        "refs": [
                            "Complex Book 3:4-4:1",
                            "Complex Book 4:2-6:3",
                            "Complex Book 6:4-7:1"
                        ]
                    }
                ]
            }
        }
        # Save
        response = c.post("/api/v2/raw/index/Complex_Book", {'json': json.dumps(data)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertNotIn("error", data)

        # Load and validate alt structs
        response = c.get("/api/v2/raw/index/Complex_Book")
        data = json.loads(response.content)
        self.assertNotIn("error", data)
        self.assertIn("alt_structs", data)
        self.assertIn("Special Sections", data["alt_structs"])


class PostIndexTest(SefariaTestCase):
    def setUp(self):
        self.make_test_user()

    def tearDown(self):
        job = Index().load({"title": "Pele Yoetz"})
        job.nodes.title_group.titles = [variant for variant in job.nodes.title_group.titles if variant["text"] != "Boj"]
        job.save()
        IndexSet({"title": "Book of Bad Index"}).delete()
        IndexSet({"title": "Reb Rabbit"}).delete()
        IndexSet({"title": "Book of Variants"}).delete()

    def test_post_index_change(self):
        """
        Tests:
            addition of title variant to existing text
            that new variant shows in index/titles/cache
            removal of new variant
            that it is removed from index/titles/cache
        """
        # Post a new Title Variant to an existing Index
        orig = json.loads(c.get("/api/index/Pele_Yoetz").content)
        self.assertTrue("Boj" not in orig["titleVariants"])
        new = deepcopy(orig)
        new["titleVariants"].append("Boj")
        response = c.post("/api/index/Pele_Yoetz", {'json': json.dumps(new)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertNotIn("error", data)
        self.in_cache("Boj")
        response = c.get("/api/index/titles")
        data = json.loads(response.content)
        self.assertIn("books", data)
        self.assertTrue("Boj" in data["books"])
        # Reset this change
        c.post("/api/index/Pele_Yoetz", {'json': json.dumps(orig)})
        response = c.get("/api/index/titles")
        data = json.loads(response.content)
        self.assertTrue("Boj" not in data["books"])
        self.not_in_cache("Boj")

    def test_post_index_fields_missing(self):
        """
        Tests:
            Posting new index with required fields missing
        """
        index = {
            "title": "Book of Bad Index",
            "titleVariants": ["Book of Bad Index"],
            "sectionNames": ["Chapter", "Paragraph"],
        }
        response = c.post("/api/index/Book_of_Bad_Index", {'json': json.dumps(index)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertIn("error", data)

        index = {
            "title": "Book of Bad Index",
            "titleVariants": ["Book of Bad Index"],
            "categories": ["Musar"]
        }
        response = c.post("/api/index/Book_of_Bad_Index", {'json': json.dumps(index)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertIn("error", data)

    '''
    Needs rewrite

    def test_primary_title_added_to_variants(self):
        """
        Tests:
            Posting new index without primary title in variants,
            primary should be added to variants
        """
        # Post with Empty variants
        index = {
            "title": "Book of Variants",
            "titleVariants": [],
            "heTitle": u"Hebrew Book of Variants",
            "heTitleVariants": [],
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Musar"],
        }
        response = c.post("/api/index/Book_of_Variants", {'json': json.dumps(index)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertNotIn("error", data)
        self.assertIn("titleVariants", data)
        self.assertIn("Book of Variants", data["titleVariants"])

        # Post with variants field missing
        index = {
            "title": "Book of Variants",
            "heTitle": "Hebrew Book of Variants",
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Musar"],
        }
        response = c.post("/api/index/Book_of_Variants", {'json': json.dumps(index)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertNotIn("error", data)
        self.assertIn("titleVariants", data)
        self.assertIn("Book of Variants", data["titleVariants"])

        # Post with non empty variants, missing title from variants
        index = {
            "title": "Book of Variants",
            "titleVariants": ["BOV"],
            "heTitle": u"Hebrew Book of Variants",
            "heTitleVariants": [],
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Musar"],
        }
        response = c.post("/api/index/Book_of_Variants", {'json': json.dumps(index)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertNotIn("error", data)
        self.assertIn("titleVariants", data)
        self.assertIn("Book of Variants", data["titleVariants"])

        # Post Commentary index with empty variants
        index = {
            "title": "Reb Rabbit",
            "heTitle": u"Hebrew Reb Rabbit",
            "titleVariants": [],
            "categories": ["Commentary"],
        }
        response = c.post("/api/index/Reb_Rabbit", {'json': json.dumps(index)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertNotIn("error", data)
        self.assertIn("titleVariants", data)
        self.assertIn("Reb Rabbit", data["titleVariants"])
    '''


class PostTextNameChange(SefariaTestCase):
    """
    Tests:
        Post/Delete of Note
        Post/Delete of Link
        Index title change casacade to:
            Books list updated
            TOC updated
            Versions updated
            Notes updated
            Links updated
            History updated
            Cache updated
    """

    def setUp(self):
        self.make_test_user()

    def tearDown(self):
        IndexSet({"title": {"$in": ["Name Change Test", "Name Changed"]}}).delete()
        NoteSet({"ref": {"$regex": "^Name Change Test"}}).delete()
        NoteSet({"ref": {"$regex": "^Name Changed"}}).delete()
        HistorySet({"rev_type": "add index", "title": "Name Change Test"}).delete()
        HistorySet({"version": "The Name Change Test Edition", "rev_type": "add text"}).delete()
        HistorySet({"new.refs": {"$regex": "Name Change Test"}, "rev_type": "add link"}).delete()
        HistorySet({"new.ref": {"$regex": "Name Change Test"}, "rev_type": "add note"}).delete()
        HistorySet({"rev_type": "add index", "title": "Name Changed"}).delete()
        HistorySet({"ref": {"$regex": "Name Changed"}, "rev_type": "add text"}).delete()
        HistorySet({"new.ref": {"$regex": "Name Changed"}, "rev_type": "add note"}).delete()
        HistorySet({"new.refs": {"$regex": "Name Changed"}, "rev_type": "add link"}).delete()
        HistorySet({"old.ref": {"$regex": "Name Changed"}, "rev_type": "delete note"}).delete()
        HistorySet({"old.refs": {"$regex": "Name Changed"}, "rev_type": "delete link"}).delete()

    def test_change_index_name(self):
        # Set up an index and text to test
        index = {
            "title": "Name Change Test",
            "titleVariants": ["The Book of Name Change Test"],
            "heTitle": 'Hebrew Name Change Test',
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Musar"],
        }
        response = c.post("/api/index/Name_Change_Test", {'json': json.dumps(index)})
        self.assertEqual(200, response.status_code)
        self.assertEqual(1, HistorySet({"rev_type": "add index", "title": "Name Change Test"}).count())
        self.in_cache("Name Change Test")

        # Post some text, including one citation
        text = {
            "text": "Blah blah blah Genesis 5:12 blah",
            "versionTitle": "The Name Change Test Edition",
            "versionSource": "www.sefaria.org",
            "language": "en",
        }
        response = c.post("/api/texts/Name_Change_Test.1.1", {'json': json.dumps(text)})
        self.assertEqual(200, response.status_code)
        self.assertEqual(1, LinkSet({"refs": {"$regex": "^Name Change Test"}}).count())
        self.assertEqual(1, HistorySet({"version": "The Name Change Test Edition", "rev_type": "add text"}).count())
        self.assertEqual(1, HistorySet({"new.refs": {"$regex": "Name Change Test"}, "rev_type": "add link"}).count())

        # Test posting notes and links
        note1 = {
            'title': 'test title 1',
            'text': 'test body 1',
            'type': 'note',
            'ref': 'Name Change Test 1.1',
            'public': False
        }
        note2 = {
            'title': 'test title 2',
            'text': 'test body 2',
            'type': 'note',
            'ref': 'Name Change Test 1.1',
            'public': True
        }
        link1 = {
            'refs': ['Name Change Test 1.1', 'Genesis 1:5'],
            'type': 'reference'
        }
        link2 = {
            'refs': ['Name Change Test 1.1', 'Rashi on Genesis 1:5'],
            'type': 'reference'
        }

        # Post notes and refs and record ids of records
        for o in [note1, note2, link1, link2]:
            url = "/api/notes/" if o['type'] == 'note' else "/api/links/"
            response = c.post(url, {'json': json.dumps(o)})
            self.assertEqual(200, response.status_code)
            data = json.loads(response.content)
            self.assertIn("_id", data)
            o["id"] = data["_id"]

        # test history
        self.assertEqual(1, HistorySet(
            {"new.ref": {"$regex": "Name Change Test"}, "rev_type": "add note"}).count())  # only one is public
        self.assertEqual(3, HistorySet({"new.refs": {"$regex": "Name Change Test"}, "rev_type": "add link"}).count())

        # Change name of index record
        orig = json.loads(c.get("/api/index/Name_Change_Test").content)
        new = deepcopy(orig)
        new["oldTitle"] = orig["title"]
        new["title"] = "Name Changed"
        new["titleVariants"].remove("Name Change Test")
        response = c.post("/api/index/Name_Changed", {'json': json.dumps(new)})
        self.assertEqual(200, response.status_code)

        # Check for change on index record
        response = c.get("/api/index/Name_Changed")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue("Name Changed" == data["title"])
        self.assertIn("Name Changed", data["titleVariants"])
        self.assertTrue("Name Change Test" not in data["titleVariants"])

        # In History
        self.assertEqual(0, HistorySet({"rev_type": "add index", "title": "Name Change Test"}).count())
        self.assertEqual(0, HistorySet({"ref": {"$regex": "Name Change Test"}, "rev_type": "add text"}).count())
        self.assertEqual(0, HistorySet({"new.ref": {"$regex": "Name Change Test"}, "rev_type": "add note"}).count())
        self.assertEqual(0, HistorySet({"new.refs": {"$regex": "Name Change Test"}, "rev_type": "add link"}).count())

        self.assertEqual(1, HistorySet({"rev_type": "add index", "title": "Name Changed"}).count())
        self.assertEqual(1, HistorySet({"ref": {"$regex": "Name Changed"}, "rev_type": "add text"}).count())
        self.assertEqual(1, HistorySet({"new.ref": {"$regex": "Name Changed"}, "rev_type": "add note"}).count())
        self.assertEqual(3, HistorySet({"new.refs": {"$regex": "Name Changed"}, "rev_type": "add link"}).count())

        # In cache
        self.not_in_cache("Name Change Test")
        self.in_cache("Name Changed")

        # And in the titles api
        response = c.get("/api/index/titles")
        data = json.loads(response.content)
        self.assertTrue("Name Changed" in data["books"])
        self.assertTrue("Name Change Test" not in data["books"])

        # toc changed
        toc = json.loads(c.get("/api/index").content)
        tutils.verify_title_existence_in_toc(new["title"], expected_toc_location=orig['categories'])

        self.assertEqual(2, NoteSet({"ref": {"$regex": "^Name Changed"}}).count())
        self.assertEqual(3, LinkSet({"refs": {"$regex": "^Name Changed"}}).count())

        # Now delete a link and a note
        response = c.delete("/api/links/" + link1["id"])
        self.assertEqual(200, response.status_code)
        response = c.delete("/api/notes/" + note2["id"])
        self.assertEqual(200, response.status_code)

        # Make sure two are now deleted
        self.assertEqual(1, NoteSet({"ref": {"$regex": "^Name Changed"}}).count())
        self.assertEqual(2, LinkSet({"refs": {"$regex": "^Name Changed"}}).count())

        # and that deletes show up in history
        self.assertEqual(1, HistorySet({"old.ref": {"$regex": "Name Changed"}, "rev_type": "delete note"}).count())
        self.assertEqual(1, HistorySet({"old.refs": {"$regex": "Name Changed"}, "rev_type": "delete link"}).count())

        # Delete Test Index
        IndexSet({"title": 'Name Changed'}).delete()

        # Make sure that index was deleted, and that delete cascaded to: versions, counts, links, cache
        self.not_in_cache("Name Changed")
        self.assertEqual(0, IndexSet({"title": 'Name Changed'}).count())
        self.assertEqual(0, VersionSet({"title": 'Name Changed'}).count())
        self.assertEqual(0, VersionStateSet({"title": 'Name Changed'}).count())
        self.assertEqual(0, LinkSet({"refs": {"$regex": "^Name Changed"}}).count())
        self.assertEqual(0, NoteSet({"ref": {"$regex": "^Name Changed"}}).count())


"""class PostCommentatorNameChange(SefariaTestCase):
    def setUp(self):
        self.make_test_user()

    def tearDown(self):
        IndexSet({"title": "Ploni"}).delete()
        IndexSet({"title": "Shmoni"}).delete()
        HistorySet({"title": "Ploni"}).delete()
        HistorySet({"title": "Shmoni"}).delete()
        HistorySet({"version": "Ploni Edition"}).delete()
        HistorySet({"new.refs": {"$regex": "^Ploni on Job"}}).delete()
        HistorySet({"new.refs": {"$regex": "^Shmoni on Job"}}).delete()
        VersionStateSet({"title": "Ploni on Job"}).delete()
        VersionStateSet({"title":"Shmoni on Job"}).delete()

    def test_change_commentator_name(self):
        index = {
            "title": "Ploni",
            "heTitle": u"Hebrew Ploni",
            "titleVariants": ["Ploni"],
            "categories": ["Commentary"]
        }
        response = c.post("/api/index/Ploni", {'json': json.dumps(index)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertNotIn("error", data)
        self.assertEqual(1, IndexSet({"title": "Ploni"}).count())
        # Bare commentator names not in Index
        # self.in_cache("Ploni")

        # Virtual Indexes are available for commentary texts
        response = c.get("/api/index/Ploni_on_Job")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertIn("categories", data)
        self.assertEqual(["Commentary", "Tanakh", "Ploni"], data["categories"])

        # Post some text
        text = {
            "text": ["Comment 1", "Comment 2", "Comment 3"],
            "versionTitle": "Ploni Edition",
            "versionSource": "www.sefaria.org",
            "language": "en",
        }
        response = c.post("/api/texts/Ploni_on_Job.2.2", {'json': json.dumps(text)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertNotIn("error", data)
        self.assertEqual(3, LinkSet({"refs": {"$regex": "^Ploni on Job"}}).count())

        # Change name of Commentator
        orig = json.loads(c.get("/api/index/Ploni").content)
        new = deepcopy(orig)
        new["oldTitle"] = orig["title"]
        new["title"] = "Shmoni"
        new["titleVariants"].remove("Ploni")
        response = c.post("/api/index/Shmoni", {'json': json.dumps(new)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertNotIn("error", data)

        # Check index records
        self.assertEqual(0, IndexSet({"title": "Ploni"}).count())
        self.assertEqual(1, IndexSet({"title": "Shmoni"}).count())

        # Check change propogated to Links
        self.assertEqual(0, VersionSet({"title": "Ploni on Job"}).count())
        self.assertEqual(1, VersionSet({"title": "Shmoni on Job"}).count())

        # Check change propogated to Links
        self.assertEqual(0, LinkSet({"refs": {"$regex": "^Ploni on Job"}}).count())
        self.assertEqual(3, LinkSet({"refs": {"$regex": "^Shmoni on Job"}}).count())

        # Check Cache Updated
        self.not_in_cache("Ploni")
        self.in_cache("Shmoni")


        #toc changed
        toc = json.loads(c.get("/api/index").content)
        tutils.verify_title_existence_in_toc(new["title"], None)
"""


class PostTextTest(SefariaTestCase):
    """
    Tests posting text content to Texts API.
    """

    def setUp(self):
        self.make_test_user()

    def tearDown(self):
        IndexSet({"title": "Sefer Test"}).delete()
        IndexSet({"title": "Ploni"}).delete()
        VersionSet({"versionTitle": "test_default_node"}).delete()

    def test_post_new_text(self):
        """
        Tests:
            post of index & that new index is in index/titles
            post and get of English text
            post and get of Hebrew text
            Verify that in-text ref is caught and made a link
            Verify that changing of in-text ref results in old link removed and new one added
            counts docs of both he and en
            index delete and its cascading
        """
        # Post a new Index
        index = {
            "title": "Sefer Test",
            "titleVariants": ["The Book of Test"],
            "heTitle": "Hebrew Sefer Test",
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Musar"],
        }
        response = c.post("/api/index/Sefer_Test", {'json': json.dumps(index)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertIn("titleVariants", data)
        self.assertIn('Sefer Test', data["titleVariants"])

        response = c.get("/api/index/titles")
        data = json.loads(response.content)
        self.assertIn('Sefer Test', data["books"])

        # test the toc is updated
        toc = json.loads(c.get("/api/index").content)
        tutils.verify_title_existence_in_toc(index['title'], expected_toc_location=index['categories'])

        # Post Text (with English citation)
        text = {
            "text": "As it is written in Job 3:14, waste places.",
            "versionTitle": "The Test Edition",
            "versionSource": "www.sefaria.org",
            "language": "en",
        }
        response = c.post("/api/texts/Sefer_Test.99.99", {'json': json.dumps(text)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue("error" not in data)
        # Verify one link was auto extracted
        response = c.get('/api/texts/Sefer_Test.99.99')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(1, len(data["commentary"]))
        # Verify Count doc was updated
        response = c.get('/api/counts/Sefer_Test')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertNotIn("error", data)
        self.assertEqual([1, 1], data["_en"]["availableCounts"])
        self.assertEqual(1, data["_en"]["availableTexts"][98][98])
        self.assertEqual(0, data["_en"]["availableTexts"][98][55])

        # Update link in the text
        text = {
            "text": "As it is written in Job 4:10, The lions may roar and growl.",
            "versionTitle": "The Test Edition",
            "versionSource": "www.sefaria.org",
            "language": "en",
        }
        response = c.post("/api/texts/Sefer_Test.99.99", {'json': json.dumps(text)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue("error" not in data)
        # Verify one link was auto extracted
        response = c.get('/api/texts/Sefer_Test.99.99')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(1, len(data["commentary"]))
        self.assertEqual(data["commentary"][0]["ref"], 'Job 4:10')

        # Post Text (with Hebrew citation)
        text = {
            "text": 'כדכתיב: "לא תעשה לך פסל כל תמונה" כו (דברים ה ח)',
            "versionTitle": "The Hebrew Test Edition",
            "versionSource": "www.sefaria.org",
            "language": "he",
        }
        response = c.post("/api/texts/Sefer_Test.88.88", {'json': json.dumps(text)})
        self.assertEqual(200, response.status_code)
        # Verify one link was auto extracted
        response = c.get('/api/texts/Sefer_Test.88.88')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(1, len(data["commentary"]))
        # Verify count doc was updated
        response = c.get('/api/counts/Sefer_Test')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual([1, 1], data["_he"]["availableCounts"])
        self.assertEqual(1, data["_he"]["availableTexts"][87][87])
        self.assertEqual(0, data["_en"]["availableTexts"][87][87])

        # Delete Test Index
        textRegex = Ref('Sefer Test').regex()
        IndexSet({"title": 'Sefer Test'}).delete()

        # Make sure that index was deleted, and that delete cascaded to: versions, counts, links, cache,
        # todo: notes?, reviews?
        self.assertEqual(0, IndexSet({"title": 'Sefer Test'}).count())
        self.assertEqual(0, VersionSet({"title": 'Sefer Test'}).count())
        self.assertEqual(0, VersionStateSet({"title": 'Sefer Test'}).count())
        # todo: better way to do this?
        self.assertEqual(0, LinkSet({"refs": {"$regex": textRegex}}).count())

    """def test_post_commentary_text(self):
        '''
        Tests:
            Posting a new commentator index
            Get a virtual index for comentator on a text
            Posting commentary text
            Commentary links auto generated
        '''
        index = {
            "title": "Ploni",
            "heTitle": "Hebrew Ploni",
            "titleVariants": ["Ploni"],
            "categories": ["Commentary"]
        }
        response = c.post("/api/index/Ploni", {'json': json.dumps(index)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertNotIn("error", data)
        self.assertEqual(1, IndexSet({"title": "Ploni"}).count())

        # Virtual Indexes are available for commentary texts
        response = c.get("/api/index/Ploni_on_Job")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertIn("categories", data)
        self.assertEqual(["Commentary", "Tanakh", "Ploni"], data["categories"])

        # Post some text
        text = {
            "text": ["Comment 1", "Comment 2", "Comment 3"],
            "versionTitle": "Ploni Edition",
            "versionSource": "www.sefaria.org",
            "language": "en",
        }
        response = c.post("/api/texts/Ploni_on_Job.2.2", {'json': json.dumps(text)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertNotIn("error", data)
        self.assertEqual(3, LinkSet({"refs": {"$regex": "^Ploni on Job"}}).count())
    """

    def test_post_to_default_node(self):
        text = {
            "text": [["BFoo", "PBar", "Dub Blitz"], ["GGGlam", "BBBlam", "Ber Flam"]],
            "versionTitle": "test_default_node",
            "versionSource": "www.sefaria.org",
            "language": "en",
        }
        response = c.post("/api/texts/Chofetz_Chaim,_Part_One,_The_Prohibition_Against_Lashon_Hara,_Principle_1",
                          {'json': json.dumps(text)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue("error" not in data)
        subref = Ref("Chofetz_Chaim,_Part_One,_The_Prohibition_Against_Lashon_Hara,_Principle_1.2.3")
        assert TextChunk(subref, "en", "test_default_node").text == "Ber Flam"


class PostCategory(SefariaTestCase):
    """
    Tests posting text content to Texts API.
    """

    def setUp(self):
        self.make_test_user()

    def tearDown(self):
        cat = Category().load({"path": ["Tanakh", "New Works"]})
        if cat:
            cat.delete()
            library.rebuild(include_toc=True)

    def test_duplicate_rejected(self):
        cat = {
            "path": [
                "Tanakh",
                "Torah"
            ],
            "titles": [
                {
                    "lang": "en",
                    "text": "Torah",
                    "primary": True
                },
                {
                    "lang": "he",
                    "text": "תורה",
                    "primary": True
                }
            ]
        }
        response = c.post("/api/category", {'json': json.dumps(cat)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue("error" in data)

    def test_orphan_rejected(self):
        cat = {
            "path": [
                "Tanakh",
                "Other Stuff",
                "New Works"
            ],
            "titles": [
                {
                    "lang": "en",
                    "text": "New Works",
                    "primary": True
                },
                {
                    "lang": "he",
                    "text": "חידושים",
                    "primary": True
                }
            ]
        }
        response = c.post("/api/category", {'json': json.dumps(cat)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue("error" in data)

    def test_incomplete_record_rejected(self):
        cat = {
            "titles": [
                {
                    "lang": "en",
                    "text": "New Works",
                    "primary": True
                },
                {
                    "lang": "he",
                    "text": "חידושים",
                    "primary": True
                }
            ]
        }
        response = c.post("/api/category", {'json': json.dumps(cat)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue("error" in data)

        cat = {
            "path": [
                "Tanakh",
                "New Works"
            ],
            "titles": [
                {
                    "lang": "en",
                    "text": "New Works",
                    "primary": True
                }
            ]
        }
        response = c.post("/api/category", {'json': json.dumps(cat)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue("error" in data)

        cat = {
            "path": [
                "Tanakh",
                "New Works"
            ],
            "titles": [
                {
                    "lang": "he",
                    "text": "חידושים",
                    "primary": True
                }
            ]
        }
        response = c.post("/api/category", {'json': json.dumps(cat)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue("error" in data)

    def test_legit_post(self):
        cat = {
            "path": [
                "Tanakh",
                "New Works"
            ],
            "titles": [
                {
                    "lang": "en",
                    "text": "New Works",
                    "primary": True
                },
                {
                    "lang": "he",
                    "text": "חידושים",
                    "primary": True
                }
            ]
        }
        response = c.post("/api/category", {'json': json.dumps(cat)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue("error" not in data)
        self.assertTrue(Category().load({"path": ["Tanakh", "New Works"]}))


class PostLinks(SefariaTestCase):
    """
    Tests posting text content to Texts API.
    """

    def setUp(self):
        self.make_test_user()

    def tearDown(self):
        LinkSet({"refs": {"$regex": 'Meshekh Chokhmah'}, "anchorText": {"$exists": 1, "$ne": ""}}).delete()

    def test_post_new_links(self):
        """
        Tests:
           posts a batch of links
        """
        # Post a new Index
        bible_books = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', 'Esther',
                       'Lamentations']
        links = []
        for i in range(1, 61):
            for j in range(1, 11):
                link_obj = {
                    "type": "commentary",
                    "refs": ["Meshekh Chokhmah %d:%d" % (i, j), "%s 1:1" % rand.choice(bible_books)],
                    "anchorText": "עת לעשות לה' הפרו תורתך",
                }
                links.append(link_obj)
        self.assertEqual(600, len(links))
        response = c.post("/api/links/", {'json': json.dumps(links)})
        print(response.status_code)
        self.assertEqual(200, response.status_code)
        self.assertNotEqual(600, LinkSet({"refs": {"$regex": 'Meshekh Chokhmah'}}).count())
        # Delete links
        LinkSet({"refs": {"$regex": 'Meshekh Chokhmah'}, "anchorText": {"$exists": 1, "$ne": ""}}).delete()


class SheetPostTest(SefariaTestCase):
    """
    Tests posting a Source Sheet.
    """
    _sheet_id = None

    def setUp(self):
        self.make_test_user()

    def tearDown(self):
        if self._sheet_id:
            db.sheets.remove({"id": self._sheet_id})
            db.history.remove({"sheet": self._sheet_id})

    def test_post_sheet(self):
        """
        Tests:
            Posting a new source sheet
            Add a source via add_source_to_sheet API
            Publish Sheet, history recorded
            Unpublish Sheet, history deleted
            Deleting a source sheet
        """
        sheet = {
            "title": "Test Sheet",
            "sources": [],
            "options": {},
            "status": "unlisted"
        }
        response = c.post("/api/sheets", {'json': json.dumps(sheet)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertIn("id", data)
        self.assertIn("dateCreated", data)
        self.assertIn("dateModified", data)
        self.assertIn("views", data)
        self.assertEqual(1, data["owner"])
        sheet_id = data["id"]
        self._sheet_id = sheet_id
        sheet = data
        sheet["lastModified"] = sheet["dateModified"]

        # Add a source via add source API
        response = c.post("/api/sheets/{}/add_ref".format(sheet_id), {"ref": "Mishnah Peah 1:1"})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue("error" not in data)
        response = c.get("/api/sheets/{}".format(sheet_id))
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual("Mishnah Peah 1:1", data["sources"][0]["ref"])

        # Publish Sheet
        sheet["status"] = "public"
        sheet["lastModified"] = data["dateModified"]
        response = c.post("/api/sheets", {'json': json.dumps(sheet)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertIn("datePublished", data)
        self.assertEqual("public", data["status"])
        log = next(db.history.find().sort([["_id", -1]]).limit(1))
        self.assertEqual(1, log["user"])
        self.assertEqual(sheet_id, log["sheet"])
        self.assertEqual("publish sheet", log["rev_type"])

        # Unpublish Sheet
        sheet["status"] = "unlisted"
        sheet["lastModified"] = data["dateModified"]
        response = c.post("/api/sheets", {'json': json.dumps(sheet)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual("unlisted", data["status"])
        log = db.history.find_one({"rev_type": "publish sheet", "sheet": sheet_id})
        self.assertEqual(None, log)

        # Delete the Sheet
        response = c.post("/api/sheets/{}/delete".format(sheet_id), {})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue("error" not in data)
        self.assertEqual(0, db.sheets.find({"id": sheet_id}).count())


class UserSyncTest(SefariaTestCase):
    """
    Test syncing user's settings and history
    """

    def setUp(self):
        self.make_test_user()

    def tearDown(self):
        uhs = UserHistorySet()
        uhs.delete()

    @staticmethod
    def d(x):
        return json.dumps(x)

    @staticmethod
    def l(x):
        return json.loads(x)

    def test_simple_sync(s):
        response = c.post("/api/profile/sync", {
            'last_sync': s.d(0),
            'user_history': s.d([
                {
                    "ref": "Genesis 1:1",
                    "time_stamp": 1,
                    "server_time_stamp": 1,
                    "versions": {}
                }
            ])
        })
        data = s.l(response.content)
        s.assertEqual(len(data["user_history"]), 0)

        response = c.post("/api/profile/sync", {
            'last_sync': s.d(0),
            'user_history': s.d([
                {
                    "ref": "Genesis 1:2",
                    "time_stamp": 2,
                    "server_time_stamp": 2,
                    "versions": {}
                }
            ])
        })
        data = s.l(response.content)
        s.assertEqual(len(data["user_history"]), 1)
        s.assertEqual(data["user_history"][0]["ref"], "Genesis 1:1")

    def test_save_delete(s):
        hist1 = {
            "ref": "Genesis 1:1",
            "time_stamp": 0,
            "server_time_stamp": 0,
            "versions": {}
        }
        hist1save = hist1.copy()
        hist1save['action'] = 'add_saved'
        hist1delete = hist1.copy()
        hist1delete['action'] = 'delete_saved'
        hist1delete['server_time_stamp'] = 1
        hist2 = hist1.copy()
        hist2['ref'] = "Genesis 1:2"

        response = c.post("/api/profile/sync", {
            'last_sync': s.d(0),
            'user_history': s.d([
                hist1
            ])
        })
        response = c.post("/api/profile/sync", {
            'last_sync': s.d(0),
            'user_history': s.d([
                hist1save
            ])
        })
        response = c.get("/api/profile/user_history?saved=1")
        data = s.l(response.content)
        s.assertEqual(len(data), 1)
        s.assertEqual(data[0]['ref'], "Genesis 1:1")

        response = c.post("/api/profile/sync", {
            'last_sync': s.d(0),
            'user_history': s.d([
                hist1delete
            ])
        })
        response = c.get("/api/profile/user_history?saved=1")
        data = s.l(response.content)
        s.assertEqual(len(data), 0)

        # check that another device will pick up a modification of a saved item

        response = c.post("/api/profile/sync", {
            'last_sync': s.d(0),
        })
        data = s.l(response.content)
        s.assertEqual(data["user_history"][0]["ref"], "Genesis 1:1")
        s.assertFalse(data["user_history"][0]["saved"])

    def test_settings(self):
        pass


'''
# Fails. Ignore
class VersionAttrsPostTest(SefariaTestCase):
    def test_post_atts(self):
        vattrs = {
            "status" : "locked",
            "license" : "Public domain",
            "digitizedBySefaria" : True,
            "priority" : 1
        }
        response = c.post("api/version/flags/Genesis/he/Tanach+With+Nikkud", {'json': json.dumps(vattrs)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
'''
