from typing import Callable
import json
import pytest
from unittest.mock import patch, Mock
from sefaria.google_storage_manager import GoogleStorageManager
from django.test import RequestFactory
from django.core.handlers.wsgi import WSGIRequest
import tarfile
import io
from sefaria.model.text import Ref, TextChunk
from sefaria.model.webpage import WebPage
from sefaria.settings import ENABLE_LINKER

if not ENABLE_LINKER:
    pytest.skip("Linker not enabled", allow_module_level=True)

from sefaria.helper import linker
import spacy


@pytest.fixture
def mock_oref() -> Ref:
    return Ref("Job 17")


@pytest.fixture
def spacy_model() -> spacy.Language:
    return spacy.blank('en')


class TestLoadSpacyModel:

    @staticmethod
    @pytest.fixture
    def tarfile_buffer() -> io.BytesIO:
        tar_buffer = io.BytesIO()
        with tarfile.open(fileobj=tar_buffer, mode='w:gz') as tar:
            tar.addfile(tarfile.TarInfo('test'))
        tar_buffer.seek(0)
        return tar_buffer

    @staticmethod
    @patch('spacy.load')
    def test_load_spacy_model_local(spacy_load_mock: Callable, spacy_model: spacy.Language):
        spacy_load_mock.return_value = spacy_model
        assert linker.load_spacy_model('local/path') == spacy_model

    @staticmethod
    @patch('spacy.load')
    @patch.object(GoogleStorageManager, 'get_filename')
    def test_load_spacy_model_cloud(get_filename_mock: Callable, spacy_load_mock: Callable, spacy_model: spacy.Language,
                                    tarfile_buffer: io.BytesIO):
        get_filename_mock.return_value = tarfile_buffer
        spacy_load_mock.return_value = spacy_model
        assert linker.load_spacy_model('gs://bucket_name/blob_name') == spacy_model

    @staticmethod
    @patch('spacy.load')
    @patch.object(GoogleStorageManager, 'get_filename')
    def test_load_spacy_model_cloud_invalid_path(get_filename_mock: Callable, spacy_load_mock: Callable,
                                                 spacy_model: spacy.Language, tarfile_buffer: io.BytesIO):
        get_filename_mock.return_value = tarfile_buffer
        spacy_load_mock.side_effect = OSError
        with pytest.raises(OSError):
            linker.load_spacy_model('invalid_path')


@pytest.fixture
def mock_request_post_data() -> dict:
    return {
        'text': {'title': 'title', 'body': 'body'},
        'version_preferences_by_corpus': {},
        'metaDataForTracking': {'url': 'https://test.com', 'title': 'title', 'description': 'description'}
    }


@pytest.fixture
def mock_request_post_data_without_meta_data(mock_request_post_data: dict) -> dict:
    del mock_request_post_data['metaDataForTracking']
    return mock_request_post_data


def make_mock_request(post_data: dict) -> WSGIRequest:
    factory = RequestFactory()
    request = factory.post('/api/find-refs', data=json.dumps(post_data), content_type='application/json')
    request.GET = {'with_text': '1', 'debug': '1', 'max_segments': '10'}
    return request


@pytest.fixture
def mock_request(mock_request_post_data: dict) -> WSGIRequest:
    return make_mock_request(mock_request_post_data)


@pytest.fixture
def mock_find_refs_text(mock_request: WSGIRequest) -> linker._FindRefsText:
    post_body = json.loads(mock_request.body)
    return linker._create_find_refs_text(post_body)


@pytest.fixture
def mock_find_refs_options(mock_request: WSGIRequest) -> linker._FindRefsTextOptions:
    post_body = json.loads(mock_request.body)
    return linker._create_find_refs_options(mock_request.GET, post_body)


@pytest.fixture
def mock_request_without_meta_data(mock_request_post_data_without_meta_data: dict) -> WSGIRequest:
    return make_mock_request(mock_request_post_data_without_meta_data)


