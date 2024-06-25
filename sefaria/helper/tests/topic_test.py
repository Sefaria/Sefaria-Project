import pytest
from sefaria.model.topic import Topic, IntraTopicLink
from sefaria.model.text import library
from sefaria.model.place import Place
from sefaria.helper import topic


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
def author_root():
	# create second branch of tree starting with author_root
	t = Topic({'slug': "", "isTopLevelDisplay": True, "data_source": "sefaria", "numSources": 0})
	title = "Authors"
	he_title = title[::-1]
	t.add_primary_titles(title, he_title)
	t.set_slug_to_primary_title()
	t.save()
	l = None
	yield {"topic": t, "link": l}
	t.delete()


@pytest.fixture(autouse=True, scope='module')
def actual_author(author_root):
	t = Topic({'slug': "", "isTopLevelDisplay": False, "data_source": "sefaria", "numSources": 0})
	title = "Author Dude"
	he_title = title[::-1]
	t.add_primary_titles(title, he_title)
	t.set_slug_to_primary_title()
	t.save()
	l = IntraTopicLink({"linkType": "displays-under", "fromTopic": t.slug,
						"toTopic": author_root["topic"].slug, "dataSource": "sefaria",
						"class": "intraTopic"}).save()  # author_root has child leaf_node
	yield {"topic": t, "link": l}
	t.delete()
	l.delete()


def test_title_and_desc(author_root, actual_author, root_with_self_link, child_of_root_with_self_link, grandchild_of_root_with_self_link):
	for count, t in enumerate([author_root, actual_author, root_with_self_link, child_of_root_with_self_link, grandchild_of_root_with_self_link]):
		new_values = {"title": f"new title {count+1}",
					  "altTitles": {"en": [f"New Alt title {count+1}"], "he": [f"New He Alt Title {count+1}"]},
					  "heTitle": f"new hebrew title {count+1}", "description": {"en": f"new desc", "he": "new hebrew desc"}}
		topic.update_topic(t["topic"], **new_values)
		assert t["topic"].description == new_values["description"]
		assert t["topic"].get_primary_title('he') == new_values['heTitle']
		assert t["topic"].get_titles('en') == [new_values["title"]]+new_values["altTitles"]['en']

def test_author_root(author_root, actual_author):
	new_values = {"category": "authors", "title": actual_author["topic"].get_primary_title('en'),
				  "heTitle": actual_author["topic"].get_primary_title('he'),
				  "birthPlace": "Kyoto, Japan", "birthYear": 1300}
	assert Place().load({'key': new_values["birthPlace"]}) is None
	topic.update_topic(actual_author["topic"], **new_values)
	assert Place().load({'key': new_values["birthPlace"]})
	assert actual_author["topic"].properties["birthYear"]["value"] == 1300
	Place().load({'key': new_values["birthPlace"]}).delete()

def test_change_categories_and_titles(author_root, root_with_self_link):
	# tests moving both root categories down the tree and back up and asserting that moving down the tree changes the tree
	# and assert that moving it back to the root position yields the original tree.
	orig_tree_from_normal_root = library.get_topic_toc_json_recursive(author_root["topic"])
	orig_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(root_with_self_link["topic"])
	orig_trees = [orig_tree_from_normal_root, orig_tree_from_root_with_self_link]
	roots = [author_root["topic"], root_with_self_link["topic"]]
	orig_titles = [roots[0].get_primary_title('en'), roots[1].get_primary_title('en')]
	orig_he_titles = [roots[0].get_primary_title('he'), roots[1].get_primary_title('he')]
	for i, root in enumerate(roots):
		other_root = roots[1 - i]
		topic.update_topic(root, title=f"fake new title {i+1}", heTitle=f"fake new he title {i+1}", category=other_root.slug)  # move root to be child of other root
		new_tree = library.get_topic_toc_json_recursive(other_root)
		assert new_tree != orig_trees[i]  # assert that the changes in the tree have occurred
		assert root.get_titles('en') != [orig_titles[i]]
		assert root.get_titles('he') != [orig_he_titles[i]]
		topic.update_topic(root, title=orig_titles[i], heTitle=orig_he_titles[i], category=Topic.ROOT)  # move it back to the main menu
		assert root.get_titles('en') == [orig_titles[i]]
		assert root.get_titles('he') == [orig_he_titles[i]]


	final_tree_from_normal_root = library.get_topic_toc_json_recursive(roots[0])
	final_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(roots[1])
	assert final_tree_from_normal_root == orig_tree_from_normal_root  # assert that the tree is back to normal
	assert final_tree_from_root_with_self_link == orig_tree_from_root_with_self_link


def test_change_categories(author_root, actual_author, root_with_self_link, child_of_root_with_self_link, grandchild_of_root_with_self_link):
	# tests moving topics across the tree to a different root

	orig_tree_from_normal_root = library.get_topic_toc_json_recursive(author_root["topic"])
	orig_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(root_with_self_link["topic"])

	topic.topic_change_category(child_of_root_with_self_link["topic"], author_root["topic"].slug)
	topic.topic_change_category(actual_author["topic"], root_with_self_link["topic"].slug)

	new_tree_from_normal_root = library.get_topic_toc_json_recursive(author_root["topic"])
	new_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(root_with_self_link["topic"])
	assert new_tree_from_normal_root != orig_tree_from_normal_root
	assert new_tree_from_root_with_self_link != orig_tree_from_root_with_self_link

	topic.topic_change_category(child_of_root_with_self_link["topic"], root_with_self_link["topic"].slug)
	topic.topic_change_category(actual_author["topic"], author_root["topic"].slug)

	new_tree_from_normal_root = library.get_topic_toc_json_recursive(author_root["topic"])
	new_tree_from_root_with_self_link = library.get_topic_toc_json_recursive(root_with_self_link["topic"])
	assert new_tree_from_normal_root == orig_tree_from_normal_root
	assert new_tree_from_root_with_self_link == orig_tree_from_root_with_self_link


@pytest.mark.parametrize(('current', 'requested', 'was_ai_generated', 'merged'), [
	['not reviewed', 'not reviewed', True, 'not reviewed'],
	['reviewed', 'not reviewed', True, 'reviewed'],
	['edited', 'not reviewed', True, 'edited'],
	['edited', 'edited', True, 'edited'],
	['not reviewed', 'edited', True, 'edited'],
	['reviewed', 'edited', True, 'reviewed'],
	[None, 'edited', True, 'edited'],
	[None, None, True, None],
	['not reviewed', 'not reviewed', False, None],
	[None, 'edited', False, None],
	[None, None, False, None],
])
def test_calculate_approved_review_state(current, requested, was_ai_generated, merged):
	assert topic._calculate_approved_review_state(current, requested, was_ai_generated) == merged

@pytest.mark.parametrize(('current', 'requested', 'merged'), [
	[{'en': {}}, {'en': {}}, {'en': {}}],
	[{'en': {'review_state': 'not reviewed'}}, {'en': {}}, {'en': {'review_state': 'not reviewed'}}],
	[{'en': {}, 'he': {'title': 'yo'}}, {'en': {'title': 'eng'}}, {'en': {'title': 'eng'}, 'he': {'title': 'yo'}}],

])
def test_get_merged_descriptions(current, requested, merged):
	assert topic._get_merged_descriptions(current, requested) == merged
