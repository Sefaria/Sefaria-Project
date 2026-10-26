from django.test import SimpleTestCase, TestCase, override_settings
from django.contrib.auth import get_user_model
from unittest.mock import patch
import sys
from unittest.mock import MagicMock
from pymongo.errors import DuplicateKeyError
from .atlas import build_snapshot, catalog, request_refresh, title_ids


class AtlasSnapshotTests(SimpleTestCase):
    def setUp(self):
        self.a, self.b, self.c = [b[0] for b in catalog()['books'][:3]]
        self.ids = title_ids()
        self.n = 0

    def row(self, book, stamp, uid=7):
        self.n += 1
        return {'_id': f'id{self.n}', 'uid': uid, 'book': book, 'time_stamp': stamp}

    def test_sizes_count_baseline_rows_and_skip_unknown_books(self):
        rows = [self.row(self.a, 1)] * 3 + [self.row(self.b, 1), self.row('Not a book', 1)]
        snap = build_snapshot(rows, [], 10000)
        self.assertEqual(dict(map(tuple, snap['sizes'])), {self.ids[self.a]: 3, self.ids[self.b]: 1})

    def test_move_event_records_previous_book(self):
        now = 10000
        snap = build_snapshot([], [self.row(self.a, now - 20), self.row(self.b, now - 10)], now)
        self.assertEqual([(e['from'], e['book']) for e in snap['events']],
                         [(None, self.ids[self.a]), (self.ids[self.a], self.ids[self.b])])
        self.assertNotIn('uid', str(snap))

    def test_same_book_read_is_a_pulse_not_a_move(self):
        now = 10000
        snap = build_snapshot([], [self.row(self.a, now - 20), self.row(self.a, now - 10)], now)
        self.assertEqual([e['from'] for e in snap['events']], [None, None])

    def test_previous_book_comes_from_before_the_event_window(self):
        now = 10000
        snap = build_snapshot([], [self.row(self.a, now - 900), self.row(self.b, now - 5)], now)
        self.assertEqual(len(snap['events']), 1)
        self.assertEqual(snap['events'][0]['from'], self.ids[self.a])

    def test_readers_now_counts_each_reader_on_their_latest_book(self):
        now = 10000
        rows = [self.row(self.a, now - 100, uid=1), self.row(self.b, now - 50, uid=1),
                self.row(self.b, now - 40, uid=2), self.row(self.c, now - 3000, uid=3)]
        snap = build_snapshot([], rows, now)
        self.assertEqual(dict(map(tuple, snap['readers'])), {self.ids[self.b]: 2})
        self.assertEqual(snap['readers_now'], 2)

    def test_readers_on_different_books_do_not_create_moves(self):
        now = 10000
        snap = build_snapshot([], [self.row(self.a, now - 20, uid=1), self.row(self.b, now - 10, uid=2)], now)
        self.assertEqual([e['from'] for e in snap['events']], [None, None])


class AtlasRefreshRequestTests(SimpleTestCase):
    def celery_modules(self, app):
        config = MagicMock()
        config.CeleryQueue.TASKS.value = 'tasks'
        return {'sefaria.celery_setup.app': MagicMock(app=app), 'sefaria.celery_setup.config': config}

    def test_first_viewer_enqueues_refresh(self):
        app, db = MagicMock(), MagicMock()
        with patch.dict(sys.modules, self.celery_modules(app)):
            self.assertTrue(request_refresh(db, 1000))
        app.send_task.assert_called_once_with('inquiry.refresh_activity', queue='tasks', expires=10)

    def test_concurrent_viewer_does_not_enqueue_again(self):
        app, db = MagicMock(), MagicMock()
        db.inquiry_activity_snapshots.find_one_and_update.side_effect = DuplicateKeyError('claimed')
        with patch.dict(sys.modules, self.celery_modules(app)):
            self.assertFalse(request_refresh(db, 1000))
        app.send_task.assert_not_called()

    def test_broker_failure_does_not_raise(self):
        app, db = MagicMock(), MagicMock()
        app.send_task.side_effect = ConnectionError('broker down')
        with patch.dict(sys.modules, self.celery_modules(app)):
            self.assertFalse(request_refresh(db, 1000))


class AtlasAccessTests(TestCase):
    def test_staff_required(self):
        self.assertEqual(self.client.get('/inquiry/api/atlas/activity/').status_code, 403)

    @override_settings(INQUIRY_ATLAS_ENABLED=False)
    def test_disabled(self):
        self.assertEqual(self.client.get('/inquiry/api/atlas/activity/').status_code, 404)

    def test_waiting_and_no_cache(self):
        user = get_user_model().objects.create_user('atlas-test', is_staff=True)
        self.client.force_login(user)
        with patch('inquiry.atlas_views.database') as db:
            db.return_value.inquiry_activity_snapshots.find_one.return_value = None
            response = self.client.get('/inquiry/api/atlas/activity/')
        self.assertEqual(response.json()['status'], 'waiting')
        self.assertIn('no-store', response['Cache-Control'])

    def test_page_redirects_to_admin_login(self):
        response = self.client.get('/inquiry/atlas/')
        self.assertRedirects(response, '/admin/login/?next=/inquiry/atlas/', fetch_redirect_response=False)

    def test_nonstaff_cannot_access_page_or_api(self):
        user = get_user_model().objects.create_user('ordinary-reader')
        self.client.force_login(user)
        self.assertEqual(self.client.get('/inquiry/atlas/').status_code, 302)
        self.assertEqual(self.client.get('/inquiry/api/atlas/activity/').status_code, 403)

    def test_staff_receives_client_shell(self):
        user = get_user_model().objects.create_user('atlas-admin', is_staff=True)
        self.client.force_login(user)
        response = self.client.get('/inquiry/atlas/')
        self.assertContains(response, 'bundles/inquiry-atlas/inquiry-atlas.js')
        self.assertEqual(response.context['atlas_config']['activityUrl'], '/inquiry/api/atlas/activity/')
