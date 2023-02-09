import pytest
from sefaria.helper.topic import *


@pytest.fixture(autouse=True, scope='module') 
def root_with_self_link():
	# create branch of tree starting with root_with_self_link
	t = Topic({'slug': "", "isTopLevelDisplay": True, "data_source": "sefaria", "numSources": 30, "displayOrder": 10})
	title = "Root Topic With Link to Itself"
	he_title = title[::-1]
	t.add_primary_titles(title, he_title)
	t.set_slug_to_primary_title()
	t.save()
	l = IntraTopicLink({"linkType": "displays-under", "fromTopic": t.slug,
						"toTopic": t.slug, "dataSource": "sefaria",
						"class": "intraTopic"}).save()
	yield {"topic": t, "link": l}
	t.delete()
	l.delete()


@pytest.fixture(autouse=True, scope='module')
def child_of_root_with_self_link(root_with_self_link):
	t = Topic({'slug': "", "isTopLevelDisplay": False, "data_source": "sefaria", "numSources": 0})
	title = "Second Level"
	he_title = title[::-1]
	t.add_primary_titles(title, he_title)
	t.set_slug_to_primary_title()
	t.save()
	l = IntraTopicLink({"linkType": "displays-under", "fromTopic": t.slug,
						"toTopic": root_with_self_link["topic"].slug, "dataSource": "sefaria",
						"class": "intraTopic"}).save()
	yield {"topic": t, "link": l}
	t.delete()
	l.delete()


@pytest.fixture(autouse=True, scope='module')
def grandchild_of_root_with_self_link(child_of_root_with_self_link):
	t = Topic({'slug': "", "isTopLevelDisplay": False, "data_source": "sefaria", "numSources": 0})
	title = "Second Level With Leaf Node"
	he_title = title[::-1]
	t.add_primary_titles(title, he_title)
	t.set_slug_to_primary_title()
	t.save()
	l = IntraTopicLink({"linkType": "displays-under", "fromTopic": t.slug,
						"toTopic": child_of_root_with_self_link["topic"].slug, "dataSource": "sefaria",
						"class": "intraTopic"}).save()
	yield {"topic": t, "link": l}
	t.delete()
	l.delete()


@pytest.fixture(autouse=True, scope='module')
def root_wout_self_link():
	# create second branch of tree starting with root_wout_self_link
	t = Topic({'slug': "", "isTopLevelDisplay": True, "data_source": "sefaria", "numSources": 0})
	title = "Normal Root"
	he_title = title[::-1]
	t.add_primary_titles(title, he_title)
	t.set_slug_to_primary_title()
	t.save()
	l = None
	yield {"topic": t, "link": l}
	t.delete()


@pytest.fixture(autouse=True, scope='module')
def child_of_root_wout_self_link(root_wout_self_link):
	t = Topic({'slug': "", "isTopLevelDisplay": False, "data_source": "sefaria", "numSources": 0})
	title = "Normal Root Leaf Node"
	he_title = title[::-1]
	t.add_primary_titles(title, he_title)
	t.set_slug_to_primary_title()
	t.save()
	l = IntraTopicLink({"linkType": "displays-under", "fromTopic": t.slug,
						"toTopic": root_wout_self_link["topic"].slug, "dataSource": "sefaria",
						"class": "intraTopic"}).save()  # root_wout_self_link has child leaf_node
	yield {"topic": t, "link": l}
	t.delete()
	l.delete()

def add_description(t):
	enCatDesc = f'categoryDescription for {t.slug}'
	heCatDesc = f'hebrew categoryDescription for {t.slug}'
	enDesc = f'Description for {t.slug}'
	heDesc = f'hebrew description for {t.slug}'
	update_topic(description={'en': enDesc, 'he': heDesc}, catDescription={'en': enCatDesc, 'he': heCatDesc})
	return t


def remove_description(t):
	update_topic(description={'en': "", 'he': ""}, catDescription={'en': "", 'he': ""})
	return t


