import pytest
from django.core.exceptions import ValidationError

from sefaria.model.webpage import WebPage
from sefaria.model.webpage_text import WebPageText


@pytest.fixture()
def webpage_text_normalized():
	data = {
		"url": "http://www.example.com/page?utm_source=test#section",
		"title": "Example Title",
		"body": "Example body text.",
	}
	webpage_text = WebPageText(data)
	webpage_text.save()
	yield {"webpage_text": webpage_text, "data": data}
	webpage_text.delete()


@pytest.fixture()
def webpage_text_other():
	data = {
		"url": "https://example.com/another-page",
		"title": "Another Title",
		"body": "Another body.",
	}
	webpage_text = WebPageText(data)
	webpage_text.save()
	yield {"webpage_text": webpage_text, "data": data}
	webpage_text.delete()


def test_webpage_text_normalizes_url_on_save_and_load(webpage_text_normalized):
	data = webpage_text_normalized["data"]
	normalized_url = WebPage.normalize_url(data["url"])
	loaded = WebPageText().load(normalized_url)
	assert loaded is not None
	assert loaded.url == normalized_url


def test_webpage_text_load_accepts_string_url(webpage_text_other):
	loaded = WebPageText().load("http://www.example.com/another-page?utm_source=test")
	assert loaded is not None
	assert loaded.url == WebPage.normalize_url(webpage_text_other["data"]["url"])


def test_webpage_text_invalid_url_rejected():
	data = {
		"url": "not-a-url",
		"title": "Bad URL",
		"body": "Body",
	}
	with pytest.raises(ValidationError):
		WebPageText(data).save()
