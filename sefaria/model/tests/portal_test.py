import pytest
from sefaria.model.portal import Portal  # Replace with your actual validation function

valids = [
    {
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
    }
]

invalids = [
    # Missing "about" key
    {
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
    # Missing required "mobile.ios_link"
    {
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
    # Invalid "newsletter.api_schema.http_method" (not a valid HTTP method)
    {
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
    }
]
def test_valid_schema():
    for case in valids:
        p = Portal(case)
        assert p._validate() == True

