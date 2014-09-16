# -*- coding: utf-8 -*-
"""
Run me with:
python manage.py test reader
"""
from copy import deepcopy
from pprint import pprint
import json

from django.test import TestCase
from django.test.client import Client
from django.contrib.auth.models import User
#import selenium

from sefaria.model import IndexSet, VersionSet, CountSet, LinkSet, NoteSet, Ref
import sefaria.texts as texts

c = Client()


class PagesTest(TestCase):
    def setUp(self):
        pass

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

    def test_get_talmud_commentary(self):
        response = c.get('/Tosafot_on_Sukkah.2a.1.1')
        self.assertEqual(200, response.status_code)

    def test_sheets_splash(self):
        response = c.get('/sheets')
        self.assertEqual(200, response.status_code)

    def test_new_sheet(self):
        response = c.get('/sheets/new')
        self.assertEqual(200, response.status_code)

    def test_profile(self):
        response = c.get('/profile/brett-lockspeiser')
        self.assertEqual(200, response.status_code)

    def test_campaign(self):
        response = c.get('/translate/Midrash')
        self.assertEqual(200, response.status_code)

    def test_explorer(self):
        response = c.get('/explore')
        self.assertEqual(200, response.status_code)

    def test_login(self):
        response = c.post('/login/', {'username': 'john', 'password': 'smith'})
        self.assertEqual(200, response.status_code)


class ApiTest(TestCase):
    def setUp(self):
        pass

    def test_api_get_text_tanakh(self):
        response = c.get('/api/texts/Genesis.1')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["text"]) > 0)
        self.assertTrue(len(data["he"]) > 0)
        self.assertTrue(len(data["commentary"]) > 0)
        self.assertEqual(data["book"],       "Genesis")
        self.assertEqual(data["categories"], ["Tanach", "Torah"])
        self.assertEqual(data["sections"],   [1])
        self.assertEqual(data["toSections"], [1])

    def test_api_get_text_talmud(self):
        response = c.get('/api/texts/Shabbat.22a')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["text"]) > 0)
        self.assertTrue(len(data["he"]) > 0)
        self.assertTrue(len(data["commentary"]) > 0)
        self.assertEqual(data["book"],       "Shabbat")
        self.assertEqual(data["categories"], ["Talmud", "Bavli", "Seder Moed"])
        self.assertEqual(data["sections"],   ["22a"])
        self.assertEqual(data["toSections"], ["22a"])

    def test_api_get_text_tanakh_commentary(self):
        response = c.get('/api/texts/Rashi_on_Genesis.2.3')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["he"]) > 0)
        self.assertTrue(len(data["commentary"]) > 0)
        self.assertEqual(data["book"],        "Rashi on Genesis")
        self.assertEqual(data["commentator"], "Rashi")
        self.assertEqual(data["categories"],  ["Commentary", "Tanach", "Torah", "Genesis"])
        self.assertEqual(data["sections"],    [2,3])
        self.assertEqual(data["toSections"],  [2,3])

    def test_api_get_text_talmud_commentary(self):
        response = c.get('/api/texts/Tosafot_on_Sukkah.2a.1.1')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(len(data["he"]) > 0)
        self.assertTrue(len(data["commentary"]) > 0)
        self.assertEqual(data["book"],        "Tosafot on Sukkah")
        self.assertEqual(data["commentator"], "Tosafot")
        self.assertEqual(data["categories"],  ["Commentary", "Talmud", "Bavli", "Seder Moed", "Sukkah"])
        self.assertEqual(data["sections"],    ["2a", 1, 1])
        self.assertEqual(data["toSections"],  ["2a", 1, 1])

    def test_api_get_text_range(self):
        response = c.get('/api/texts/Job.5:2-4')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["sections"],   [5, 2])
        self.assertEqual(data["toSections"], [5, 4])

    def test_api_get_text_bad_text(self):
        response = c.get('/api/texts/Protocols_of_the_Elders_of_Zion.13.13')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "No book named 'Protocols of the Elders of Zion'.")

    def test_api_get_text_out_of_bound(self):
        response = c.get('/api/texts/Genesis.999')
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "Genesis only has 50 Chapters.")

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
        self.assertEqual(data["title"],        "Job")
        self.assertEqual(data["sectionNames"], ["Chapter", "Verse"])
        self.assertEqual(data["categories"],   ["Tanach", "Writings"])

    def text_api_get_commentator_index(self):
        response = c.get('/api/index/Rashi')
        self.assertEqual(200, response.status_code)  
        data = json.loads(response.content)
        self.assertEqual(data["title"],      "Rashi")
        self.assertEqual(data["categories"], ["Commentary"])

    def text_api_get_toc(self):
        response = c.get('/api/index')
        self.assertEqual(200, response.status_code)  
        data = json.loads(response.content)
        self.assertTrue(len(data) > 10)
        self.assertTrue(data[0]["category"] == "Tanach")
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


