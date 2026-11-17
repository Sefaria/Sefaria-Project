"""Pure tests (no database) for the link title-change cascade in sefaria/model/link.py."""

from types import SimpleNamespace

from sefaria.model import link as link_module


class _FakeLink:
    def __init__(self, link_id, refs, expanded=True):
        self._id = link_id
        self.refs = refs
        if expanded:
            self.expandedRefs0 = list(refs[:1])
            self.expandedRefs1 = list(refs[1:])
        self.saved = False

    def save(self):
        self.saved = True


def test_link_without_expanded_refs_is_logged_and_cascade_continues(monkeypatch):
    broken = _FakeLink("broken-id", ["Old Title 1", "Other 1"], expanded=False)
    healthy = _FakeLink("healthy-id", ["Old Title 2", "Other 2"])
    monkeypatch.setattr(link_module, "LinkSet", lambda query: [broken, healthy])
    monkeypatch.setattr(
        link_module.text, "Ref", lambda title: SimpleNamespace(regex=lambda as_list=True: ["Old Title"])
    )
    monkeypatch.setattr(link_module, "report_progress", lambda *a, **k: None)
    logged = []
    monkeypatch.setattr(link_module.logger, "exception", lambda msg, **kw: logged.append((msg, kw)))

    link_module.process_index_title_change_in_links(
        SimpleNamespace(title="Old Title"), old="Old Title", new="New Title"
    )

    assert [kw["link_id"] for _, kw in logged] == ["broken-id"]
    assert healthy.saved is True
    assert healthy.refs[0] == "New Title 2"
    assert broken.saved is False
