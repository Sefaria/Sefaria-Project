# -*- coding: utf-8 -*-

import pytest
import pprint
from sefaria.model import *
from sefaria.system.exceptions import InputError

class Test_Schema(object):
    # This needs a bunch of hebrew titles to validate

    @classmethod
    def setup_class(cls):
        pass

    @classmethod
    def teardown_class(cls):
        pass

    @pytest.mark.xfail(reason="unknown")
    def test_schema_load(self):
        i = Index().load({"title": "Mishnah Torah Test"})
        if i:
            i.delete()
        schema = {
            "key": "Mishnah Torah Test",
            "titles": [
                {
                    "lang": "en",
                    "text": "Mishnah Torah Test",
                    "primary": True
                },
                {
                    "lang": "en",
                    "text": "Rambam Test"
                },
                {
                    "lang": "he",
                    "text": "משנה תורה כאילו",
                    "primary": True
                }
            ],
            "nodes": [
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
                            "text": "הקדמה",
                            "primary": True
                        }
                    ],
                    "nodes": [
                        {
                            "key": "Transmission",
                            "titles": [
                                {
                                "lang": "en",
                                "text": "Transmission",
                                "primary": True
                                }
                            ],
                            "nodeType": "JaggedArrayNode",
                            "depth": 1,
                            "addressTypes": ["Integer"],
                            "sectionNames": ["Paragraph"]
                        },
                        {
                            "key": "List of Positive Mitzvot",
                            "titles": [
                                {
                                "lang": "en",
                                "text": "List of Positive Mitzvot",
                                "primary": True
                                }
                            ],
                            "nodeType": "JaggedArrayNode",
                            "depth": 1,
                            "addressTypes": ["Integer"],
                            "sectionNames": ["Mitzvah"]
                        },
                        {
                            "key": "List of Negative Mitzvot",
                            "titles": [
                                {
                                "lang": "en",
                                "text": "List of Negative Mitzvot",
                                "primary": True
                                }
                            ],
                            "nodeType": "JaggedArrayNode",
                            "depth": 1,
                            "addressTypes": ["Integer"],
                            "sectionNames": ["Mitzvah"]
                        }
                    ]

                },
                {
                    "key": "Sefer Mada",
                    "titles": [
                        {
                        "lang": "en",
                        "text": "Sefer Mada",
                        "primary": True
                        }
                    ],
                    "nodes": [
                        {
                            "key": "Foundations of the Torah",
                            "titles": [
                                {
                                "lang": "en",
                                "text": "Foundations of the Torah",
                                "primary": True
                                }
                            ],
                            "nodes": [
                                {
                                    "key": "Introduction",
                                    "titles": [
                                        {
                                        "lang": "en",
                                        "text": "Introduction",
                                        "primary": True
                                        }
                                    ],
                                    "nodeType": "JaggedArrayNode",
                                    "depth": 0,
                                    "addressTypes": [],
                                    "sectionNames": []
                                },
                                {
                                    "key": "default",
                                    "default": True,
                                    "nodeType": "JaggedArrayNode",
                                    "depth": 2,
                                    "addressTypes": ["Integer", "Integer"],
                                    "sectionNames": ["Chapter", "Law"]
                                }
                            ]
                        },
                        {
                            "key": "Human Dispositions",
                            "titles": [
                                {
                                "lang": "en",
                                "text": "Human Dispositions",
                                "primary": True
                                }
                            ],
                            "nodes": [
                                {
                                    "key": "Introduction",
                                    "titles": [
                                        {
                                        "lang": "en",
                                        "text": "Introduction",
                                        "primary": True
                                        }
                                    ],
                                    "nodeType": "JaggedArrayNode",
                                    "depth": 0,
                                    "addressTypes": [],
                                    "sectionNames": []
                                },
                                {
                                    "key": "default",
                                    "default": True,
                                    "nodeType": "JaggedArrayNode",
                                    "depth": 2,
                                    "addressTypes": ["Integer", "Integer"],
                                    "sectionNames": ["Chapter", "Law"]
                                }
                            ]
                        },
                        {
                            "key": "Torah Study",
                            "titles": [
                                {
                                "lang": "en",
                                "text": "Torah Study",
                                "primary": True
                                }
                            ],
                            "nodes": [
                                {
                                    "key": "Introduction",
                                    "titles": [
                                        {
                                        "lang": "en",
                                        "text": "Introduction",
                                        "primary": True
                                        }
                                    ],
                                    "nodeType": "JaggedArrayNode",
                                    "depth": 0,
                                    "addressTypes": [],
                                    "sectionNames": []
                                },
                                {
                                    "key": "default",
                                    "default": True,
                                    "nodeType": "JaggedArrayNode",
                                    "depth": 2,
                                    "addressTypes": ["Integer", "Integer"],
                                    "sectionNames": ["Chapter", "Law"]
                                }
                            ]
                        },
                        {
                            "key": "Foreign Worship and Customs of the Nations",
                            "titles": [
                                {
                                "lang": "en",
                                "text": "Foreign Worship and Customs of the Nations",
                                "primary": True
                                }
                            ],
                            "nodes": [
                                {
                                    "key": "Introduction",
                                    "titles": [
                                        {
                                        "lang": "en",
                                        "text": "Introduction",
                                        "primary": True
                                        }
                                    ],
                                    "nodeType": "JaggedArrayNode",
                                    "depth": 0,
                                    "addressTypes": [],
                                    "sectionNames": []
                                },
                                {
                                    "key": "default",
                                    "default": True,
                                    "nodeType": "JaggedArrayNode",
                                    "depth": 2,
                                    "addressTypes": ["Integer", "Integer"],
                                    "sectionNames": ["Chapter", "Law"]
                                }
                            ]
                        },
                        {
                            "key": "Repentance",
                            "titles": [
                                {
                                "lang": "en",
                                "text": "Repentance",
                                "primary": True
                                },
                                {
                                "lang": "en",
                                "text": "Hilchot TeshuvaX",
                                "presentation": "alone"
                                }
                            ],
                            "nodes": [
                                {
                                    "key": "Introduction",
                                    "titles": [
                                        {
                                        "lang": "en",
                                        "text": "Introduction",
                                        "primary": True
                                        }
                                    ],
                                    "nodeType": "JaggedArrayNode",
                                    "depth": 0,
                                    "addressTypes": [],
                                    "sectionNames": []
                                },
                                {
                                    "key": "default",
                                    "default": True,
                                    "nodeType": "JaggedArrayNode",
                                    "depth": 2,
                                    "addressTypes": ["Integer", "Integer"],
                                    "sectionNames": ["Chapter", "Law"]
                                }
                            ]
                        }
                    ]
                }
            ]
        }

        i = Index({
            "schema": schema,
            "title": "Mishnah Torah Test",
            "categories": ["Halakhah"]
        })
        i.save()
        i.nodes.all_tree_titles("en")
        i.nodes.title_dict("en")
        schema['titles'] = sorted(schema['titles'], key=lambda x: x['text'])
        serialized = i.nodes.serialize()
        serialized['titles'] = sorted(serialized['titles'], key=lambda x: x['text'])
        assert schema == serialized

        Ref("Mishnah Torah Test, Introduction, Transmission")

        with pytest.raises(InputError):
            Ref("Mishnah Torah Test, Introduction, TransmisXsion")  # Mispelled last piece

        i.delete()

    def test_schema_load_2(self):
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
                    "text": 'ליקוטי מוהרן',  # took the " out from before final nun to avoid name conflict
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
                            "text": 'הסכמות',
                            "primary": True
                        }
                    ],
                    "nodeType": "JaggedArrayNode",
                    "depth": 1,
                    "addressTypes": ["Integer"],
                    "sectionNames": ["Approbation"]
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
                            "text": "הקדמה",
                            "primary": True
                        }
                    ],
                    "nodeType": "JaggedArrayNode",
                    "depth": 1,
                    "addressTypes": ["Integer"],
                    "sectionNames": ["Paragraph"]
                },
                {
                    "key": "default",
                    "default": True,
                    "nodeType": "JaggedArrayNode",
                    "depth": 3,
                    "addressTypes": ["Integer", "Integer", "Integer"],
                    "sectionNames": ["Torah", "Section", "Paragraph"]
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
                            "text": 'תנינא',
                            "primary": True
                        }
                    ],
                    "nodes": [
                        {
                            "key": "default",
                            "default": True,
                            "nodeType": "JaggedArrayNode",
                            "depth": 3,
                            "addressTypes": ["Integer", "Integer", "Integer"],
                            "sectionNames": ["Torah", "Section", "Paragraph"]
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
                                    "text": 'מכתב יד',
                                    "primary": True
                                }
                            ],
                            "nodeType": "JaggedArrayNode",
                            "depth": 2,
                            "addressTypes": ["Integer", "Integer"],
                            "sectionNames": ["Letter", "Paragraph"]
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

        assert len(i.nodes.children) == 4
        assert library.get_schema_node("Lekutei Moharan, Introduction").next_leaf() == library.get_schema_node("Lekutei Moharan")
        assert library.get_schema_node("Lekutei Moharan").next_leaf() == library.get_schema_node("Lekutei Moharan, Tanina")
        assert library.get_schema_node("Lekutei Moharan, Tanina").next_leaf() == library.get_schema_node("Lekutei Moharan, Tanina, Letters")

        assert library.get_schema_node("Lekutei Moharan, Tanina, Letters").prev_leaf() == library.get_schema_node("Lekutei Moharan, Tanina")
        assert library.get_schema_node("Lekutei Moharan, Tanina").prev_leaf() == library.get_schema_node("Lekutei Moharan")
        assert library.get_schema_node("Lekutei Moharan").prev_leaf() == library.get_schema_node("Lekutei Moharan, Introduction")

        lm_schema['titles'] = sorted(lm_schema['titles'], key=lambda x: x['text'])
        serialized = i.nodes.serialize()
        serialized['titles'] = sorted(serialized['titles'], key=lambda x: x['text'])
        assert lm_schema == serialized

        i.delete()

    def test_sharedTitles(self):
        i = Index().load({"title": "Parshanut Test"})
        if i:
            i.delete()
        schema = {
            "key": "Parshanut Test",
            "titles": [
                {
                    "lang": "en",
                    "text": "Parshanut Test",
                    "primary": True
                },
                {
                    "lang": "he",
                    "text": 'כגכג',
                    "primary": True
                }
            ],
            "nodes": [
                {
                    "key": "Bereshit",
                    "sharedTitle": "Bereshit",
                    "nodeType": "JaggedArrayNode",
                    "depth": 1,
                    "addressTypes": ["Integer"],
                    "sectionNames": ["Torah"]
                },
                {
                    "key": "Noach",
                    "sharedTitle": "Noach",
                    "nodeType": "JaggedArrayNode",
                    "depth": 1,
                    "addressTypes": ["Integer"],
                    "sectionNames": ["Torah"]
                },
                {
                    "key": "Lech Lecha",
                    "sharedTitle": "Lech Lecha",
                    "nodeType": "JaggedArrayNode",
                    "depth": 1,
                    "addressTypes": ["Integer"],
                    "sectionNames": ["Torah"]
                }
            ]
        }
        i = Index({
            "schema": schema,
            "title": "Parshanut Test",
            "categories": ["Chasidut"]
        })
        i.save()
        i.nodes.all_tree_titles("en")
        i.nodes.title_dict("en")
        schema['titles'] = sorted(schema['titles'], key=lambda x: x['text'])
        serialized = i.nodes.serialize()
        serialized['titles'] = sorted(serialized['titles'], key=lambda x: x['text'])
        assert schema == serialized
        i.delete()

    def test_alt_struct(self):
        i = Index().load({"title": "Altstest"})
        if i:
            i.delete()
        schema = {
            "key": "Altstest",
            "titles": [
                {
                    "lang": "en",
                    "text": "Altstest",
                    "primary": True
                },
                {
                    "lang": "he",
                    "text": 'כגככגגגגג',
                    "primary": True
                }
            ],
            "nodeType": "JaggedArrayNode",
            "depth": 2,
            "addressTypes": ["Integer", "Integer"],
            "sectionNames": ["Chapter","Verse"]
        }

        structs = {
            "parasha": {
                "nodes": [
                    {
                        'sharedTitle': 'Shemot',
                        "nodeType": "ArrayMapNode",
                        "depth": 1,
                        "addressTypes": ["Integer"],
                        "sectionNames": ["Aliyah"],
                        'wholeRef': 'Altstest 1:1-6:1',
                        'refs': [
                                "Altstest 1:1-1:17",
                                "Altstest 1:18-2:10",
                                "Altstest 2:11-2:25",
                                "Altstest 3:1-3:15",
                                "Altstest 3:16-4:17",
                                "Altstest 4:18-4:31",
                                "Altstest 5:1-6:1",
                        ]
                    },
                    {
                        'sharedTitle': 'Vaera',
                        "nodeType": "ArrayMapNode",
                        "depth": 1,
                        "addressTypes": ["Integer"],
                        "sectionNames": ["Aliyah"],
                        'wholeRef': 'Altstest 6:2-9:35',
                        'refs': [
                            "Altstest 10:1-10:11",
                            "Altstest 10:12-10:23",
                            "Altstest 10:24-11:3",
                            "Altstest 11:4-12:20",
                            "Altstest 12:21-12:28",
                            "Altstest 12:29-12:51",
                            "Altstest 13:1-13:16",
                        ]
                    },
                ]
            }
        }

        creating_dict = {
            "schema": schema,
            "title": "Altstest",
            "categories": ["Chasidut"],
            "alt_structs": structs
        }
        i = Index(creating_dict)
        i.save()
        i.nodes.all_tree_titles("en")
        i.nodes.title_dict("en")
        schema['titles'] = sorted(schema['titles'], key=lambda x: x['text'])
        serialized = i.nodes.serialize()
        serialized['titles'] = sorted(serialized['titles'], key=lambda x: x['text'])
        assert schema == serialized

        contents =  i.contents(raw=True)
        contents['schema']['titles'] = sorted(contents['schema']['titles'], key=lambda x: x['text'])
        creating_dict['schema']['titles'] = sorted(creating_dict['schema']['titles'], key=lambda x: x['text'])
        assert contents == creating_dict

        assert Ref("Altstest, Vaera 3") == Ref("Altstest 10:24-11:3")
        assert Ref("Altstest, Vaera") == Ref("Altstest 6:2-9:35")

        with pytest.raises(InputError):
            Ref("Altstest, Foobar")

        with pytest.raises(InputError):
            Ref("Altstest, Foobar 3")

        with pytest.raises(InputError):
            Ref("Altstest, Vaera 12")

        i.delete()

    def test_complex_with_alt_struct(self):
        i = Index().load({"title": "CAtest"})
        if i:
            i.delete()
        schema = {
            "key": "CAtest",
            "titles": [
                {
                    "lang": "en",
                    "text": "CAtest",
                    "primary": True
                },
                {
                    "lang": "he",
                    "text": 'כגככג',
                    "primary": True
                }
            ],
            "nodes": [
                {
                    "key": "child_one",
                    "nodeType": "JaggedArrayNode",
                    "depth": 2,
                    "addressTypes": ["Integer", "Integer"],
                    "sectionNames": ["Chapter", "Verse"],
                    "titles": [
                        {
                            "lang": "en",
                            "text": "Kid",
                            "primary": True
                        },
                        {
                            "lang": "he",
                            "text": 'ילד',
                            "primary": True
                        }
                    ],
                },
                {
                    "key": "child_two",
                    "nodeType": "JaggedArrayNode",
                    "depth": 2,
                    "addressTypes": ["Integer", "Integer"],
                    "sectionNames": ["Chapter", "Verse"],
                    "titles": [
                        {
                            "lang": "en",
                            "text": "Other Kid",
                            "primary": True
                        },
                        {
                            "lang": "he",
                            "text": 'ילד אחר',
                            "primary": True
                        }
                    ],
                }
            ]
        }

        structs = {
            "parasha": {
                "nodes": [
                    {
                        'sharedTitle': 'Shemot',
                        "nodeType": "ArrayMapNode",
                        "depth": 1,
                        "addressTypes": ["Integer"],
                        "sectionNames": ["Aliyah"],
                        'wholeRef': 'CAtest, Kid 1:1-6:1',
                        'refs': [
                                "CAtest, Kid 1:1-1:17",
                                "CAtest, Kid 1:18-2:10",
                                "CAtest, Kid 2:11-2:25",
                                "CAtest, Kid 3:1-3:15",
                                "CAtest, Kid 3:16-4:17",
                                "CAtest, Kid 4:18-4:31",
                                "CAtest, Kid 5:1-6:1",
                        ]
                    },
                    {
                        'sharedTitle': 'Vaera',
                        "nodeType": "ArrayMapNode",
                        "depth": 1,
                        "addressTypes": ["Integer"],
                        "sectionNames": ["Aliyah"],
                        'wholeRef': 'CAtest, Kid 6:2-9:35',
                        'refs': [
                            "CAtest, Kid 10:1-10:11",
                            "CAtest, Kid 10:12-10:23",
                            "CAtest, Kid 10:24-11:3",
                            "CAtest, Kid 11:4-12:20",
                            "CAtest, Kid 12:21-12:28",
                            "CAtest, Kid 12:29-12:51",
                            "CAtest, Kid 13:1-13:16",
                        ]
                    },
                ]
            }
        }

        creating_dict = {
            "schema": schema,
            "title": "CAtest",
            "categories": ["Chasidut"],
            "alt_structs": structs
        }
        i = Index(creating_dict)
        i.save()
        i.nodes.all_tree_titles("en")
        i.nodes.title_dict("en")
        schema['titles'] = sorted(schema['titles'], key=lambda x: x['text'])
        serialized = i.nodes.serialize()
        serialized['titles'] = sorted(serialized['titles'], key=lambda x: x['text'])
        assert schema == serialized

        contents = i.contents(raw=True)
        contents['schema']['titles'] = sorted(contents['schema']['titles'], key=lambda x: x['text'])
        creating_dict['schema']['titles'] = sorted(creating_dict['schema']['titles'], key=lambda x: x['text'])
        assert contents == creating_dict

        assert Ref("CAtest, Vaera 3") == Ref("CAtest, Kid 10:24-11:3")
        assert Ref("CAtest, Vaera") == Ref("CAtest, Kid 6:2-9:35")

        with pytest.raises(InputError):
            Ref("CAtest, Foobar")

        with pytest.raises(InputError):
            Ref("CAtest, Foobar 3")

        with pytest.raises(InputError):
            Ref("CAtest, Vaera 12")

        i.delete()

    def test_numbered_primary_struct(self):
        i = Index().load({"title": "NumbPrimeTest"})
        if i:
            i.delete()
        schema = {
            "key": "NumbPrimeTest",
            "titles": [
                {
                    "lang": "en",
                    "text": "NumbPrimeTest",
                    "primary": True
                },
                {
                    "lang": "he",
                    "text": 'כגכעגעגהכג',
                    "primary": True
                }
            ],
            "nodeType": "JaggedArrayNode",
            "sectionNames": ["Parasha"],
            "addressTypes": ["Integer"],
            "depth": 1,
            "nodes": [
                {
                    "key": "s1",
                    'sharedTitle': 'Shemot',
                    "nodeType": "JaggedArrayNode",
                    "depth": 1,
                    "addressTypes": ["Integer"],
                    "sectionNames": ["Vort"],
                },
                {
                    "key": "s2",
                    'sharedTitle': 'Vaera',
                    "nodeType": "JaggedArrayNode",
                    "depth": 1,
                    "addressTypes": ["Integer"],
                    "sectionNames": ["Vort"],
                },
                {
                    "key": "s3",
                    'sharedTitle': 'Bo',
                    "nodeType": "JaggedArrayNode",
                    "depth": 1,
                    "addressTypes": ["Integer"],
                    "sectionNames": ["Vort"],
                },
                {
                    "key": "s4",
                    'sharedTitle': 'Beshalach',
                    "nodeType": "JaggedArrayNode",
                    "depth": 1,
                    "addressTypes": ["Integer"],
                    "sectionNames": ["Vort"],
                },
            ]
        }

        creating_dict = {
            "schema": schema,
            "title": "NumbPrimeTest",
            "categories": ["Chasidut"],
        }
        i = Index(creating_dict)
        i.save()
        i.nodes.all_tree_titles("en")
        i.nodes.title_dict("en")
        schema['titles'] = sorted(schema['titles'], key=lambda x: x['text'])
        serialized = i.nodes.serialize()
        serialized['titles'] = sorted(serialized['titles'], key=lambda x: x['text'])
        assert schema == serialized
        contents = i.contents(raw=True)
        contents['schema']['titles'] = sorted(contents['schema']['titles'], key=lambda x: x['text'])
        creating_dict['schema']['titles'] = sorted(creating_dict['schema']['titles'], key=lambda x: x['text'])
        assert contents == creating_dict

        assert Ref("NumbPrimeTest 3:5") == Ref("NumbPrimeTest, Bo 5")
        assert Ref("NumbPrimeTest 3") == Ref("NumbPrimeTest, Bo")

        with pytest.raises(InputError):
            Ref("NumbPrimeTest, Foobar")

        with pytest.raises(InputError):
            Ref("NumbPrimeTest, Foobar 3")

        i.delete()

    def test_numbered_alt_struct(self):
        i = Index().load({"title": "Stest"})
        if i:
            i.delete()
        schema = {
            "key": "Stest",
            "titles": [
                {
                    "lang": "en",
                    "text": "Stest",
                    "primary": True
                },
                {
                    "lang": "he",
                    "text": 'כגככג',
                    "primary": True
                }
            ],
            "nodeType": "JaggedArrayNode",
            "depth": 2,
            "addressTypes": ["Integer", "Integer"],
            "sectionNames": ["Chapter", "Verse"]
        }

        structs = {
            "parasha": {
                "nodeType": "NumberedTitledTreeNode",
                "sectionNames": ["Chapter"],
                "addressTypes": ["Perek"],
                "depth": 1,
                "nodes": [
                    {
                        'sharedTitle': 'Shemot',
                        "nodeType": "ArrayMapNode",
                        "depth": 1,
                        "addressTypes": ["Integer"],
                        "sectionNames": ["Aliyah"],
                        'wholeRef': 'Stest 1:1-6:1',
                        'refs': [
                                "Stest 1:1-1:17",
                                "Stest 1:18-2:10",
                                "Stest 2:11-2:25",
                                "Stest 3:1-3:15",
                                "Stest 3:16-4:17",
                                "Stest 4:18-4:31",
                                "Stest 5:1-6:1",
                        ]
                    },
                    {
                        'sharedTitle': 'Vaera',
                        "nodeType": "ArrayMapNode",
                        "depth": 1,
                        "addressTypes": ["Integer"],
                        "sectionNames": ["Aliyah"],
                        'wholeRef': 'Stest 6:2-9:35',
                        'refs': [
                            "Stest 10:1-10:11",
                            "Stest 10:12-10:23",
                            "Stest 10:24-11:3",
                            "Stest 11:4-12:20",
                            "Stest 12:21-12:28",
                            "Stest 12:29-12:51",
                            "Stest 13:1-13:16",
                        ]
                    },
                ]
            }
        }

        creating_dict = {
            "schema": schema,
            "title": "Stest",
            "categories": ["Chasidut"],
            "alt_structs": structs
        }
        i = Index(creating_dict)
        i.save()
        i.nodes.all_tree_titles("en")
        i.nodes.title_dict("en")
        schema['titles'] = sorted(schema['titles'], key=lambda x: x['text'])
        serialized = i.nodes.serialize()
        serialized['titles'] = sorted(serialized['titles'], key=lambda x: x['text'])
        assert schema == serialized
        contents =  i.contents(raw=True)
        contents['schema']['titles'] = sorted(contents['schema']['titles'], key=lambda x: x['text'])
        creating_dict['schema']['titles'] = sorted(creating_dict['schema']['titles'], key=lambda x: x['text'])
        assert contents == creating_dict

        assert Ref("Stest Perek 2:3") == Ref("Stest, Vaera 3")
        assert Ref("Stest Perek 2:3") == Ref("Stest 10:24-11:3")

        i.delete()

    def test_quick_initialization(self):
        old_style = JaggedArrayNode()
        old_style.add_title('Title', 'en', primary=True)
        old_style.add_title('כותרת', 'he', primary=True)
        old_style.key = 'Title'
        old_style.sectionNames = ['Chapter', 'Verse']
        old_style.addressTypes = ['Integer', 'Integer']
        old_style.depth = 2

        quick_way = JaggedArrayNode()
        quick_way.add_primary_titles('Title', 'כותרת')
        quick_way.add_structure(['Chapter', 'Verse'])

        assert quick_way.serialize() == old_style.serialize()

