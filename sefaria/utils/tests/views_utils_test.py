from sefaria.utils.views_utils import mark_no_applink, NO_APPLINK_PARAM


class TestMarkNoApplink:

    def test_does_not_duplicate_if_already_marked(self):
        once = mark_no_applink('/next')
        twice = mark_no_applink(once)

        assert twice == once
        assert twice.count(NO_APPLINK_PARAM) == 1

    def test_does_not_duplicate_a_bare_no_applink_with_no_value(self):
        assert mark_no_applink(f'/next?{NO_APPLINK_PARAM}').count(NO_APPLINK_PARAM) == 1

    def test_does_not_duplicate_a_blank_no_applink(self):
        assert mark_no_applink(f'/next?{NO_APPLINK_PARAM}=').count(NO_APPLINK_PARAM) == 1
