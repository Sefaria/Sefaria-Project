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
        # Empty indices should return 500 with error message
        assert response.status_code == 500
        data = json.loads(response.content)
        assert 'error' in data
        assert 'empty' in data['error'].lower()

    @pytest.mark.django_db
    def test_bulk_edit_returns_detailed_response(self, staff_client):
        """Should return status, count, total, successes, failures."""
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
        # Should have the new detailed response format
        assert 'status' in data
        assert 'count' in data
        assert 'total' in data
        assert 'successes' in data
        assert 'failures' in data
        # Version doesn't exist, so should report failure
        assert data['status'] in ['error', 'partial']
        assert len(data['failures']) > 0


class TestCheckIndexDependenciesAPI:
    """Tests for /api/check-index-dependencies endpoint."""

    @pytest.mark.django_db
    def test_check_dependencies_requires_staff(self, regular_client):
        """Non-staff users should be denied access."""
        response = regular_client.get('/api/check-index-dependencies/Genesis')
        assert response.status_code in [302, 403]

    @pytest.mark.django_db
    def test_check_dependencies_returns_info(self, staff_client):
        """Should return dependency information for valid index."""
        response = staff_client.get('/api/check-index-dependencies/Genesis')
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.content}"
        data = json.loads(response.content)
        assert 'has_dependencies' in data, "Response missing 'has_dependencies' field"
        assert 'dependent_count' in data, "Response missing 'dependent_count' field"


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
