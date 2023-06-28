from sefaria.helper.linker import _FindRefsText, _create_find_refs_text, _FindRefsTextOptions, load_spacy_model
import pytest
from unittest.mock import patch
from sefaria.google_storage_manager import GoogleStorageManager
import spacy
import tarfile
import io


class TestLoadSpacyModel:

    @staticmethod
    @pytest.fixture
    def spacy_model():
        return spacy.blank('en')

    @staticmethod
    @pytest.fixture
    def tarfile_buffer():
        tar_buffer = io.BytesIO()
        with tarfile.open(fileobj=tar_buffer, mode='w:gz') as tar:
            tar.addfile(tarfile.TarInfo('test'))
        tar_buffer.seek(0)
        return tar_buffer

    @staticmethod
    @patch('spacy.load')
    def test_load_spacy_model_local(spacy_load_mock, spacy_model):
        spacy_load_mock.return_value = spacy_model
        assert load_spacy_model('local/path') == spacy_model

    @staticmethod
    @patch('spacy.load')
    @patch.object(GoogleStorageManager, 'get_filename')
    def test_load_spacy_model_cloud(get_filename_mock, spacy_load_mock, spacy_model, tarfile_buffer):
        get_filename_mock.return_value = tarfile_buffer
        spacy_load_mock.return_value = spacy_model
        assert load_spacy_model('gs://bucket_name/blob_name') == spacy_model

    @staticmethod
    @patch('spacy.load')
    @patch.object(GoogleStorageManager, 'get_filename')
    def test_load_spacy_model_cloud_invalid_path(get_filename_mock, spacy_load_mock, spacy_model, tarfile_buffer):
        get_filename_mock.return_value = tarfile_buffer
        spacy_load_mock.side_effect = OSError
        with pytest.raises(OSError):
            load_spacy_model('invalid_path')