def modify_title(topic):
	en, he = topic.get_primary_title('en'), topic.get_primary_title('he')
	update_topic(topic, title=en+'new', heTitle=he+'new')
	new_en, new_he = topic.get_primary_title('en'), topic.get_primary_title('he')
	assert en != new_en and new_he != he, f"Rename topics failed for {topic.slug}"

	update_topic(topic, title=en, heTitle=he)
	new_en, new_he = topic.get_primary_title('en'), topic.get_primary_title('he')
	assert en == new_en and new_he == he, f"Rename topics failed for {topic.slug}"


def test_add_and_remove_description(topic):
	origDesc = topic.description
	origCatDesc = getattr(topic, "categoryDescription", {'en': "", 'he': ""})

	topic = add_description(topic)
	topic.save()
	newDesc = topic.description
	newCatDesc = getattr(topic, "categoryDescription", {'en': "", 'he': ""})
	assert origDesc != newDesc and origCatDesc != newCatDesc, f"Add description failed for {topic.slug}"

	topic = remove_description(topic)
	topic.save()
	newDesc = topic.description
	newCatDesc = getattr(topic, "categoryDescription", {'en': "", 'he': ""})
	assert origDesc == newDesc and origCatDesc == newCatDesc, f"Remove description failed for {topic.slug}"


def test_all_title(root_wout_self_link, child_of_root_wout_self_link, root_with_self_link, child_of_root_with_self_link, grandchild_of_root_with_self_link):
	for t in [root_wout_self_link, child_of_root_wout_self_link, root_with_self_link, child_of_root_with_self_link, grandchild_of_root_with_self_link]:
		modify_title(t["topic"])


def test_change_root_categories(root_wout_self_link, root_with_self_link):
	# tests moving both root categories down the tree and back up and asserting that moving down the tree changes the tree
	# and assert that moving it back to the root position yields the original tree

	orig_tree_from_normal_root = library.get_topic_toc_json_recursive(root_wout_self_link["topic"])
	orig_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(root_with_self_link["topic"])
	orig_trees = [orig_tree_from_normal_root, orig_tree_from_root_with_self_link]
	roots = [root_wout_self_link["topic"], root_with_self_link["topic"]]
	for i, root in enumerate(roots):
		other_root = roots[1 - i]
		update_topic(root, category=other_root.slug) # move root to be child of other root
		new_tree = library.get_topic_toc_json_recursive(other_root)
		assert new_tree != orig_trees[i]  # assert that the changes in the tree have occurred
		root = topic_change_category(root, "Main Menu")  # move it back to the main menu

	final_tree_from_normal_root = library.get_topic_toc_json_recursive(roots[0])
	final_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(roots[1])
	assert final_tree_from_normal_root == orig_tree_from_normal_root  # assert that the tree is back to normal
	assert final_tree_from_root_with_self_link == orig_tree_from_root_with_self_link


def test_change_child_of_root_with_self_link(root_wout_self_link, child_of_root_wout_self_link, root_with_self_link, child_of_root_with_self_link, grandchild_of_root_with_self_link):
	# tests moving topics across the tree to a different root

	orig_tree_from_normal_root = library.get_topic_toc_json_recursive(root_wout_self_link["topic"])
	orig_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(root_with_self_link["topic"])

	topic_change_category(child_of_root_with_self_link["topic"], root_wout_self_link["topic"].slug)
	topic_change_category(child_of_root_wout_self_link["topic"], root_with_self_link["topic"].slug)

	new_tree_from_normal_root = library.get_topic_toc_json_recursive(root_wout_self_link["topic"])
	new_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(root_with_self_link["topic"])
	assert new_tree_from_normal_root != orig_tree_from_normal_root
	assert new_tree_from_root_with_self_link != orig_tree_from_root_with_self_link

	topic_change_category(child_of_root_with_self_link["topic"], root_with_self_link["topic"].slug)
	topic_change_category(child_of_root_wout_self_link["topic"], root_wout_self_link["topic"].slug)

	new_tree_from_normal_root = library.get_topic_toc_json_recursive(root_wout_self_link["topic"])
	new_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(root_with_self_link["topic"])
	assert new_tree_from_normal_root == orig_tree_from_normal_root
	assert new_tree_from_root_with_self_link == orig_tree_from_root_with_self_link