@pytest.fixture
def mock_webpage() -> WebPage:
    # Note, the path of WebPage matches the path of the import we want to patch
    # NOT the location of the WebPage class
    with patch('sefaria.helper.linker.WebPage') as MockWebPage:
        mock_webpage = MockWebPage.return_value
        loaded_webpage = Mock()
        mock_webpage.load.return_value = loaded_webpage
        loaded_webpage.url = "test url"
        MockWebPage.add_or_update_from_linker.return_value = (None, loaded_webpage)
        yield loaded_webpage


class TestFindRefsHelperClasses:

    @patch('sefaria.utils.hebrew.is_hebrew', return_value=False)
    def test_find_refs_text(self, mock_is_hebrew: Mock):
        find_refs_text = linker._FindRefsText('title', 'body')
        mock_is_hebrew.assert_called_once_with('body')
        assert find_refs_text.lang == 'en'

    def test_find_refs_text_options(self):
        find_refs_text_options = linker._FindRefsTextOptions(True, True, 10, {})
        assert find_refs_text_options.debug
        assert find_refs_text_options.with_text
        assert find_refs_text_options.max_segments == 10
        assert find_refs_text_options.version_preferences_by_corpus == {}

    def test_create_find_refs_text(self, mock_request: WSGIRequest):
        post_body = json.loads(mock_request.body)
        find_refs_text = linker._create_find_refs_text(post_body)
        assert find_refs_text.title == 'title'
        assert find_refs_text.body == 'body'

    def test_create_find_refs_options(self, mock_request: WSGIRequest):
        post_body = json.loads(mock_request.body)
        find_refs_options = linker._create_find_refs_options(mock_request.GET, post_body)
        assert find_refs_options.with_text
        assert find_refs_options.debug
        assert find_refs_options.max_segments == 10
        assert find_refs_options.version_preferences_by_corpus == {}


class TestMakeFindRefsResponse:
    def test_make_find_refs_response_with_meta_data(self, mock_request: WSGIRequest, mock_webpage: Mock):
        response = linker.make_find_refs_response(mock_request)
        mock_webpage.add_hit.assert_called_once()
        mock_webpage.save.assert_called_once()

    def test_make_find_refs_response_without_meta_data(self, mock_request_without_meta_data: dict,
                                                       mock_webpage: Mock):
        response = linker.make_find_refs_response(mock_request_without_meta_data)
        mock_webpage.add_hit.assert_not_called()
        mock_webpage.save.assert_not_called()


class TestUnpackFindRefsRequest:
    def test_unpack_find_refs_request(self, mock_request: WSGIRequest):
        text, options, meta_data = linker._unpack_find_refs_request(mock_request)
        assert isinstance(text, linker._FindRefsText)
        assert isinstance(options, linker._FindRefsTextOptions)
        assert meta_data == {'url': 'https://test.com', 'description': 'description', 'title': 'title'}

    def test_unpack_find_refs_request_without_meta_data(self, mock_request_without_meta_data: dict):
        text, options, meta_data = linker._unpack_find_refs_request(mock_request_without_meta_data)
        assert isinstance(text, linker._FindRefsText)
        assert isinstance(options, linker._FindRefsTextOptions)
        assert meta_data is None


class TestAddWebpageHitForUrl:
    def test_add_webpage_hit_for_url(self, mock_webpage: Mock):
        linker._add_webpage_hit_for_url('https://test.com')
        mock_webpage.add_hit.assert_called_once()
        mock_webpage.save.assert_called_once()

    def test_add_webpage_hit_for_url_no_url(self, mock_webpage: Mock):
        linker._add_webpage_hit_for_url(None)
        mock_webpage.add_hit.assert_not_called()
        mock_webpage.save.assert_not_called()


