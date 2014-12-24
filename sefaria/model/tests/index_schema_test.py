# -*- coding: utf-8 -*-

import pytest
import pprint
from sefaria.model import *

class Test_Schema(object):
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
                    "text": u"משנה תורה כאילו",
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
                            "text": u"הקדמה",
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
                            "nodeParameters": {
                                "depth": 1,
                                "addressTypes": ["Integer"],
                                "sectionNames": ["Paragraph"]
                            }
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
                            "nodeParameters": {
                                "depth": 1,
                                "addressTypes": ["Integer"],
                                "sectionNames": ["Mitzvah"]
                            }
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
                            "nodeParameters": {
                                "depth": 1,
                                "addressTypes": ["Integer"],
                                "sectionNames": ["Mitzvah"]
                            }
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
                                    "nodeParameters": {
                                        "depth": 0,
                                        "addressTypes": [],
                                        "sectionNames": []
                                    }       
                                },
                                {
                                    "key": "Laws",
                                    "default": True,
                                    "nodeType": "JaggedArrayNode",
                                    "nodeParameters": {
                                        "depth": 2,
                                        "addressTypes": ["Integer", "Integer"],
                                        "sectionNames": ["Chapter", "Law"]
                                    }
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
                                    "nodeParameters": {
                                        "depth": 0,
                                        "addressTypes": [],
                                        "sectionNames": []
                                    }   
                                },
                                {
                                    "key": "Laws",
                                    "default": True,
                                    "nodeType": "JaggedArrayNode",
                                    "nodeParameters": {
                                        "depth": 2,
                                        "addressTypes": ["Integer", "Integer"],
                                        "sectionNames": ["Chapter", "Law"]
                                    }
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
                                    "nodeParameters": {
                                        "depth": 0,
                                        "addressTypes": [],
                                        "sectionNames": []
                                    }   
                                },
                                {
                                    "key": "Laws",
                                    "default": True,
                                    "nodeType": "JaggedArrayNode",
                                    "nodeParameters": {
                                        "depth": 2,
                                        "addressTypes": ["Integer", "Integer"],
                                        "sectionNames": ["Chapter", "Law"]
                                    }
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
                                    "nodeParameters": {
                                        "depth": 0,
                                        "addressTypes": [],
                                        "sectionNames": []
                                    }   
                                },
                                {
                                    "key": "Laws",
                                    "default": True,
                                    "nodeType": "JaggedArrayNode",
                                    "nodeParameters": {
                                        "depth": 2,
                                        "addressTypes": ["Integer", "Integer"],
                                        "sectionNames": ["Chapter", "Law"]
                                    }
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
                                "text": "Hilchot Teshuva",
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
                                    "nodeParameters": {
                                        "depth": 0,
                                        "addressTypes": [],
                                        "sectionNames": []
                                    }   
                                },
                                {
                                    "key": "Laws",
                                    "default": True,
                                    "nodeType": "JaggedArrayNode",
                                    "nodeParameters": {
                                        "depth": 2,
                                        "addressTypes": ["Integer", "Integer"],
                                        "sectionNames": ["Chapter", "Law"]
                                    }
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
        assert schema == i.nodes.serialize()
        i.delete()


#todo : test default
#todo : test title schemes
