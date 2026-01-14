from unittest.mock import patch

mock_topics_pool = {'sheets_topic_only': ['sheets', 'general_en', 'torah_tab'],
 'library_topic_only': ['library'],
 'sheets_and_library_topic': ['library', 'sheets', 'general_en']}


def mock_get_pools(self):
    return mock_topics_pool.get(self.slug, [])


def mock_add_pool(self, pool_name):
    if self.slug not in mock_topics_pool:
        mock_topics_pool[self.slug] = []
    if pool_name not in mock_topics_pool[self.slug]:
        mock_topics_pool[self.slug].append(pool_name)


def mock_remove_pool(self, pool_name):
    if self.slug in mock_topics_pool and pool_name in mock_topics_pool[self.slug]:
        mock_topics_pool[self.slug].remove(pool_name)


def mock_has_pool(self, pool):
    return pool in mock_get_pools(self)


patch("sefaria.model.topic.Topic.get_pools", mock_get_pools).start()
patch("sefaria.model.topic.Topic.add_pool", mock_add_pool).start()
patch("sefaria.model.topic.Topic.remove_pool", mock_remove_pool).start()
patch("sefaria.model.topic.Topic.has_pool", mock_has_pool).start()

def pytest_configure(config):
    import sys
    import django
    sys._called_from_test = True
    django.setup()


def pytest_unconfigure(config):
    import sys
    del sys._called_from_test