class TestFindRefsResponseLinkerV3:

    @pytest.fixture
    def mock_get_ref_resolver(self, spacy_model: spacy.Language):
        from sefaria.model.text import library
        with patch.object(library, 'get_ref_resolver') as mock_get_ref_resolver:
            mock_ref_resolver = Mock()
            mock_ref_resolver._raw_ref_model_by_lang = {"en": spacy_model}
            mock_get_ref_resolver.return_value = mock_ref_resolver
            mock_ref_resolver.bulk_resolve_refs.return_value = [[]]
            yield mock_get_ref_resolver

    def test_make_find_refs_response_linker_v3(self, mock_get_ref_resolver: WSGIRequest,
                                               mock_find_refs_text: linker._FindRefsText,
                                               mock_find_refs_options: linker._FindRefsTextOptions):
        response = linker._make_find_refs_response_linker_v3(mock_find_refs_text, mock_find_refs_options)
        assert 'title' in response
        assert 'body' in response


class TestFindRefsResponseInner:
    @pytest.fixture
    def mock_resolved(self):
        return [[]]

    def test_make_find_refs_response_inner(self, mock_resolved: Mock, mock_find_refs_options: linker._FindRefsTextOptions):
        response = linker._make_find_refs_response_inner(mock_resolved, mock_find_refs_options)
        assert 'results' in response
        assert 'refData' in response


class TestRefResponseForLinker:

    def test_make_ref_response_for_linker(self, mock_oref: Ref, mock_find_refs_options: linker._FindRefsTextOptions):
        response = linker._make_ref_response_for_linker(mock_oref, mock_find_refs_options)
        assert 'heRef' in response
        assert 'url' in response
        assert 'primaryCategory' in response


class TestPreferredVtitle:
    @pytest.mark.parametrize(('oref', 'vprefs_by_corpus', 'expected_vpref'), [
        [Ref("Job 17"), None, None],
        [Ref("Job 17"), {"Tanakh": {"en": "vtitle1"}}, "vtitle1"],
        [Ref("Shabbat 2a"), {"Tanakh": {"en": "vtitle1"}}, None],
        [Ref("Shabbat 2a"), {"Bavli": {"en": "vtitle1"}}, "vtitle1"],
        [Ref("Shabbat 2a"), {"Bavli": {"he": "vtitle1"}}, None],
    ])
    def test_get_preferred_vtitle(self, oref: Ref, vprefs_by_corpus: dict, expected_vpref: str):
        vpref = linker._get_preferred_vtitle(oref, 'en', vprefs_by_corpus)
        assert vpref == expected_vpref


class TestRefTextByLangForLinker:

    @pytest.fixture
    def mock_ja(self):
        return Mock()

    @pytest.fixture
    def mock_text_chunk(self, mock_ja: Mock):
        with patch('sefaria.model.text.TextChunk') as MockTC:
            mock_tc = MockTC.return_value
            mock_tc.ja.return_value = mock_ja
            mock_tc.strip_itags.side_effect = lambda x: x
            yield mock_tc

    @pytest.mark.parametrize(('options', 'text_array', 'expected_text_array', 'expected_was_truncated'), [
        ({"max_segments": 4}, ['a'], ['a'], False),
        ({"max_segments": 2}, ['a', 'b'], ['a', 'b'], False),
        ({"max_segments": 2}, ['a', 'b', 'c'], ['a', 'b'], True),
    ])
    def test_get_ref_text_by_lang_for_linker(self, mock_text_chunk: TextChunk, mock_ja: Mock, mock_oref: Ref, options: dict,
                                             text_array: list, expected_text_array: list, expected_was_truncated: bool):
        mock_ja.flatten_to_array.return_value = text_array
        find_refs_options = linker._FindRefsTextOptions(**options)
        actual_text_array, actual_was_truncated = linker._get_ref_text_by_lang_for_linker(mock_oref, 'en', find_refs_options)
        assert actual_text_array == expected_text_array
        assert actual_was_truncated == expected_was_truncated
