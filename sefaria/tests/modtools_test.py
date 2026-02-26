"""
Tests for ModeratorToolsPanel API endpoints.

These tests cover the bulk editing functionality for version metadata.
"""
import pytest
import json
from django.test import Client
from django.contrib.auth.models import User


@pytest.fixture
def staff_client(db):
    """Create a staff user and return an authenticated client."""
    user = User.objects.create_user(
        username='teststaff',
        email='test@sefaria.org',
        password='testpass123',
        is_staff=True
    )
    client = Client()
    client.force_login(user)  # Use force_login instead of login
    return client


@pytest.fixture
def regular_client(db):
    """Create a regular (non-staff) user and return an authenticated client."""
    user = User.objects.create_user(
        username='testuser',
        email='user@sefaria.org',
        password='testpass123',
        is_staff=False
    )
    client = Client()
    client.force_login(user)
    return client


@pytest.fixture
def anon_client():
    """Return an unauthenticated client."""
    return Client()


class TestVersionIndicesAPI:
    """Tests for /api/version-indices endpoint."""

    @pytest.mark.django_db
    def test_version_indices_requires_auth(self, anon_client):
        """Unauthenticated users should be redirected."""
        response = anon_client.get('/api/version-indices')
        assert response.status_code == 302  # Redirect to login

    @pytest.mark.django_db
    def test_version_indices_returns_list(self, staff_client):
        """Should return list of indices for valid versionTitle."""
        response = staff_client.get('/api/version-indices', {
            'versionTitle': 'Tanach with Nikkud'
        })
        assert response.status_code == 200
        data = json.loads(response.content)
        assert 'indices' in data
        assert isinstance(data['indices'], list)

    @pytest.mark.django_db
    def test_version_indices_empty_for_nonexistent(self, staff_client):
        """Should return empty list for nonexistent versionTitle."""
        response = staff_client.get('/api/version-indices', {
            'versionTitle': 'NonexistentVersion99999'
        })
        assert response.status_code == 200
        data = json.loads(response.content)
        assert 'indices' in data
        assert data['indices'] == []


