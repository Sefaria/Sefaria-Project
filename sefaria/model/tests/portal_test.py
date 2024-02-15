import pytest
from sefaria.model.portal import Portal  # Replace with your actual validation function
from sefaria.model.topic import Topic
from sefaria.system.exceptions import SluggedMongoRecordMissingError
from sefaria.system.database import db

valids = [
    {
        "slug": "English Title",
        "name": {"en": "a", "he": "b"},
        "about": {
            "title": {
                "en": "English Title",
                "he": "Hebrew Title"
            },
            "title_url": "https://example.com",
            "image_uri": "gs://your-bucket/image.jpg",
            "description": {
                "en": "English Description",
                "he": "Hebrew Description"
            }
        },
        "mobile": {
            "title": {
                "en": "Mobile Title",
                "he": "Mobile Hebrew Title"
            },
            "android_link": "https://android-link.com",
            "ios_link": "https://ios-link.com"
        },
        "newsletter": {
            "title": {
                "en": "Newsletter Title",
                "he": "Newsletter Hebrew Title"
            },
            "description": {
                "en": "Newsletter English Description",
                "he": "Newsletter Hebrew Description"
            },
            "api_schema": {
                "http_method": "POST",
                "payload": {
                    "first_name_key": "fname",
                    "last_name_key": "lname",
                    "email_key": "email"
                }
            }
        }
    },
    {
        "slug": "English Title",
        "name": {"en": "a", "he": "b"},
        "about": {
            "title": {
                "en": "English Title",
                "he": "Hebrew Title"
            },
            "description": {
                "en": "English Description",
                "he": "Hebrew Description"
            }
        },
        "mobile": {
            "title": {
                "en": "Mobile Title",
                "he": "Mobile Hebrew Title"
            }
        },
        "newsletter": {
            "title": {
                "en": "Newsletter Title",
                "he": "Newsletter Hebrew Title"
            },
            "api_schema": {
                "http_method": "GET"
            }
        }
    },
{
        "slug": "English Title",
        "name": {"en": "a", "he": "b"},
        "about": {
            "title": {
                "en": "English Title",
                "he": "Hebrew Title"
            },
            "title_url": "https://example.com",
            "image_uri": "gs://your-bucket/image.jpg",
            "description": {
                "en": "English Description",
                "he": "Hebrew Description"
            }
        },
        "mobile": {
            "title": {
                "en": "Mobile Title",
                "he": "Mobile Hebrew Title"
            },
            "android_link": "https://android-link.com",
            "ios_link": "https://ios-link.com"
        },
        "newsletter": {
            "title": {
                "en": "Newsletter Title",
                "he": "Newsletter Hebrew Title"
            },
            "description": {
                "en": "Newsletter English Description",
                "he": "Newsletter Hebrew Description"
            },
            "api_schema": {
                "http_method": "POST",
                "payload": {
                    "first_name_key": "fname",
                    "last_name_key": "lname",
                    "email_key": "email"
                }
            }
        }
    },
    {
        "slug": "English Title",
        "name": {"en": "a", "he": "b"},
        "about": {
            "title": {
                "en": "English Title",
                "he": "Hebrew Title"
            }
        },
        "mobile": {
            "title": {
                "en": "Mobile Title",
                "he": "Mobile Hebrew Title"
            }
        },
        "newsletter": {
            "title": {
                "en": "Newsletter Title",
                "he": "Newsletter Hebrew Title"
            },
            "api_schema": {
                "http_method": "GET"
            }
        }
    },
    {
        "slug": "English Title",
        "name": {"en": "a", "he": "b"},
        "about": {
            "title": {
                "en": "English Title",
                "he": "Hebrew Title"
            }
        },
        "mobile": {
            "title": {
                "en": "Mobile Title",
                "he": "Mobile Hebrew Title"
            },
            "android_link": "https://android-link.com"
        },
        "newsletter": {
            "title": {
                "en": "Newsletter Title",
                "he": "Newsletter Hebrew Title"
            }
        }
    },
    {
        "slug": "English Title",
        "name": {"en": "a", "he": "b"},
        "about": {
            "title": {
                "en": "English Title",
                "he": "Hebrew Title"
            },
            "title_url": "https://example.com",
            "image_uri": "gs://your-bucket/image.jpg",
            "description": {
                "en": "English Description",
                "he": "Hebrew Description"
            }
        },
        "mobile": {
            "title": {
                "en": "Mobile Title",
                "he": "Mobile Hebrew Title"
            },
            "android_link": "https://android-link.com",
            "ios_link": "https://ios-link.com"
        },
        "newsletter": {
            "title": {
                "en": "Newsletter Title",
                "he": "Newsletter Hebrew Title"
            },
            "description": {
                "en": "Newsletter English Description",
                "he": "Newsletter Hebrew Description"
            },
            "api_schema": {
                "http_method": "POST",
                "payload": {
                    "first_name_key": "fname",
                    "last_name_key": "lname",
                    "email_key": "email"
                }
            }
        }
    },
    {
        "slug": "English Title",
        "name": {"en": "a", "he": "b"},
        "about": {
            "title": {
                "en": "English Title",
                "he": "Hebrew Title"
            }
        },
        "mobile": {
            "title": {
                "en": "Mobile Title",
                "he": "Mobile Hebrew Title"
            }
        },
        "newsletter": {
            "title": {
                "en": "Newsletter Title",
                "he": "Newsletter Hebrew Title"
            },
            "api_schema": {
                "http_method": "GET"
            }
        }
    },
    {
        "slug": "English Title",
        "name": {"en": "a", "he": "b"},
        "about": {
            "title": {
                "en": "English Title",
                "he": "Hebrew Title"
            },
            "image_uri": "gs://your-bucket/image.jpg"
        },
        "mobile": {
            "title": {
                "en": "Mobile Title",
                "he": "Mobile Hebrew Title"
            }
        },
        "newsletter": {
            "title": {
                "en": "Newsletter Title",
                "he": "Newsletter Hebrew Title"
            },
            "api_schema": {
                "http_method": "POST",
                "payload": {
                    "first_name_key": "fname",
                    "last_name_key": "lname",
                    "email_key": "email"
                }
            }
        }
    },
    {
        "slug": "English Title",
        "name": {"en": "a", "he": "b"},
        "about": {
            "title": {
                "en": "About Us",
                "he": "עלינו"
            }
        }
    }
]

