import pytest
from sefaria.model.topic import *
from sefaria.helper.topic import *


@pytest.fixture(autouse=True)
def root_topic_with_link_to_itself():
	# create branch of tree starting with root_topic_with_link_to_itself
	t = Topic({'slug': "", "isTopLevelDisplay": True, "data_source": "sefaria", "numSources": 0})
	title = "Root Topic With Link to Itself"
	he_title = title[::-1]
	t.add_primary_titles(title, he_title)
	t.set_slug_to_primary_title()
	t.save()
	l = IntraTopicLink({"linkType": "displays-under", "fromTopic": t.slug,
					"toTopic": t.slug, "dataSource": "sefaria",
					"class": "intraTopic"}).save()
	yield t, l
	t.delete()
	l.delete()


@pytest.fixture(autouse=True)
def second_level_cat(root_topic_with_link_to_itself):
	t = Topic({'slug': "", "isTopLevelDisplay": False, "data_source": "sefaria", "numSources": 0})
	title = "Second Level"
	he_title = title[::-1]
	t.add_primary_titles(title, he_title)
	t.set_slug_to_primary_title()
	t.save()
	l = IntraTopicLink({"linkType": "displays-under", "fromTopic": t.slug,
					"toTopic": root_topic_with_link_to_itself.slug, "dataSource": "sefaria",
					"class": "intraTopic"}).save()
	yield t, l
	t.delete()
	l.delete()

@pytest.fixture(autouse=True)
def second_level_with_leaf_node(second_level_cat):
	t = Topic({'slug': "", "isTopLevelDisplay": False, "data_source": "sefaria", "numSources": 0})
	title = "Second Level With Leaf Node"
	he_title = title[::-1]
	t.add_primary_titles(title, he_title)
	t.set_slug_to_primary_title()
	t.save()
	l = IntraTopicLink({"linkType": "displays-under", "fromTopic": t.slug,
					"toTopic": second_level_cat.slug, "dataSource": "sefaria",
					"class": "intraTopic"}).save()
	yield t, l
	t.delete()
	l.delete()


@pytest.fixture(autouse=True)
def normal_root_topic():
	# create second branch of tree starting with normal_root_topic
	t = Topic({'slug': "", "isTopLevelDisplay": True, "data_source": "sefaria", "numSources": 0})
	title = "Normal Root"
	he_title = title[::-1]
	t.add_primary_titles(title, he_title)
	t.set_slug_to_primary_title()
	t.save()
	yield t, None
	t.delete()


@pytest.fixture(autouse=True)
def normal_root_leaf_node(normal_root_topic):
	t = Topic({'slug': "", "isTopLevelDisplay": False, "data_source": "sefaria", "numSources": 0})
	title = "Normal Root Leaf Node"
	he_title = title[::-1]
	t.add_primary_titles(title, he_title)
	t.set_slug_to_primary_title()
	t.save()
	l = IntraTopicLink({"linkType": "displays-under", "fromTopic": t.slug,
					"toTopic": normal_root_topic.slug, "dataSource": "sefaria",
					"class": "intraTopic"}).save()  # normal_root_topic has child leaf_node
	yield t, l
	t.delete()
	l.delete()


def test_modifications_in_sequence():
	# 1) sequence: iterate over three topics, change title, save, change category horizontally,
	# then save, change descriptions then save, then iterate over three topics and change them back,
	# then check that both topics have the correct data by comparing the new contents() to orig contents()
	for t in [normal_root_topic, normal_root_leaf_node]:
		en = t.get_primary_titles('en')
		he = t.get_primary_titles('he')
		rename_topic()

	pass
