import pytest
from django.core.exceptions import ValidationError

from sefaria.helper.webpages import normalize_url
from sefaria.model.webpage_text import WebPageText
from sefaria.system.exceptions import DuplicateRecordError


@pytest.fixture()
def webpage_text_unnormalized_input():
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


@pytest.fixture()
def webpage_text_duplicate_base():
	data = {
		"url": "https://example.com/dup-page?utm_source=one",
		"title": "Title 1",
		"body": "Body 1",
	}
	webpage_text = WebPageText(data)
	webpage_text.save()
	yield {"webpage_text": webpage_text, "data": data}
	webpage_text.delete()


@pytest.fixture()
def webpage_text_upsert_data():
	data = {
		"url": "https://example.com/upsert-page?utm_source=test",
		"title": "Initial Title",
		"body": "Initial body",
	}
	yield data
	loaded = WebPageText().load(data["url"])
	if loaded:
		loaded.delete()


def test_webpage_text_normalizes_url_on_save_and_load(webpage_text_unnormalized_input):
	data = webpage_text_unnormalized_input["data"]
	normalized_url = normalize_url(data["url"])
	loaded = WebPageText().load(normalized_url)
	assert loaded is not None
	assert loaded.url == normalized_url


def test_webpage_text_load_accepts_string_url(webpage_text_other):
	loaded = WebPageText().load("http://www.example.com/another-page?utm_source=test")
	assert loaded is not None
	assert loaded.url == normalize_url(webpage_text_other["data"]["url"])


def test_webpage_text_invalid_url_rejected():
	data = {
		"url": "not-a-url",
		"title": "Bad URL",
		"body": "Body",
	}
	with pytest.raises(ValidationError):
		WebPageText(data).save()


def test_webpage_text_duplicate_url_rejected(webpage_text_duplicate_base):
	with pytest.raises(DuplicateRecordError):
		WebPageText({
			"url": "http://www.example.com/dup-page#frag",
			"title": "Title 2",
			"body": "Body 2",
		}).save()


def test_webpage_text_add_or_update_upserts(webpage_text_upsert_data):
	status, webpage_text = WebPageText.add_or_update(webpage_text_upsert_data)
	assert status == "saved"
	assert webpage_text is not None
	status_again, same_webpage_text = WebPageText.add_or_update(webpage_text_upsert_data)
	assert status_again == "excluded"
	assert same_webpage_text is not None

	updated = {
		"url": "http://www.example.com/upsert-page#hash",
		"title": "Updated Title",
		"body": "Updated body",
	}
	status_updated, updated_webpage_text = WebPageText.add_or_update(updated)
	assert status_updated == "saved"
	assert updated_webpage_text is not None

	loaded = WebPageText().load(webpage_text_upsert_data["url"])
	assert loaded is not None
	assert loaded.title == "Updated Title"
	assert loaded.body == "Updated body"
	assert loaded.url == normalize_url(webpage_text_upsert_data["url"])