invalids = [
    # Missing "about" key
    {
        "slug": "English Title",
        "name": {"en": "a", "he": "b"},
        "mobile": {
            "title": {
                "en": "Mobile Title",
                "he": "Mobile Hebrew Title"
            },
            "android_link": "https://android-link.com",
            "ios_link": "https://ios-link.com"
        },
        "newsletter": {
            "title": {
                "en": "Newsletter Title",
                "he": "Newsletter Hebrew Title"
            },
            "api_schema": {
                "http_method": "POST",
                "payload": {
                    "first_name_key": "fname",
                    "last_name_key": "lname",
                    "email_key": "email"
                }
            }
        }
    },
    # Invalid "about.title_url" (not a URL)
    {
        "slug": "English Title",
        "name": {"en": "a", "he": "b"},
        "about": {
            "title": {
                "en": "English Title",
                "he": "Hebrew Title"
            },
            "title_url": "invalid-url",
            "image_uri": "gs://your-bucket/image.jpg",
            "description": {
                "en": "English Description",
                "he": "Hebrew Description"
            }
        },
        "mobile": {
            "title": {
                "en": "Mobile Title",
                "he": "Mobile Hebrew Title"
            },
            "android_link": "https://android-link.com",
            "ios_link": "https://ios-link.com"
        },
        "newsletter": {
            "title": {
                "en": "Newsletter Title",
                "he": "Newsletter Hebrew Title"
            },
            "description": {
                "en": "Newsletter English Description",
                "he": "Newsletter Hebrew Description"
            },
            "api_schema": {
                "http_method": "POST",
                "payload": {
                    "first_name_key": "fname",
                    "last_name_key": "lname",
                    "email_key": "email"
                }
            }
        }
    },
    # Including invalid field "newsletter.description.fr"
    {
        "slug": "English Title",
        "name": {"en": "a", "he": "b"},
        "about": {
            "title": {
                "en": "English Title",
                "he": "Hebrew Title"
            },
            "title_url": "https://example.com",
            "image_uri": "gs://your-bucket/image.jpg",
            "description": {
                "en": "English Description",
                "he": "Hebrew Description"
            }
        },
        "mobile": {
            "title": {
                "en": "Mobile Title",
                "he": "Mobile Hebrew Title"
            },
            "android_link": "https://android-link.com"
        },
        "newsletter": {
            "title": {
                "fr": "Titre de la newsletter",
                "he": "Newsletter Hebrew Title"
            },
            "description": {
                "en": "Newsletter English Description",
                "he": "Newsletter Hebrew Description"
            },
            "api_schema": {
                "http_method": "POST",
                "payload": {
                    "first_name_key": "fname",
                    "last_name_key": "lname",
                    "email_key": "email"
                }
            }
        }
    },
    # Invalid "newsletter.api_schema.http_method" (not a valid HTTP method)
    {
        "slug": "English Title",
        "name": {"en": "a", "he": "b"},
        "about": {
            "title": {
                "en": "English Title",
                "he": "Hebrew Title"
            },
            "image_uri": "gs://your-bucket/image.jpg",
            "description": {
                "en": "English Description",
                "he": "Hebrew Description"
            }
        },
        "mobile": {
            "title": {
                "en": "Mobile Title",
                "he": "Mobile Hebrew Title"
            },
            "android_link": "https://android-link.com",
            "ios_link": "https://ios-link.com"
        },
        "newsletter": {
            "title": {
                "en": "Newsletter Title",
                "he": "Newsletter Hebrew Title"
            },
            "description": {
                "en": "Newsletter English Description",
                "he": "Newsletter Hebrew Description"
            },
            "api_schema": {
                "http_method": "INVALID_METHOD",
                "payload": {
                    "first_name_key": "fname",
                    "last_name_key": "lname",
                    "email_key": "email"
                }
            }
        }
    },
    # Invalid data types:
    {
        "slug": "English Title",
        "name": {"en": "a", "he": "b"},
        "about": {
            "title": {
                "en": "About Us",
                "he": "ང་ཚོའི་སྐོར།"
            },
            "image_uri": 67890,
            "description": {
                "en": "Description in English",
                "he": "བོད་ཡིག་ནང་འགྲེལ་བ།"
            }
        }
    },
{
    # Incorrect field names
    "slug": "English Title",
    "name": {"en": "a", "he": "b"},
    "about": {
        "title": {
            "en": "About Us",
            "he": "ང་ཚོའི་སྐོར།"
        },
        "image_uri": "gs://bucket/image.jpg",
        "description": {
            "en": "Description in English",
            "he": " བོད་ཡིག་ནང་འགྲེལ་བ།"
        }
    },
    "mobile": {
        "title": {
            "en": "Mobile App",
            "he": "ཁ་པར་མཉེན་ཆས།"
        },
        "android_link": "https://play.google.com/store/apps/details?id=com.example.app",
        "ios_link": "https://apps.apple.com/us/app/example-app/id1234567890",
        "invalid_field": "This field should not be here"
    }
}


]
@pytest.mark.parametrize("data", valids)
def test_valid_schema(data):
    p = Portal(data)
    assert p._validate() == True

