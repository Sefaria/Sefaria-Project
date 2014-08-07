from sefaria.model import *
import sefaria.model.dependencies
import regex as re


def test_index_name_change():
    # Ruth -> Rut -> Ruth
    # Genesis -> Beginning -> Genesis

    old = u"Genesis"
    new = u"Smurfy"

    for cnt in dep_counts(new):
        assert cnt == 0

    old_counts = dep_counts(old)

    index = text.Index().load_by_query({"title": old})
    index.title = new
    index.save()
    assert old_counts == dep_counts(new)

    index.title = old
    index.save()
    assert old_counts == dep_counts(old)
    for cnt in dep_counts(new):
        assert cnt == 0


def dep_counts(name):
    pattern = r'^%s(?= \d)' % re.escape(name)

    ret = [
        text.VersionSet({"title": name}).count(),
        note.NoteSet({"ref": {"$regex": pattern}}).count(),
        link.LinkSet({"refs": {"$regex": pattern}}).count(),
        history.HistorySet({"ref": {"$regex": pattern}}).count(),
        history.HistorySet({"title": name}).count(),
        history.HistorySet({"new": {"refs": {"$regex": pattern}}}).count()
    ]
    return ret