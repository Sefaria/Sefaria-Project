import sys, os
import pytest

# Make sure that the application source directory (this directory's parent) is
# on sys.path.

here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, here)


@pytest.fixture
def mock_toc_callbacks(monkeypatch):
    """Mock TOC-related callbacks that cause database access during tests
    
    Use this fixture in tests that save Index models to avoid
    RuntimeError: Database access not allowed
    """
    def mock_process_index_change_in_toc(indx, **kwargs):
        pass  # Do nothing to avoid database access

    def mock_rebuild_library_after_category_change(*args, **kwargs):
        pass  # Do nothing to avoid database access
    
    monkeypatch.setattr('sefaria.model.text.process_index_change_in_toc', mock_process_index_change_in_toc)
    monkeypatch.setattr('sefaria.model.text.rebuild_library_after_category_change', mock_rebuild_library_after_category_change)