class PostTest(TestCase):
    def setUp(self):
        user = User.objects.create_user(username="test@sefaria.org", email='test@sefaria.org', password='!!!')
        user.set_password('!!!')
        user.first_name = "Test"
        user.last_name  = "Testerberg"
        user.save()
        c.login(email="test@sefaria.org", password="!!!")

    def test_logged_in(self):
        response = c.get('/')
        self.assertTrue(response.content.find("accountMenuName") > -1)

    def test_post_index_change(self):
        """
        Tests:
            addition of title variant to existing text
            that new variant shows in index/titles
            removal of new variant
            that is is removed from index/titles
        """
        # Post a new Title Variant to an existing Index
        orig = json.loads(c.get("/api/index/Job").content)
        new = deepcopy(orig)
        new["titleVariants"].append("Boj")
        response = c.post("/api/index/Job", {'json': json.dumps(new)})
        self.assertEqual(200, response.status_code)
        response = c.get("/api/index/titles")
        data = json.loads(response.content)
        self.assertTrue("Boj" in data["books"])
        # Reset this change
        c.post("/api/index/Job", {'json': json.dumps(orig)})
        response = c.get("/api/index/titles")
        data = json.loads(response.content)
        self.assertTrue("Boj" not in data["books"])

    def test_post_new_text(self):
        """
        Tests:
            post of index & that new index is in index/titles
            post and get of English text
            post and get of Hebrew text
            counts docs of both he and en
            index delete and its cascading
        """
        # Post a new Index
        index = {
            "title": "Sefer Test",
            "titleVariants": ["The Book of Test"],
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Musar"],
        }
        response = c.post("/api/index/Sefer_Test", {'json': json.dumps(index)})
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(u'Sefer Test' in data["titleVariants"])

        response = c.get("/api/index/titles")
        data = json.loads(response.content)
        self.assertTrue(u'Sefer Test' in data["books"])

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
        self.assertEqual([1,1], data["availableCounts"]["en"])
        self.assertEqual(1, data["availableTexts"]["en"][98][98])
        self.assertEqual(0, data["availableTexts"]["en"][98][55])

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
        self.assertEqual([1,1], data["availableCounts"]["he"])
        self.assertEqual(1, data["availableTexts"]["he"][87][87])
        self.assertEqual(0, data["availableTexts"]["en"][87][55])

        # Delete Test Index
        textRegex = Ref('Sefer Test').regex()
        IndexSet({"title": u'Sefer Test'}).delete()

        #Make sure that index was deleted, and that delete cascaded to: versions, counts, links, cache,
        #todo: notes?, reviews?
        self.assertEqual(0, IndexSet({"title": u'Sefer Test'}).count())
        self.assertEqual(0, VersionSet({"title": u'Sefer Test'}).count())
        self.assertEqual(0, CountSet({"title": u'Sefer Test'}).count())
        #todo: better way to do this?
        self.assertEqual(0, LinkSet({"refs": {"$regex": textRegex}}).count())





    def test_change_index_name(self):
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
        #Set up an index and text to test
        index = {
            "title": "Name Change Test",
            "titleVariants": ["The Book of Name Change Test"],
            "sectionNames": ["Chapter", "Paragraph"],
            "categories": ["Musar"],
        }
        response = c.post("/api/index/Name_Change_Test", {'json': json.dumps(index)})
        self.assertEqual(200, response.status_code)

        text = {
            "text": "Blah blah blah Genesis 5:12 blah",
            "versionTitle": "The Name Change Test Edition",
            "versionSource": "www.sefaria.org",
            "language": "en",
        }
        response = c.post("/api/texts/Name_Change_Test.1.1", {'json': json.dumps(text)})
        self.assertEqual(200, response.status_code)

        note1 = {
            'title': u'test title 1',
            'text': u'test body 1',
            'type': u'note',
            'ref': u'Name Change Test 1.1',
            'public': False
        }
        note2 = {
            'title': u'test title 2',
            'text': u'test body 2',
            'type': u'note',
            'ref': u'Name Change Test 1.1',
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
            response = c.post("/api/links/", {'json': json.dumps(o)})
            self.assertEqual(200, response.status_code)
            data = json.loads(response.content)
            self.assertIn("_id", data)
            o["id"] = data["_id"]

        # Change name of index record
        orig = json.loads(c.get("/api/index/Name_Change_Test").content)
        new = deepcopy(orig)
        new["oldTitle"] = orig["title"]
        new["title"] = "Name Changed"
        response = c.post("/api/index/Name_Change_Test", {'json': json.dumps(new)})
        self.assertEqual(200, response.status_code)

        """
        # Check for change on index record
        response = c.get("api/index/Name_Changed")
        self.assertEqual(200, response.status_code)
        data = json.loads(response.content)
        self.assertTrue(u"Name Changed" == data["title"])
        self.assertTrue(u"Name Changed" in data["titleVariants"])
        self.assertTrue(u"Name Change Test" not in data["titleVariants"])

        # And in the titles api
        response = c.get("/api/index/titles")
        data = json.loads(response.content)
        self.assertTrue(u"Name Changed" in data["books"])
        self.assertTrue(u"Name Change Test" not in data["books"])

        # And in all the links and notes
        textRegex = Ref('Name Changed').regex()

        self.assertEqual(2, NoteSet({"ref": {"$regex": textRegex}}).count())
        self.assertEqual(2, LinkSet({"refs": {"$regex": textRegex}}).count())

        # Now delete a link and a note
        response = c.delete("api/links/" + link1["id"])
        self.assertEqual(200, response.status_code)
        response = c.delete("api/notes/" + note1["id"])
        self.assertEqual(200, response.status_code)

        # Make sure two are now deleted
        self.assertEqual(1, NoteSet({"ref": {"$regex": textRegex}}).count())
        self.assertEqual(1, LinkSet({"refs": {"$regex": textRegex}}).count())

        # Delete Test Index

        IndexSet({"title": u'Name Changed'}).delete()

        #Make sure that index was deleted, and that delete cascaded to: versions, counts, links, cache,
        #todo: notes?, reviews?
        self.assertEqual(0, IndexSet({"title": u'Name Changed'}).count())
        self.assertEqual(0, VersionSet({"title": u'Name Changed'}).count())
        self.assertEqual(0, CountSet({"title": u'Name Changed'}).count())
        self.assertEqual(0, NoteSet({"ref": {"$regex": textRegex}}).count())
        self.assertEqual(0, LinkSet({"refs": {"$regex": textRegex}}).count())

        """