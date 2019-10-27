# encoding=utf-8

import pytest
from sefaria.model.manuscript_image import ManuscriptImage, ManuscriptImageSet
from sefaria.system.exceptions import DuplicateRecordError


image_data = {
    'image_url': '',
    'expanded_refs': [],
    'thumbnail_url': '',
    'manuscript_title': '',
    'page_num': 0
}


def setup_module(module):
    ManuscriptImageSet({
        'manuscript_title': image_data['manuscript_title'],
        'page_num': image_data['page_num']
    }).delete()
    ManuscriptImage(image_data).save()


def teardown_module(module):
    ManuscriptImageSet({
        'manuscript_title': image_data['manuscript_title'],
        'page_num': image_data['page_num']
    }).delete()


def test_image_id_exists():
    mi = ManuscriptImage().load({
        'manuscript_title': image_data['manuscript_title'],
        'page_num': image_data['page_num']
    })
    assert hasattr(mi, 'image_id')


def test_duplicate():
    mi = ManuscriptImage(image_data)
    with pytest.raises(DuplicateRecordError):
        mi.save()


def test_add_ref():
    mi = ManuscriptImage().load({
        'manuscript_title': image_data['manuscript_title'],
        'page_num': image_data['page_num']
    })
    new_ref = 'foo 1:1'
    while new_ref in mi.expanded_refs:
        new_ref = '{}{}'.format(new_ref, 1)

    mi.add_segment_ref(new_ref)
    mi.save()

    mi = ManuscriptImage().load({
        'manuscript_title': image_data['manuscript_title'],
        'page_num': image_data['page_num']
    })
    assert new_ref in mi.expanded_refs


def add_ref_if_none():
    mi = ManuscriptImage().load({
        'manuscript_title': image_data['manuscript_title'],
        'page_num': image_data['page_num']
    })
    if not mi.expanded_refs:
        mi.add_segment_ref('foo 1:1')
        mi.save()
        mi = ManuscriptImage().load({
            'manuscript_title': image_data['manuscript_title'],
            'page_num': image_data['page_num']
        })

    return mi


def test_add_duplicate_ref():
    mi = add_ref_if_none()

    num_refs = len(mi.expanded_refs)
    mi.add_segment_ref(mi.expanded_refs[0])
    mi.save()

    mi = ManuscriptImage().load({
        'manuscript_title': image_data['manuscript_title'],
        'page_num': image_data['page_num']
    })
    assert len(mi.expanded_refs) == num_refs


def test_remove_ref():
    mi = add_ref_if_none()
    first_ref = mi.expanded_refs[0]
    mi.remove_segment_ref(first_ref)
    mi.save()

    mi = ManuscriptImage().load({
        'manuscript_title': image_data['manuscript_title'],
        'page_num': image_data['page_num']
    })
    assert first_ref not in mi.expanded_refs


def test_remove_nonexistant_ref():
    mi = ManuscriptImage().load({
        'manuscript_title': image_data['manuscript_title'],
        'page_num': image_data['page_num']
    })
    with pytest.raises(ValueError):
        mi.remove_segment_ref("This string really shouldn't be in there and if it is someone is probably messing"
                              " with me blahblahblahblahblahblahblahblah")
