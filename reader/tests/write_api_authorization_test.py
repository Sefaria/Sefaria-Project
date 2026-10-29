"""
Server-side authorization on write endpoints whose UI is only offered to staff or to
the record's owner: category DELETE, note edit/delete, text edit locks and the
modtools links CSV export.
"""
import json
import uuid
from unittest.mock import MagicMock, patch

from django.test import TestCase

from reader.conftest import create_test_user, purge_test_profiles
from sefaria.model import Note
from sefaria.model.lock import check_lock, release_lock
from sefaria.system.database import db


def create_staff_user(prefix):
    user = create_test_user(prefix)
    user.is_staff = True
    user.save()
    return user


class AuthUsersTestCase(TestCase):
    databases = "__all__"

    def setUp(self):
        self.owner = create_test_user("auth-owner")
        self.other = create_test_user("auth-other")
        self.staff = create_staff_user("auth-staff")
        self.api_keys = []

    def tearDown(self):
        for key in self.api_keys:
            db.apikeys.delete_one({"key": key})
        purge_test_profiles(self.owner, self.other, self.staff)

    def api_key_for(self, user):
        key = uuid.uuid4().hex
        db.apikeys.insert_one({"key": key, "uid": user.id})
        self.api_keys.append(key)
        return key


@patch("reader.views.library.rebuild")
class CategoryDeleteAuthTest(AuthUsersTestCase):
    url = "/api/category/Test Category/Empty Child"

    def setUp(self):
        super().setUp()
        self.cat = MagicMock()
        self.cat.can_delete.return_value = True
        category_cls = MagicMock()
        category_cls.return_value.load.return_value = self.cat
        patcher = patch("reader.views.Category", category_cls)
        patcher.start()
        self.addCleanup(patcher.stop)

    def assertNotDeleted(self, rebuild):
        self.cat.delete.assert_not_called()
        rebuild.assert_not_called()

    def test_anonymous_is_rejected(self, rebuild):
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, 401)
        self.assertIn("error", response.json())
        self.assertNotDeleted(rebuild)

    def test_signed_in_non_staff_is_rejected(self, rebuild):
        self.client.force_login(self.other)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, 403)
        self.assertNotDeleted(rebuild)

    def test_non_staff_api_key_is_rejected(self, rebuild):
        response = self.client.delete(self.url + "?apikey=" + self.api_key_for(self.other))
        self.assertEqual(response.status_code, 403)
        self.assertNotDeleted(rebuild)

    def test_unknown_api_key_is_rejected(self, rebuild):
        response = self.client.delete(self.url + "?apikey=not-a-real-key")
        self.assertEqual(response.status_code, 401)
        self.assertNotDeleted(rebuild)

    def test_staff_can_delete(self, rebuild):
        self.client.force_login(self.staff)
        response = self.client.delete(self.url)
        self.assertEqual(response.json(), {"status": "OK"})
        self.cat.delete.assert_called_once()
        rebuild.assert_called_once_with(include_toc=True)

    def test_staff_api_key_can_delete(self, rebuild):
        response = self.client.delete(self.url + "?apikey=" + self.api_key_for(self.staff))
        self.assertEqual(response.json(), {"status": "OK"})
        self.cat.delete.assert_called_once()