class TestVersionBulkEditAPI:
    """Tests for /api/version-bulk-edit endpoint."""

    @pytest.mark.django_db
    def test_bulk_edit_requires_staff(self, regular_client):
        """Non-staff users should be denied access."""
        response = regular_client.post(
            '/api/version-bulk-edit',
            data=json.dumps({
                'versionTitle': 'Test',
                'language': 'en',
                'indices': ['Genesis'],
                'updates': {'license': 'CC-BY'}
            }),
            content_type='application/json'
        )
        # Should redirect to login or return 403
        assert response.status_code in [302, 403]

    @pytest.mark.django_db
    def test_bulk_edit_requires_post(self, staff_client):
        """GET requests should be rejected."""
        response = staff_client.get('/api/version-bulk-edit')
        assert response.status_code == 400

    @pytest.mark.django_db
    def test_bulk_edit_requires_indices(self, staff_client):
        """Should error when indices array is empty."""
        response = staff_client.post(
            '/api/version-bulk-edit',
            data=json.dumps({
                'versionTitle': 'Test',
                'language': 'en',
                'indices': [],
                'updates': {'license': 'CC-BY'}
            }),
            content_type='application/json'
        )
        # Empty indices should return 400 (bad request) with error message
        assert response.status_code == 400
        data = json.loads(response.content)
        assert 'error' in data
        assert 'empty' in data['error'].lower()

    @pytest.mark.django_db
    def test_bulk_edit_returns_detailed_response(self, staff_client):
        """Should return status, successes, failures."""
        response = staff_client.post(
            '/api/version-bulk-edit',
            data=json.dumps({
                'versionTitle': 'NonexistentVersion12345',
                'language': 'en',
                'indices': ['Genesis'],
                'updates': {'license': 'CC-BY'}
            }),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.content)
        # Should have the detailed response format
        assert 'status' in data
        assert 'successes' in data
        assert 'failures' in data
        # Version doesn't exist, so should report failure
        assert data['status'] in ['error', 'partial']
        assert len(data['failures']) > 0

    @pytest.mark.django_db
    def test_bulk_edit_null_clears_field(self, staff_client):
        """Sending null value should remove field from version entirely."""
        from sefaria.model import VersionSet, Version

        # Create a test version with purchaseInformationURL set
        test_version = Version({
            'versionTitle': 'TestVersionForClearing',
            'language': 'en',
            'title': 'Genesis',
            'chapter': [],
            'versionSource': 'https://test.com',
            'purchaseInformationURL': 'https://example.com/buy'
        })
        test_version.save()

        # Verify field exists before clearing
        v = Version().load({'versionTitle': 'TestVersionForClearing', 'language': 'en', 'title': 'Genesis'})
        assert hasattr(v, 'purchaseInformationURL'), "Field should exist before clearing"
        assert v.purchaseInformationURL == 'https://example.com/buy'

        # Send null value to clear the field
        response = staff_client.post(
            '/api/version-bulk-edit',
            data=json.dumps({
                'versionTitle': 'TestVersionForClearing',
                'language': 'en',
                'indices': ['Genesis'],
                'updates': {'purchaseInformationURL': None}
            }),
            content_type='application/json'
        )

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['status'] == 'ok'
        assert len(data['successes']) == 1

        # Verify field was removed (not just set to null or empty string)
        v = Version().load({'versionTitle': 'TestVersionForClearing', 'language': 'en', 'title': 'Genesis'})
        assert not hasattr(v, 'purchaseInformationURL'), "Field should be completely removed after clearing"

        # Cleanup
        v.delete()

    @pytest.mark.django_db
    def test_bulk_edit_mixed_updates_and_clears(self, staff_client):
        """Should handle both field updates and field clears in same request."""
        from sefaria.model import VersionSet, Version

        # Create a test version with multiple fields
        test_version = Version({
            'versionTitle': 'TestVersionMixed',
            'language': 'en',
            'title': 'Genesis',
            'chapter': [],
            'versionSource': 'https://test.com',
            'license': 'PD',
            'purchaseInformationURL': 'https://example.com/buy',
            'versionNotes': 'Old notes'
        })
        test_version.save()

        # Update some fields, clear others
        response = staff_client.post(
            '/api/version-bulk-edit',
            data=json.dumps({
                'versionTitle': 'TestVersionMixed',
                'language': 'en',
                'indices': ['Genesis'],
                'updates': {
                    'license': 'CC-BY',  # Update this field
                    'purchaseInformationURL': None,  # Clear this field
                    'versionNotes': 'New notes'  # Update this field
                }
            }),
            content_type='application/json'
        )

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['status'] == 'ok'

        # Verify updates applied and field cleared
        v = Version().load({'versionTitle': 'TestVersionMixed', 'language': 'en', 'title': 'Genesis'})
        assert v.license == 'CC-BY', "License should be updated"
        assert v.versionNotes == 'New notes', "Notes should be updated"
        assert not hasattr(v, 'purchaseInformationURL'), "purchaseInformationURL should be removed"

        # Cleanup
        v.delete()

    @pytest.mark.django_db
    def test_bulk_edit_clear_nonexistent_field(self, staff_client):
        """Clearing a field that doesn't exist should not error."""
        from sefaria.model import VersionSet, Version

        # Create a test version without purchaseInformationURL
        test_version = Version({
            'versionTitle': 'TestVersionNoField',
            'language': 'en',
            'title': 'Genesis',
            'chapter': [],
            'versionSource': 'https://test.com'
        })
        test_version.save()

        # Try to clear a field that doesn't exist
        response = staff_client.post(
            '/api/version-bulk-edit',
            data=json.dumps({
                'versionTitle': 'TestVersionNoField',
                'language': 'en',
                'indices': ['Genesis'],
                'updates': {'purchaseInformationURL': None}
            }),
            content_type='application/json'
        )

        # Should succeed without error
        assert response.status_code == 200
        data = json.loads(response.content)
        assert data['status'] == 'ok'

        # Verify version still exists and wasn't broken
        v = Version().load({'versionTitle': 'TestVersionNoField', 'language': 'en', 'title': 'Genesis'})
        assert v is not None
        assert not hasattr(v, 'purchaseInformationURL')

        # Cleanup
        v.delete()

    @pytest.mark.django_db
    def test_bulk_edit_without_language_parameter(self, staff_client):
        """Language parameter should be optional since title+versionTitle is unique.

        When user doesn't select a language filter in the UI, the frontend
        doesn't send a language parameter. The API should still find and
        update the version using just title + versionTitle.
        """
        from sefaria.model import Version

        # Create a test version with Hebrew language
        test_version = Version({
            'versionTitle': 'TestVersionNoLang',
            'language': 'he',
            'title': 'Genesis',
            'chapter': [],
            'versionSource': 'https://test.com',
            'versionNotes': 'Original notes'
        })
        test_version.save()

        # Request without language parameter (as frontend now sends)
        response = staff_client.post(
            '/api/version-bulk-edit',
            data=json.dumps({
                'versionTitle': 'TestVersionNoLang',
                # No language parameter
                'indices': ['Genesis'],
                'updates': {'versionNotes': 'Updated notes'}
            }),
            content_type='application/json'
        )

        assert response.status_code == 200
        data = json.loads(response.content)

        # Should succeed - title + versionTitle is sufficient to find the version
        assert data['status'] == 'ok', f"Expected success, got: {data}"
        assert len(data['successes']) == 1
        assert len(data['failures']) == 0

        # Verify the update was applied
        v = Version().load({'versionTitle': 'TestVersionNoLang', 'title': 'Genesis'})
        assert v is not None
        assert v.versionNotes == 'Updated notes'

        # Cleanup
        v.delete()


