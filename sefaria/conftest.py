from unittest.mock import patch

mock_topics_pool = {'sheets_topic_only': ['sheets', 'general_en', 'torah_tab'],
 'library_topic_only': ['library'],
 'sheets_and_library_topic': ['library', 'sheets', 'general_en']}


def mock_get_pools(self):
    return mock_topics_pool.get(self.slug, [])

patch("sefaria.model.topic.Topic.get_pools", mock_get_pools).start()

def pytest_configure(config):
    import sys
    import django
    sys._called_from_test = True
    django.setup()


def pytest_unconfigure(config):
    import sys
    del sys._called_from_test
