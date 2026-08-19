import pytest
from django.http import Http404
from django.test import RequestFactory

import reader.views as reader_views


def test_current_990_form_redirects_to_latest_matching_pdf(tmp_path, monkeypatch):
    files_dir = tmp_path / 'files'
    files_dir.mkdir()
    for filename in ('Sefaria_2023_990_Public.pdf', 'Sefaria_2025_990_Public.pdf', 'Sefaria_2026_Annual_Report.pdf'):
        (files_dir / filename).touch()
    monkeypatch.setattr(reader_views, 'STATICFILES_DIRS', [str(tmp_path)])

    response = reader_views.current_990_form(RequestFactory().get('/current-990-form'))

    assert response.status_code == 302
    assert response['Location'] == '/static/files/Sefaria_2025_990_Public.pdf'


def test_current_990_form_raises_404_when_no_matching_pdf_exists(tmp_path, monkeypatch):
    (tmp_path / 'files').mkdir()
    monkeypatch.setattr(reader_views, 'STATICFILES_DIRS', [str(tmp_path)])

    with pytest.raises(Http404):
        reader_views.current_990_form(RequestFactory().get('/current-990-form'))
