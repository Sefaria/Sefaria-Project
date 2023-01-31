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


def append_character_to_title(t, en_char, he_char):
	en = t.get_primary_title('en')
	he = t.get_primary_title('he')
	t = rename_topic(en+en_char, t)
	t = rename_topic(he+he_char, t, lang='he')
	return t


def add_description(t):
	enCatDesc = f'categoryDescription for {t.slug}'
	heCatDesc = f'hebrew categoryDescription for {t.slug}'
	enDesc = f'Description for {t.slug}'
	heDesc = f'hebrew description for {t.slug}'
	return update_description({'en': enDesc, 'he': heDesc}, getattr(t, "description", {}), {'en': enCatDesc, 'he': heCatDesc}, getattr(t, "categoryDescription", {}), t)


def remove_description(t):
	return update_description({'en': "", 'he': ""}, getattr(t, "description", {}), {'en': "", 'he': ""}, getattr(t, "categoryDescription", {}), t)


def remove_last_char_from_title(t):
	en = t.get_primary_title('en')
	he = t.get_primary_title('he')
	en_char = en[-1]
	he_char = he[-1]
	t = rename_topic(en[:-1], t)
	t = rename_topic(he[:-1], t, lang='he')
	t.save()
	return t, en_char, he_char


def modify_title(topic):
	en, he = topic.get_primary_title('en'), topic.get_primary_title('he')
	topic, removed_en_char, removed_he_char = remove_last_char_from_title(topic)
	topic = append_character_to_title(topic, removed_en_char, removed_he_char)
	new_en, new_he = topic.get_primary_title('en'), topic.get_primary_title('he')
	topic.save()
	assert en == new_en and new_he == he, f"Rename topics failed for {topic.slug}"


def add_and_remove_description(topic):
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
	orig_tree_from_normal_root = library.get_topic_toc_json_recursive(root_wout_self_link["topic"])
	orig_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(root_with_self_link["topic"])
	roots = [root_wout_self_link["topic"], root_with_self_link["topic"]]
	for i, root in enumerate(roots):
		other_root = roots[1 - i]
		root = change_category(root, other_root.slug, "Main Menu")  # move root to be child of other root
		root = change_category(root, "Main Menu", root.slug)  # move it back to the main menu
	new_tree_from_normal_root = library.get_topic_toc_json_recursive(roots[0])
	new_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(roots[1])
	assert new_tree_from_normal_root == orig_tree_from_normal_root
	assert new_tree_from_root_with_self_link == orig_tree_from_root_with_self_link


def title_and_category_changes(node_to_change, orig_parent, new_parent):
	# change title and move to a different parent in the TOC
	append_character_to_title(node_to_change, "S", "ס")
	change_category(node_to_change, new_parent,
					orig_parent)
	node_to_change.save()

	# undo changes
	remove_last_char_from_title(node_to_change)
	change_category(node_to_change, orig_parent,
					new_parent)
	node_to_change.save()


def test_title_and_category_changes(root_wout_self_link, child_of_root_wout_self_link, root_with_self_link, child_of_root_with_self_link, grandchild_of_root_with_self_link):

	node_to_change = child_of_root_with_self_link["topic"]
	orig_parent = root_with_self_link["topic"].slug
	new_parent = root_wout_self_link["topic"].slug
	title_and_category_changes(node_to_change, orig_parent, new_parent)

	node_to_change = child_of_root_wout_self_link["topic"]
	orig_parent = root_wout_self_link["topic"].slug
	new_parent = root_with_self_link["topic"].slug
	title_and_category_changes(node_to_change, orig_parent, new_parent)

	node_to_change = grandchild_of_root_with_self_link["topic"]
	orig_parent = child_of_root_with_self_link["topic"].slug
	new_parent = "Main Menu"
	title_and_category_changes(node_to_change, orig_parent, new_parent)



def test_change_child_of_root_with_self_linkegories(root_wout_self_link, child_of_root_wout_self_link, root_with_self_link, child_of_root_with_self_link, grandchild_of_root_with_self_link):
	orig_tree_from_normal_root = library.get_topic_toc_json_recursive(root_wout_self_link["topic"])
	orig_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(root_with_self_link["topic"])

	change_category(child_of_root_with_self_link["topic"], root_wout_self_link["topic"].slug, root_with_self_link["topic"].slug)
	change_category(child_of_root_wout_self_link["topic"], root_with_self_link["topic"].slug, root_wout_self_link["topic"].slug)

	change_category(child_of_root_with_self_link["topic"], root_with_self_link["topic"].slug, root_wout_self_link["topic"].slug)
	change_category(child_of_root_wout_self_link["topic"], root_wout_self_link["topic"].slug, root_with_self_link["topic"].slug)

	new_tree_from_normal_root = library.get_topic_toc_json_recursive(root_wout_self_link["topic"])
	new_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(root_with_self_link["topic"])
	assert new_tree_from_normal_root == orig_tree_from_normal_root
	assert new_tree_from_root_with_self_link == orig_tree_from_root_with_self_link
