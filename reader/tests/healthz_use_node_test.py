"""
/healthz (reader/views.py application_health_api) checks Node only when Django renders through it (USE_NODE). With USE_NODE
off (Helm nodejs.mode "reader"), the node pods are the new reader, which sends /healthz back to Django: checking them would
wait on ourselves.
"""

from unittest import mock

from django.test import TestCase


class HealthzNodeTest(TestCase):
    databases = "__all__"

    def get(self, use_node):
        with (
            mock.patch("reader.views.USE_NODE", use_node),
            mock.patch("reader.views.gen_cache") as cache,
            mock.patch("reader.views.urllib.request.urlopen", side_effect=OSError("node unreachable")) as urlopen,
        ):
            cache.redis.ping.return_value = True
            return self.client.get("/healthz"), urlopen

    def test_without_node_rendering_node_is_not_asked(self):
        res, urlopen = self.get(False)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["nodejsReady"])
        urlopen.assert_not_called()

    def test_with_node_rendering_an_unreachable_node_is_unhealthy(self):
        res, urlopen = self.get(True)
        self.assertNotEqual(res.status_code, 200)
        self.assertFalse(res.json()["nodejsReady"])
        urlopen.assert_called()