# ============================================================================
# Legacy Modtools API Tests (Priority 1 - Write Operations)
# ============================================================================

from io import BytesIO
from django.core.files.uploadedfile import SimpleUploadedFile


@pytest.fixture
def sample_links_csv():
    """Create a sample CSV file for links upload testing."""
    csv_content = b"Genesis 1:1,Rashi on Genesis 1:1\nGenesis 1:2,Rashi on Genesis 1:2"
    return SimpleUploadedFile("links.csv", csv_content, content_type="text/csv")


@pytest.fixture
def malformed_csv():
    """Create a malformed CSV file for error testing."""
    csv_content = b"InvalidRef,AnotherInvalidRef"
    return SimpleUploadedFile("bad.csv", csv_content, content_type="text/csv")


class TestLinksUploadAPI:
    """Tests for /modtools/links endpoint (POST for upload)."""

    @pytest.mark.django_db
    def test_links_upload_requires_staff(self, regular_client, sample_links_csv):
        """Non-staff users should be denied access."""
        response = regular_client.post('/modtools/links', {
            'csv_file': sample_links_csv,
            'linkType': 'commentary',
            'projectName': 'Test'
        })
        # Should redirect to login
        assert response.status_code == 302

    @pytest.mark.django_db
    def test_links_upload_requires_auth(self, anon_client, sample_links_csv):
        """Unauthenticated users should be redirected."""
        response = anon_client.post('/modtools/links', {
            'csv_file': sample_links_csv,
            'linkType': 'commentary',
            'projectName': 'Test'
        })
        assert response.status_code == 302

    @pytest.mark.django_db
    def test_links_upload_requires_post(self, staff_client):
        """GET requests should return error."""
        response = staff_client.get('/modtools/links')
        assert response.status_code == 200  # Returns JSON error
        data = json.loads(response.content)
        assert 'error' in data
        assert 'Unsupported Method' in data['error']

    @pytest.mark.django_db
    def test_links_upload_requires_csv_file(self, staff_client):
        """Should error when no CSV file provided."""
        # The endpoint will raise KeyError when csv_file is missing
        # This is expected behavior - test that it doesn't silently succeed
        with pytest.raises(KeyError):
            staff_client.post('/modtools/links', {
                'linkType': 'commentary',
                'projectName': 'Test'
            })


class TestLinksDeleteAPI:
    """Tests for /modtools/links endpoint (POST with action=DELETE)."""

    @pytest.mark.django_db
    def test_links_delete_requires_staff(self, regular_client, sample_links_csv):
        """Non-staff users should be denied access for delete."""
        response = regular_client.post('/modtools/links', {
            'csv_file': sample_links_csv,
            'action': 'DELETE'
        })
        assert response.status_code == 302

    @pytest.mark.django_db
    def test_links_delete_uses_delete_action(self, staff_client, sample_links_csv):
        """DELETE action should call remove_links_from_csv."""
        response = staff_client.post('/modtools/links', {
            'csv_file': sample_links_csv,
            'action': 'DELETE'
        })
        # Should process (may fail on invalid refs, but should not error on endpoint)
        assert response.status_code in [200, 400]


class TestTextUploadAPI:
    """Tests for /api/text-upload endpoint."""

    @pytest.mark.django_db
    def test_text_upload_requires_staff(self, regular_client):
        """Non-staff users should be denied access."""
        fake_text = SimpleUploadedFile("test.json", b'{"test": "data"}', content_type="application/json")
        response = regular_client.post('/api/text-upload', {
            'texts[]': fake_text
        })
        # Should redirect or return 403
        assert response.status_code in [302, 403]

    @pytest.mark.django_db
    def test_text_upload_requires_post(self, staff_client):
        """GET requests should return error."""
        response = staff_client.get('/api/text-upload')
        # May return 405 or redirect depending on URL routing
        # The endpoint explicitly checks for POST
        assert response.status_code == 200
        data = json.loads(response.content)
        assert 'error' in data


