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


def test_title_and_desc(root_wout_self_link, child_of_root_wout_self_link, root_with_self_link, child_of_root_with_self_link, grandchild_of_root_with_self_link):
	for t in [root_wout_self_link, child_of_root_wout_self_link, root_with_self_link, child_of_root_with_self_link, grandchild_of_root_with_self_link]:
		new_values = {"title": "new title", "heTitle": "new hebrew title", "description": {"en": "desc", "he": "hebrew desc"}}
		update_topic(t["topic"], **new_values)
		assert t["topic"].description == new_values["description"]
		assert t["topic"].get_primary_title('en') == new_values['title']
		assert t["topic"].get_primary_title('he') == new_values['heTitle']


def test_change_root_categories(root_wout_self_link, root_with_self_link):
	# tests moving both root categories down the tree and back up and asserting that moving down the tree changes the tree
	# and assert that moving it back to the root position yields the original tree

	orig_tree_from_normal_root = library.get_topic_toc_json_recursive(root_wout_self_link["topic"])
	orig_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(root_with_self_link["topic"])
	orig_trees = [orig_tree_from_normal_root, orig_tree_from_root_with_self_link]
	roots = [root_wout_self_link["topic"], root_with_self_link["topic"]]
	for i, root in enumerate(roots):
		other_root = roots[1 - i]
		update_topic(root, category=other_root.slug)  # move root to be child of other root
		new_tree = library.get_topic_toc_json_recursive(other_root)
		assert new_tree != orig_trees[i]  # assert that the changes in the tree have occurred
		update_topic(root, category="Main Menu")  # move it back to the main menu

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
