from sefaria.utils.views_utils import mark_no_applink, NO_APPLINK_PARAM


class TestMarkNoApplink:

    def test_does_not_duplicate_if_already_marked(self):
        once = mark_no_applink('/next')
        twice = mark_no_applink(once)

        assert twice == once
        assert twice.count(NO_APPLINK_PARAM) == 1

    def test_marks_with_a_non_empty_value(self):
        # The AASA rule matches no_applink with "?*" (at least one character).
        assert mark_no_applink('/next') == f'/next?{NO_APPLINK_PARAM}=1'

    def test_preserves_other_query_params(self):
        assert mark_no_applink('/next?a=1&b=2') == f'/next?a=1&b=2&{NO_APPLINK_PARAM}=1'

    def test_bare_no_applink_with_no_value_gets_a_value(self):
        marked = mark_no_applink(f'/next?{NO_APPLINK_PARAM}')
        assert marked.count(NO_APPLINK_PARAM) == 1
        assert f'{NO_APPLINK_PARAM}=1' in marked

    def test_blank_no_applink_gets_a_value(self):
        marked = mark_no_applink(f'/next?a=1&{NO_APPLINK_PARAM}=')
        assert marked.count(NO_APPLINK_PARAM) == 1
        assert marked == f'/next?a=1&{NO_APPLINK_PARAM}=1'
