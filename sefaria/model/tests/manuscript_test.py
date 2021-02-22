# encoding=utf-8

import pytest

from sefaria.model import *
from sefaria.system.exceptions import *


def make_testing_manuscript_page(manuscript_slug, page_id, **kwargs) -> ManuscriptPage:
    """
    Convenience method, sets the required url attributes to filler values, and giving a valid ManuscriptPage instance.
    Other parameters can be set with a keyword argument.
    :param manuscript_slug:
    :param page_id:
    :return:
    """
    data_dict = {
        'image_url': 'foo',
        'thumbnail_url': 'foo.thumb',
        'page_id': page_id,
        'manuscript_slug': manuscript_slug
    }
    for attr in ManuscriptPage.required_attrs:
        if attr in kwargs:
            data_dict[attr] = kwargs[attr]

    return ManuscriptPage().load_from_dict(data_dict)


def make_testing_manuscript(title, **kwargs) -> Manuscript:
    """
    Convenience method, sets all the required attributes except the title and return a valid Manuscript instance.
    Other parameters can be set with a keyword argument.
    :param title:
    :return:
    """
    data_dict = {  # slug gets defined from the title, we do not need to set it manually
        'title': title,
        'he_title': 'פו',
        'source': 'This manuscript is a forgery',
        'description': 'testing manuscript, delete this',
        'he_description': 'פו בר'
    }
    for attr in Manuscript.required_attrs:
        if attr in kwargs:
            data_dict[attr] = kwargs[attr]

    return Manuscript().load_from_dict(data_dict)


def setup_module():
    teardown_module()
    m = make_testing_manuscript('Delete Me')
    m.save()
    for i in range(5):
        page = make_testing_manuscript_page(m.slug, i)
        page.save()


def teardown_module():
    possible_titles = ['Delete Me', 'Remove Me']
    for title in possible_titles:
        m = Manuscript().load({'slug': Manuscript.normalize_slug(title)})
        if m:
            m.delete()
        ManuscriptPageSet({'manuscript_slug': Manuscript.normalize_slug(title)}).delete()


class TestDataValidation:

    def test_check_for_parent(self):
        foo = make_testing_manuscript_page('no_parent', 1)
        assert not foo.validate()

        with pytest.raises(ManuscriptError):
            foo.save()

    def test_duplicate_manuscript(self):
        with pytest.raises(DuplicateRecordError):
            make_testing_manuscript('Delete Me').save()

        num_test_manuscripts = ManuscriptSet({'title': 'Delete Me'})
        assert num_test_manuscripts.count() == 1


class TestPageRefs:

    @classmethod
    def setup_class(cls):
        refs = [
            'Job 3',
            'Job 4',
            'Job 5-6',
        ]
        slug = Manuscript.normalize_slug('Delete Me')
        for i, r in enumerate(refs):
            mp = ManuscriptPage().load({'manuscript_slug': slug, 'page_id': i})
            if r not in mp.contained_refs:
                mp.add_ref(r)
                mp.save()

    def test_new_ref_overlap(self):
        mp = ManuscriptPage().load({'expanded_refs': 'Job 3:1'})
        assert mp is not None
        with pytest.raises(ManuscriptError):
            mp.add_ref('Job 3-4')

    def test_load_by_segment(self):
        mps = ManuscriptPageSet.load_by_ref(Ref('Job 3:1'))
        test_specific = [m for m in mps if m.manuscript_slug == Manuscript.normalize_slug('Delete Me')]
        assert len(test_specific) == 1

    def test_load_by_section(self):
        mps = ManuscriptPageSet.load_by_ref(Ref('Job 3'))
        test_specific = [m for m in mps if m.manuscript_slug == Manuscript.normalize_slug('Delete Me')]
        assert len(test_specific) == 1

    def test_load_range(self):
        mps = ManuscriptPageSet.load_by_ref(Ref("Job 4:2-6:3"))
        test_specific = [m for m in mps if m.manuscript_slug == Manuscript.normalize_slug('Delete Me')]
        assert len(test_specific) == 2

    def test_load_for_client(self):
        slug = Manuscript.normalize_slug('Delete Me')
        data = ManuscriptPageSet.load_set_for_client("Job 4")
        data = [d for d in data if d['manuscript_slug'] == slug][0]  # this is here to limit us to just the testing data

        mock_page = make_testing_manuscript_page(slug, 1)
        mock_page.add_ref("Job 4")
        mock_page = mock_page.contents()
        mock_page['manuscript'] = make_testing_manuscript('Delete Me').contents()
        mock_page['manuscript']['slug'] = slug
        mock_page['anchorRef'] = "Job 4"
        mock_page['anchorRefExpanded'] = mock_page['expanded_refs']
        del mock_page['expanded_refs']
        del mock_page['contained_refs']
        for key, value in mock_page.items():
            if isinstance(value, list):
                assert sorted(data[key]) == sorted(value)
            else:
                assert data[key] == value


class TestDependencies:

    def test_rename_manuscript(self):
        original_title, new_title = 'Delete Me', 'Remove Me'
        m = Manuscript().load({'slug': Manuscript.normalize_slug(original_title)})
        m.title = new_title
        m.save()
        assert m.slug == Manuscript.normalize_slug(new_title)

        mps = ManuscriptPageSet({'manuscript_slug': Manuscript.normalize_slug(original_title)})
        assert mps.count() == 0
        mps = ManuscriptPageSet({'manuscript_slug': Manuscript.normalize_slug(new_title)})
        assert mps.count() == 5

        m.title = original_title
        m.save()

        mps = ManuscriptPageSet({'manuscript_slug': Manuscript.normalize_slug(original_title)})
        assert mps.count() == 5
        mps = ManuscriptPageSet({'manuscript_slug': Manuscript.normalize_slug(new_title)})
        assert mps.count() == 0

    def test_delete_manuscript(self):
        slug = Manuscript.normalize_slug('Delete Me')
        m = Manuscript().load({'slug': slug})
        m.delete()

        mps = ManuscriptPageSet({'manuscript_slug': slug})
        assert mps.count() == 0

        setup_module()
