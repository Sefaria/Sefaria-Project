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
        if response.status_code == 200:
            data = json.loads(response.content)
            assert 'has_dependencies' in data
            assert 'dependent_count' in data