class NotesApiAuthTest(AuthUsersTestCase):
    def setUp(self):
        super().setUp()
        self.note = Note({
            "owner": self.owner.id,
            "public": False,
            "text": "original text",
            "type": "note",
            "ref": "Genesis 1:1",
        })
        self.note.save()
        self.note_id = str(self.note._id)
        self.url = f"/api/notes/{self.note_id}"

    def tearDown(self):
        db.notes.delete_many({"owner": {"$in": [self.owner.id, self.other.id, self.staff.id]}})
        super().tearDown()

    def stored_note(self):
        return db.notes.find_one({"_id": self.note._id})

    def post_edit(self, text, **extra):
        payload = {"_id": self.note_id, "text": text, "ref": "Genesis 1:1", "type": "note", "public": False}
        return self.client.post("/api/notes/", {"json": json.dumps(payload), **extra})

    # DELETE

    def test_anonymous_cannot_delete(self):
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, 401)
        self.assertIsNotNone(self.stored_note())

    def test_non_owner_cannot_delete(self):
        self.client.force_login(self.other)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, 403)
        self.assertIsNotNone(self.stored_note())

    def test_staff_non_owner_cannot_delete(self):
        self.client.force_login(self.staff)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, 403)
        self.assertIsNotNone(self.stored_note())

    def test_owner_can_delete(self):
        self.client.force_login(self.owner)
        response = self.client.delete(self.url)
        self.assertEqual(response.json(), {"response": "ok"})
        self.assertIsNone(self.stored_note())

    def test_delete_unknown_or_malformed_id_is_404(self):
        self.client.force_login(self.owner)
        self.assertEqual(self.client.delete("/api/notes/" + "0" * 24).status_code, 404)
        self.assertEqual(self.client.delete("/api/notes/not-an-id").status_code, 404)

    # POST edit

    def test_anonymous_without_key_cannot_edit(self):
        response = self.post_edit("hijacked")
        self.assertIn("error", response.json())
        self.assertEqual(self.stored_note()["text"], "original text")

    def test_non_owner_cannot_edit(self):
        self.client.force_login(self.other)
        response = self.post_edit("hijacked")
        self.assertEqual(response.status_code, 403)
        stored = self.stored_note()
        self.assertEqual(stored["text"], "original text")
        self.assertEqual(stored["owner"], self.owner.id)

    def test_non_owner_api_key_cannot_edit(self):
        response = self.post_edit("hijacked", apikey=self.api_key_for(self.other))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.stored_note()["owner"], self.owner.id)

    def test_staff_non_owner_cannot_edit(self):
        self.client.force_login(self.staff)
        response = self.post_edit("hijacked")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.stored_note()["owner"], self.owner.id)

    def test_owner_can_edit(self):
        self.client.force_login(self.owner)
        response = self.post_edit("updated text")
        self.assertEqual(response.status_code, 200)
        stored = self.stored_note()
        self.assertEqual(stored["text"], "updated text")
        self.assertEqual(stored["owner"], self.owner.id)

    def test_owner_api_key_can_edit(self):
        response = self.post_edit("updated via key", apikey=self.api_key_for(self.owner))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.stored_note()["text"], "updated via key")

    def test_edit_unknown_id_is_404(self):
        self.client.force_login(self.owner)
        payload = {"_id": "0" * 24, "text": "x", "ref": "Genesis 1:1", "type": "note", "public": False}
        response = self.client.post("/api/notes/", {"json": json.dumps(payload)})
        self.assertEqual(response.status_code, 404)

    def test_signed_in_user_can_add_new_note(self):
        self.client.force_login(self.other)
        payload = {"text": "new note", "ref": "Genesis 1:2", "type": "note", "public": False}
        response = self.client.post("/api/notes/", {"json": json.dumps(payload)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(db.notes.count_documents({"owner": self.other.id, "text": "new note"}), 1)


class LockApiAuthTest(AuthUsersTestCase):
    tref, lang, version = "Genesis 1:1", "en", "Authorization Test Version"
    set_url = "/api/locks/set/Genesis_1:1/en/Authorization_Test_Version"
    release_url = "/api/locks/release/Genesis_1:1/en/Authorization_Test_Version"

    def tearDown(self):
        release_lock(self.tref, self.lang, self.version)
        super().tearDown()

    def is_locked(self):
        return check_lock(self.tref, self.lang, self.version)

    def test_anonymous_cannot_set_lock(self):
        response = self.client.get(self.set_url)
        self.assertEqual(response.status_code, 401)
        self.assertFalse(self.is_locked())

    def test_signed_in_user_can_set_lock(self):
        self.client.force_login(self.other)
        response = self.client.get(self.set_url)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertTrue(self.is_locked())
        self.assertEqual(db.locks.find_one({"version": self.version})["user"], self.other.id)

    def test_anonymous_cannot_release_lock(self):
        self.client.force_login(self.owner)
        self.client.get(self.set_url)
        self.client.logout()
        response = self.client.get(self.release_url)
        self.assertEqual(response.status_code, 401)
        self.assertTrue(self.is_locked())

    def test_signed_in_user_can_release_lock(self):
        self.client.force_login(self.owner)
        self.client.get(self.set_url)
        response = self.client.get(self.release_url)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertFalse(self.is_locked())


@patch("sefaria.views.get_csv_links_by_refs", return_value="Genesis 1:1,Rashi on Genesis 1:1:1\n")
class ModtoolsLinksCsvAuthTest(AuthUsersTestCase):
    urls = [
        "/modtools/links/Genesis 1/Rashi on Genesis 1",
        "/modtools/index_links/Genesis 1/Rashi on Genesis 1",
    ]

    def test_anonymous_is_redirected_to_login(self, get_csv):
        for url in self.urls:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 302)
            self.assertIn("login", response.url)
        get_csv.assert_not_called()

    def test_signed_in_non_staff_is_redirected_to_login(self, get_csv):
        self.client.force_login(self.other)
        for url in self.urls:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 302)
        get_csv.assert_not_called()

    def test_staff_gets_csv(self, get_csv):
        self.client.force_login(self.staff)
        for url in self.urls:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        self.assertEqual(get_csv.call_count, 2)
        self.assertTrue(get_csv.call_args_list[1].kwargs["by_segment"])
