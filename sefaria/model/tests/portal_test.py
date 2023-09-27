import pytest
from sefaria.model.portal import Portal  # Replace with your actual validation function

valids = [
    {
        "slug": "English Title",
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
            "title_url": "https://newsletter-url.com",
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
            "title_url": "https://newsletter-url.com",
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
            "title_url": "https://newsletter-url.com",
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
            "title_url": "https://newsletter-url.com",
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
            "title_url": "https://newsletter-url.com",
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
            "title_url": "https://newsletter-url.com",
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
        "about": {
            "title": {
                "en": "About Us",
                "he": "עלינו"
            },
            "title_url": 12345,
            "image_uri": 67890,
            "description": {
                "en": "Description in English",
                "he": "תיאור בעברית"
            }
        }
    },
{
    # Incorrect field names
    "slug": "English Title",
    "about": {
        "title": {
            "en": "About Us",
            "he": "עלינו"
        },
        "image_uri": "gs://bucket/image.jpg",
        "description": {
            "en": "Description in English",
            "he": "תיאור בעברית"
        }
    },
    "mobile": {
        "title": {
            "en": "Mobile App",
            "he": "אפליקציה ניידת"
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