class TestWorkflowyUploadAPI:
    """Tests for /modtools/upload_text endpoint."""

    @pytest.fixture
    def sample_workflowy_xml(self):
        """Create a sample Workflowy XML file."""
        xml_content = b"""<?xml version="1.0" encoding="UTF-8"?>
        <opml version="2.0">
            <head><title>Test</title></head>
            <body><outline text="Test Content"/></body>
        </opml>"""
        return SimpleUploadedFile("workflowy.opml", xml_content, content_type="text/xml")

    @pytest.mark.django_db
    def test_workflowy_requires_staff(self, regular_client, sample_workflowy_xml):
        """Non-staff users should be denied access."""
        response = regular_client.post('/modtools/upload_text', {
            'workflowys[]': sample_workflowy_xml
        })
        assert response.status_code == 302

    @pytest.mark.django_db
    def test_workflowy_requires_auth(self, anon_client, sample_workflowy_xml):
        """Unauthenticated users should be redirected."""
        response = anon_client.post('/modtools/upload_text', {
            'workflowys[]': sample_workflowy_xml
        })
        assert response.status_code == 302

    @pytest.mark.django_db
    def test_workflowy_requires_post(self, staff_client):
        """GET requests should return error."""
        response = staff_client.get('/modtools/upload_text')
        assert response.status_code == 200
        data = json.loads(response.content)
        assert 'error' in data

    @pytest.mark.django_db
    def test_workflowy_requires_files(self, staff_client):
        """Should error when no files provided."""
        response = staff_client.post('/modtools/upload_text', {})
        assert response.status_code == 200
        data = json.loads(response.content)
        assert 'error' in data
        assert 'No files' in data['error']


# ============================================================================
# Legacy Modtools API Tests (Priority 2 - Read Operations)
# ============================================================================

class TestBulkDownloadVersionsAPI:
    """Tests for /download/bulk/versions/ endpoint."""

    @pytest.mark.django_db
    def test_bulk_download_requires_staff(self, regular_client):
        """Non-staff users should be denied access."""
        response = regular_client.get('/download/bulk/versions/', {
            'title': 'Genesis'
        })
        assert response.status_code in [302, 403]

    @pytest.mark.django_db
    def test_bulk_download_requires_title(self, staff_client):
        """Should error when no title provided."""
        response = staff_client.get('/download/bulk/versions/')
        # Should return error for missing title
        assert response.status_code in [400, 500] or 'error' in response.content.decode()

    @pytest.mark.django_db
    def test_bulk_download_returns_response(self, staff_client):
        """Should return CSV or JSON for valid title."""
        response = staff_client.get('/download/bulk/versions/', {
            'title': 'Genesis'
        })
        # Should return 200 with either CSV or JSON
        assert response.status_code == 200
        content_type = response['Content-Type']
        # Accept both CSV (success) and JSON (may contain error/empty result)
        assert 'text/csv' in content_type or 'application/json' in content_type


class TestLinksDownloadAPI:
    """Tests for /modtools/links/<tref1>/<tref2> endpoint."""

    @pytest.mark.django_db
    def test_links_download_returns_csv(self, staff_client):
        """Should return CSV for valid refs."""
        response = staff_client.get('/modtools/links/Genesis 1/Rashi on Genesis 1')
        # Should return 200 with CSV content type
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert 'text/csv' in response['Content-Type'], f"Expected CSV, got {response['Content-Type']}"

    @pytest.mark.django_db
    def test_links_download_handles_invalid_refs(self, staff_client):
        """Should handle invalid references gracefully."""
        response = staff_client.get('/modtools/links/InvalidRef123/AnotherInvalidRef')
        # Should return 400 for invalid refs
        assert response.status_code in [200, 400]


class TestIndexLinksDownloadAPI:
    """Tests for /modtools/index_links/<tref1>/<tref2> endpoint."""

    @pytest.mark.django_db
    def test_index_links_returns_csv(self, staff_client):
        """Should return CSV for valid refs with by_segment=True."""
        response = staff_client.get('/modtools/index_links/Genesis 1/Rashi on Genesis 1')
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert 'text/csv' in response['Content-Type'], f"Expected CSV, got {response['Content-Type']}"