class Test_Default_Nodes(object):
    @classmethod
    def setup_class(cls):
        pass

    @classmethod
    def teardown_class(cls):
        v = Version().load({"title":"Chofetz Chaim", "versionTitle": "test_default_node"})
        if v:
            v.delete()

    def test_derivations(self):
        ref = Ref("Chofetz_Chaim,_Part_One,_The_Prohibition_Against_Lashon_Hara,_Principle_1")
        assert ref.has_default_child()
        child_ref = ref.default_child_ref()
        assert ref != child_ref

        sn = ref.index_node
        assert isinstance(sn, SchemaNode)
        assert not sn.is_default()
        assert sn.has_default_child()
        dnode = sn.get_default_child()
        assert dnode.is_default()


    def test_default_in_leaf_nodes(self):
        sn = Ref("Chofetz_Chaim,_Part_One,_The_Prohibition_Against_Lashon_Hara,_Principle_1").index_node
        assert isinstance(sn, SchemaNode)
        dnode = sn.get_default_child()
        root = sn.root()
        leaves = root.get_leaf_nodes()
        assert dnode in leaves
        assert sn not in leaves

    def test_load_default_text_chunk(self):
        ref = Ref("Chofetz_Chaim,_Part_One,_The_Prohibition_Against_Lashon_Hara,_Principle_1")
        TextChunk(ref)

    def test_load_default_text_chunk(self):
        ref = Ref("Chofetz_Chaim,_Part_One,_The_Prohibition_Against_Lashon_Hara,_Principle_1")
        tc = TextChunk(ref, "en", "test_default_node")
        tc.text = [["Foo", "Bar", "Blitz"],["Glam", "Blam", "Flam"]]
        tc.save()
        subref = Ref("Chofetz_Chaim,_Part_One,_The_Prohibition_Against_Lashon_Hara,_Principle_1.2.3")
        assert TextChunk(subref, "en", "test_default_node").text == "Flam"