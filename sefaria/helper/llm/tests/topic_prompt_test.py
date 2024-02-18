import pytest
from sefaria.helper.llm.topic_prompt import *


@pytest.mark.parametrize(('ref_topic_links', 'ref__context_hints_by_lang'), [
    [  # one context one lang
        [
            {
                'ref': 'Genesis 1:1',
                'descriptions': {
                    'en': {'ai_context': 'test'}
                }
            }
        ], {'en': [(Ref('Genesis 1:1'), 'test')]}
    ],
    [  # no contexts
        [
            {
                'ref': 'Genesis 1:1',
                'descriptions': {}
            }
        ], {}
    ],
    [  # two languages in one link
        [
            {
                'ref': 'Genesis 1:1',
                'descriptions': {
                    'en': {'ai_context': 'test'},
                    'he': {'ai_context': 'he_test'}
                }
            }
        ], {'en': [(Ref('Genesis 1:1'), 'test')], 'he': [(Ref('Genesis 1:1'), 'he_test')]}],
    [  # one language in each link
        [
            {
                'ref': 'Genesis 1:1',
                'descriptions': {
                    'en': {'ai_context': 'test'},
                }
            },
            {
                'ref': 'Genesis 1:2',
                'descriptions': {
                    'he': {'ai_context': 'he_test'},
                }
            }
        ], {'en': [(Ref('Genesis 1:1'), 'test')], 'he': [(Ref('Genesis 1:2'), 'he_test')]}
    ],
    [  # one language in each link but one link has prompt
        [
            {
                'ref': 'Genesis 1:1',
                'descriptions': {
                    'en': {'ai_context': 'test'},
                }
            },
            {
                'ref': 'Genesis 1:2',
                'descriptions': {
                    'he': {'ai_context': 'he_test', 'prompt': 'AIs are cool'},
                }
            }
        ], {'en': [(Ref('Genesis 1:1'), 'test')]}
    ]
])
def test_get_ref_context_hints_by_lang(ref_topic_links, ref__context_hints_by_lang):
    assert get_ref_context_hints_by_lang(ref_topic_links) == ref__context_hints_by_lang

