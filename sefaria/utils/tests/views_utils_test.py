from sefaria.utils.views_utils import mark_no_applink, NO_APPLINK_PARAM


class TestMarkNoApplink:

    def test_does_not_duplicate_if_already_marked(self):
        once = mark_no_applink('/next')
        twice = mark_no_applink(once)

        assert twice == once
        assert twice.count(NO_APPLINK_PARAM) == 1