@pytest.mark.parametrize("invalid_case", invalids)
def test_invalid_schema(invalid_case):
    with pytest.raises(Exception):
        p = Portal(invalid_case)
        p._validate()


@pytest.fixture()
def simple_portal():
    raw_portal = valids[0]
    portal = Portal(raw_portal)
    portal.save()

    yield portal

    portal.delete()


@pytest.fixture()
def simple_portal_saved_directly_to_mongo():
    raw_portal = valids[0]
    inserted_result = db.portals.insert_one(raw_portal)

    yield Portal(raw_portal)

    db.portals.delete_one({"_id": inserted_result.inserted_id})


@pytest.fixture()
def simple_topic(simple_portal):
    topic = Topic({
        "slug": "blah",
        "titles": [{"text": "Blah", "lang": "en", "primary": True}],
        "portal_slug": simple_portal.slug,
    })
    topic.save()

    yield topic

    topic.delete()


def test_save_simple_portal(simple_portal):
    """
    Tests that simple_portal was saved properly and has a normalized slug
    """
    assert simple_portal.slug == "english-title"


def test_topic_validates_portal_exists(simple_topic):
    assert simple_topic is not None


def test_topic_validation_fails_for_non_existent_portal():
    with pytest.raises(SluggedMongoRecordMissingError):
        topic = Topic({
            "slug": "blah",
            "titles": [{"text": "Blah", "lang": "en", "primary": True}],
            "portal_slug": "non-existent-portal",
        })
        topic.save()


def test_load_portal(simple_portal_saved_directly_to_mongo):
    portal = Portal().load({"slug": simple_portal_saved_directly_to_mongo.slug})
    assert portal is not None
