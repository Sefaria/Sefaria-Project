# -*- coding: utf-8 -*-

import pytest
import pprint
from sefaria.model import *

class Test_Schema(object):
    def test_schema_load(self):
        i = Index().load({"title": "Lekutei Moharan"})
        if i:
            i.delete()
        lm_schema = {
            "key": "Lekutei Moharan",
            "titles": [
                {
                    "lang": "en",
                    "text": "Lekutei Moharan",
                    "primary": True
                },
                {
                    "lang": "en",
                    "text": "Likutey Moharan"
                },
                {
                    "lang": "en",
                    "text": "Likkutei Moharan"
                },
                {
                    "lang": "he",
                    "text": u'ליקוטי מוהרן',  # took the " out from before final nun to avoid name conflict
                    "primary": True
                }
            ],
            "nodes": [
                {
                    "key": "Approbations",
                    "titles": [
                        {
                            "lang": "en",
                            "text": "Approbations",
                            "primary": True
                        },
                        {
                            "lang": "he",
                            "text": u'הסכמות',
                            "primary": True
                        }
                    ],
                    "nodeType": "JaggedArrayNode",
                    "nodeParameters": {
                        "depth": 1,
                        "addressTypes": ["Integer"],
                        "sectionNames": ["Approbation"]
                    }
                },
                {
                    "key": "Introduction",
                    "titles": [
                        {
                            "lang": "en",
                            "text": "Introduction",
                            "primary": True
                        },
                        {
                            "lang": "he",
                            "text": u"הקדמה",
                            "primary": True
                        }
                    ],
                    "nodeType": "JaggedArrayNode",
                    "nodeParameters": {
                        "depth": 1,
                        "addressTypes": ["Integer"],
                        "sectionNames": ["Paragraph"]
                    }
                },
                {
                    "key": "default",
                    "default": True,
                    "nodeType": "JaggedArrayNode",
                    "nodeParameters": {
                        "depth": 3,
                        "addressTypes": ["Integer", "Integer", "Integer"],
                        "sectionNames": ["Torah", "Section", "Paragraph"]
                    }
                },
                {
                    "key": "Tanina",
                    "titles": [
                        {
                            "lang": "en",
                            "text": "Tanina",
                            "primary": True
                        },
                        {
                            "lang": "he",
                            "text": u'תנינא',
                            "primary": True
                        }
                    ],
                    "nodes": [
                        {
                            "key": "default",
                            "default": True,
                            "nodeType": "JaggedArrayNode",
                            "nodeParameters": {
                                "depth": 3,
                                "addressTypes": ["Integer", "Integer", "Integer"],
                                "sectionNames": ["Torah", "Section", "Paragraph"]
                            }
                        },
                        {
                            "key": "Letters",
                            "titles" : [
                                {
                                    "lang": "en",
                                    "text": "Letters",
                                    "primary": True
                                },
                                {
                                    "lang": "he",
                                    "text": u'מכתב יד',
                                    "primary": True
                                }
                            ],
                            "nodeType": "JaggedArrayNode",
                            "nodeParameters": {
                                "depth": 2,
                                "addressTypes": ["Integer", "Integer"],
                                "sectionNames": ["Letter", "Paragraph"]
                            }

                        }
                    ]
                }
            ]
        }
        i = Index({
            "schema": lm_schema,
            "title": "Lekutei Moharan",
            "categories": ["Chasidut"]
        })
        i.save()
        i.nodes.all_tree_titles("en")
        i.nodes.title_dict("en")
        assert lm_schema == i.nodes.serialize()
        i.delete()





#todo : test default
#todo : test title schemes
