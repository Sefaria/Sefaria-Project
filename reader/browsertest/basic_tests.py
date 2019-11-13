# -*- coding: utf-8 -*-
#from __future__ import absolute_import

from framework import AtomicTest, TestSuite, one_of_these_texts_present_in_element
from sefaria.utils.hebrew import has_cantillation
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support.expected_conditions import title_contains, staleness_of, element_to_be_clickable, visibility_of_element_located, invisibility_of_element_located, text_to_be_present_in_element

from sefaria.model import *
from sefaria.utils.hebrew import strip_cantillation
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import WebDriverException

import time  # import stand library below name collision in sefaria.model


TEMPER = 10


class ReaderSuite(TestSuite):
    """
    Suite of reader tests that are run one after the other, without page reload
    """
    every_build = True

    def setup(self):
        try:
            self.driver.set_window_size(900, 1100)
        except WebDriverException:
            pass
        self.load_toc(my_temper=60)
        #self.driver.delete_all_cookies()
        self.click_accept_cookies()
        #self.set_cookies_cookie()


class PageloadSuite(TestSuite):
    """
    Tests that load pages and don't make any assumptions about starting or ending state
    """
    every_build = True

    def setup(self):
        try:
            self.driver.set_window_size(900, 1100)
        except WebDriverException:
            pass
        self.load_toc(my_temper=60)
        #self.driver.delete_all_cookies()
        self.click_accept_cookies()
        #self.set_cookies_cookie()


class DeepReaderSuite(TestSuite):
    #TODO: When do we run this?
    every_build = False

'''
class SheetSuite(TestSuite):
    def setup(self):
        pass
'''


class SinglePanelOnMobile(AtomicTest):
    suite_class = ReaderSuite
    every_build = True
    multi_panel = False

    def body(self):
        self.nav_to_text_toc(["Tanakh"], "Joshua")
        self.click_text_toc_section("Joshua 1")
        elems = self.driver.find_elements_by_css_selector(".readerApp.multiPanel")
        assert len(elems) == 0
        self.click_segment("Joshua 1:1")
        elems = self.driver.find_elements_by_css_selector(".readerApp .readerPanelBox")
        assert len(elems) == 1

        self.click_segment_to_close_commentary("Joshua 1:1")  # Close commentary window on mobile


class PagesLoad(AtomicTest):
    suite_class = PageloadSuite
    every_build = True

    def body(self):
        self.load_toc()
        self.click_toc_category("Midrash").click_toc_text("Ein Yaakov")
        self.load_ref("Psalms.104")
        self.load_sheets()
        self.load_gardens()
        self.load_home()
        self.load_people()
        #logged in stuff
        self.login_user()
        # self.load_notifications()
        self.load_account()
        self.load_private_sheets()
        self.load_private_groups()


class SectionContentAsExpectedMasechtotAndChapters(AtomicTest):
    suite_class = PageloadSuite
    every_build = True

    def body(self):
        self.load_toc()
        self.click_toc_category("Midrash")
        self.click_toc_text("Ein Yaakov")
        self.click_source_title()
        self.click_masechet_and_chapter('2','3')
        section = self.get_section_txt('1')
        assert section.startswith(u'(דף מא) רבי זירא הוה משתמיט')


class SectionContentAsExpectedChapter(AtomicTest):
    suite_class = PageloadSuite
    every_build = False

    def body(self):
        self.load_toc()
        self.click_toc_category("Midrash").click_toc_text("Seder Olam Rabbah")
        self.click_source_title()
        self.click_chapter('4')
        section = self.get_section_txt('1')
        assert u'פרק ד ' == section

'''
That'd be the old home
class GoThroughHomeLinksAndButtons(AtomicTest):
    #Makes sure links are there and not broken. Will fall on a line of a broken or unexisting link/button.
    #When openning new tabs, checks URLs
    suite_class = PageloadSuite
    every_build = True

    def body(self):
        self.load_home()
        self.login_user()
        self.click_get_started()
        self.click_sefaria()
        self.click_explore_lib()
        self.click_sefaria()
        self.click_parasha()
        self.click_sefaria()
        self.click_daf_yomi()
        self.click_sefaria()
        self.click_haggadah()
        self.click_sefaria()
        self.click_pirkei_avot()
        self.click_sefaria()
        self.click_midrash_rabbah()
        self.click_sefaria()
        self.click_shulchan_arukh()
        self.click_sefaria()
        self.click_ios_app()
        tab_url = self.get_newly_opened_tab_url()
        assert 'itunes.apple.com/us/app/sefaria' in tab_url, 'Actual URL: ' + tab_url
        self.close_tab_and_return_to_prev_tab()
        self.click_android_app()
        tab_url = self.get_newly_opened_tab_url()
        assert 'play.google.com/store/apps' in tab_url, 'Actual URL: ' + tab_url
        assert 'org.sefaria.sefaria' in tab_url
        self.close_tab_and_return_to_prev_tab()
        self.click_start_a_sheet()
        self.click_sefaria()
        self.close_popup_with_accept()
        self.click_explore_sheets()
        self.click_sefaria()
        self.click_source_sheet_img()
        self.click_sefaria()
        self.click_link_explorer_img()
        self.click_sefaria()
        self.click_explore_connections()
        self.click_sefaria()
        self.click_learn_more_for_educators()
        self.click_sefaria()
        self.click_educators_img()
        self.click_sefaria()
        self.click_more_metrics()
        self.click_sefaria()
        self.click_subscribe()
        str = self.get_subscribe_msg()
        assert str == u'Please enter a valid email address.'
        self.type_in_mailing_list_email('moses.ben.maimon@gmail.com')
        self.click_subscribe()
        str = self.get_subscribe_msg()
        # Requires NationBuilder to be set up
        # assert str == 'Subscribed! Welcome to our list.'
'''

'''
todo: Test the results of these clicks. 
As it stands, it's not terribly useful.  It's only testing the existence of the links. 

class GoThroughFooterObjects(AtomicTest):
    suite_class = PageloadSuite
    every_build = False

    def body(self):
        self.load_toc()
        time.sleep(1)
        self.click_what_in_sefaria_link()
        self.click_sefaria()
        self.click_help_link()
        self.click_sefaria()
        time.sleep(3)
        self.click_FAQ_link()
        self.close_tab_and_return_to_prev_tab()
        self.click_sefaria()
        self.click_Team_link()
        self.click_sefaria()
        self.click_terms_of_use_link()
        self.click_sefaria()
        self.click_privacy_policy_link()

        self.click_sefaria()
        self.click_teach_with_sefaria_link()
        self.click_sefaria()
        self.click_source_sheets_link()
        self.click_sefaria()
        self.click_visualizations_link()
        self.click_sefaria()
        self.click_authors_link()
        self.click_sefaria()
        self.click_new_additions_link()

        self.click_sefaria()
        self.click_get_involved_link()
        self.close_tab_and_return_to_prev_tab()
        self.click_sefaria()
        self.click_API_docs_link()
        self.close_tab_and_return_to_prev_tab()
        self.click_sefaria()
        self.click_fork_us_on_GitHub_link()
        self.close_tab_and_return_to_prev_tab()
        self.click_sefaria()
        self.click_download_our_data_link()
        self.close_tab_and_return_to_prev_tab()

        # self.click_donate_link()
        self.click_sefaria()
        self.click_supporters_link()
        self.click_sefaria()
        self.click_contribute_link()
        self.close_tab_and_return_to_prev_tab()
        self.click_sefaria()
        self.click_jobs_link()

        self.click_sefaria()
        self.click_facebook_link()
        self.close_tab_and_return_to_prev_tab()
        self.click_sefaria()
        self.click_twitter_link()
        self.close_tab_and_return_to_prev_tab()
        self.click_sefaria()
        self.click_youtube_link()
        self.close_tab_and_return_to_prev_tab()
        self.click_sefaria()
        self.click_blog_link()
        self.close_tab_and_return_to_prev_tab()
        self.click_sefaria()
        self.click_instagram_link()
        self.close_tab_and_return_to_prev_tab()
        self.click_sefaria()
        # self.click_email_link()//needs to be able to get rid of the specifically configured email client
        # self.click_sefaria()

        self.click_ivrit_link()
        self.click_english_link()
'''

class ChangeLanguage(AtomicTest):
    suite_class = PageloadSuite
    every_build = True

    def body(self):
        self.load_ref("Genesis 1")
        expected_heb = u'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃'
        expected_eng_closed = u'When God began to create heaven and earth—'
        expected_eng_open = u'In the beginning God created the heaven and the earth.'
        sgmnt_eng = self.get_nth_section_english(1)
        sgmnt_heb = self.get_nth_section_hebrew(1)
        str_eng = sgmnt_eng.text.strip()
        str_heb = sgmnt_heb.text.strip()
        # not sure why, but he strings aren't equal unless vowels are stripped
        expected_heb_stripped = strip_cantillation(expected_heb, strip_vowels=True)
        str_heb_stripped = strip_cantillation(str_heb, strip_vowels=True)
        assert expected_heb_stripped == str_heb_stripped, u"'{}' does not equal '{}'".format(expected_heb_stripped, str_heb_stripped)
        assert str_eng in [expected_eng_open, expected_eng_closed], u"'{}' does not equal '{}' or '{}'".format(str_eng, expected_eng_closed, expected_eng_open)
        self.toggle_on_text_settings()
        self.toggle_language_hebrew()
        assert 'hebrew' in self.get_content_language()
        assert 'english' not in self.get_content_language()
        assert 'bilingual' not in self.get_content_language()
        assert sgmnt_heb.is_displayed() == True
        assert sgmnt_eng.is_displayed() == False
        self.toggle_on_text_settings()
        self.toggle_language_english()
        assert 'hebrew' not in self.get_content_language()
        assert 'english' in self.get_content_language()
        assert 'bilingual' not in self.get_content_language()
        assert sgmnt_heb.is_displayed() == False
        assert sgmnt_eng.is_displayed() == True
        self.toggle_on_text_settings()
        self.toggle_language_bilingual()
        assert 'hebrew' not in self.get_content_language()
        assert 'english' not in self.get_content_language()
        assert 'bilingual' in self.get_content_language()
        assert sgmnt_heb.is_displayed() == True
        assert sgmnt_eng.is_displayed() == True
        self.get_content_language()


class TextSettings(AtomicTest):
    suite_class = PageloadSuite
    every_build = True

    def body(self):

        larger = 21.6
        smaller = 18.7826
        just_text = u'בראשית ברא אלהים את השמים ואת הארץ'
        text_with_vowels = u'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ׃'
        text_with_cantillation = u'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃'
        self.load_ref("Genesis 1")
        # 1] Language: heb/eng/bilingual
        self.toggle_on_text_settings()
        self.toggle_language_english()
        assert not self.get_nth_section_hebrew(1).is_displayed()
        assert self.get_nth_section_english(1).is_displayed()

        self.toggle_on_text_settings()
        self.toggle_language_hebrew()
        assert self.get_nth_section_hebrew(1).is_displayed()
        assert not self.get_nth_section_english(1).is_displayed()

        self.toggle_on_text_settings()
        self.toggle_language_bilingual()
        assert self.get_nth_section_hebrew(1).is_displayed()
        assert self.get_nth_section_english(1).is_displayed()

        # 2] Layout: left/right/stacked
        if not self.single_panel:
            self.toggle_on_text_settings()
            self.toggle_bilingual_layout_heLeft()
            assert self.get_content_layout_direction() == 'left'

            self.toggle_on_text_settings()
            self.toggle_bilingual_layout_heRight()
            assert self.get_content_layout_direction() == 'right'

            self.toggle_on_text_settings()
            self.toggle_bilingual_layout_stacked()
            assert self.get_content_layout_direction() == 'stacked'

        # 3] Font size: small/large
        self.toggle_on_text_settings()
        font_size_original = self.get_font_size()
        self.toggle_fontSize_smaller()
        font_size_smaller = self.get_font_size()

        # self.toggle_text_settings()
        self.toggle_fontSize_larger()
        font_size_larger = self.get_font_size()
        assert font_size_larger > font_size_smaller

        # 4] Aliyot: on off
        # todo: Set up scroll_to_segment then enable this
        # self.toggle_aliyotTorah_aliyotOn()
        # self.scroll_to_segment(Ref("Genesis 2:4"))
        # assert self.is_aliyot_displayed()

        # self.toggle_on_text_settings()
        # self.toggle_aliyotTorah_aliyotOff()
        # self.scroll_reader_panel_to_bottom()
        # assert not self.is_aliyot_displayed()

        # 5] Vocalization: vowels and cantillation
        # self.toggle_on_text_settings()
        self.toggle_vowels_partial()
        assert self.get_nth_section_hebrew(1).text.strip() == text_with_vowels, u"'{}' does not equal '{}'".format(self.get_nth_section_hebrew(1).text.strip(), text_with_vowels)

        self.toggle_on_text_settings()
        self.toggle_vowels_all()
        assert self.get_nth_section_hebrew(1).text.strip() == text_with_cantillation, u"'{}' does not equal '{}'".format(self.get_nth_section_hebrew(1).text.strip(), text_with_cantillation)

        self.toggle_on_text_settings()
        self.toggle_vowels_none()
        assert self.get_nth_section_hebrew(1).text.strip() == just_text, u"'{}' does not equal '{}'".format(self.get_nth_section_hebrew(1).text.strip(), just_text)

'''
class TanakhCantillationAndVowels(AtomicTest):
    suite_class = ReaderSuite
    every_build = False

    def body(self):
        self.load_home()
        self.click_get_started()
        # self.toggle_on_text_settings()
        # self.toggle_vowels_partial()
        # assert not has_cantillation(self.get_nth_section_hebrew(1).text, False)
        # assert has_cantillation(self.get_nth_section_hebrew(1).text, True)
        #
        # self.toggle_on_text_settings()
        # self.toggle_vowels_all()
        # assert has_cantillation(self.get_nth_section_hebrew(1).text, False)
        # assert has_cantillation(self.get_nth_section_hebrew(1).text, True)
        #
        # self.toggle_on_text_settings()
        # self.toggle_vowels_none()
        # assert not has_cantillation(self.get_nth_section_hebrew(1).text)
        # assert not has_cantillation(self.get_nth_section_hebrew(1).text, False)
        # # Make sure switching to a differernt book doesn't change the cantillation/vowels settings
        # self.nav_to_text_toc(["Tanakh"], "Joshua")
        # self.load_ref("Joshua 1")
        # assert not has_cantillation(self.get_nth_section_hebrew(1).text)
        # assert not has_cantillation(self.get_nth_section_hebrew(1).text, False)
'''

class TalmudHasNoCantillation(AtomicTest):
    suite_class = ReaderSuite
    every_build = False

    def body(self):
        self.browse_to_ref("Shabbat 2b")
        assert not has_cantillation(self.get_nth_section_hebrew(1).text)
        assert not has_cantillation(self.get_nth_section_hebrew(1).text, False)
        self.toggle_on_text_settings()
        assert not self.is_aliyot_toggleSet_displayed()
        assert not self.is_vocalization_toggleSet_displayed()
        self.toggle_language_bilingual()
        self.browse_to_ref("Joshua 2")
        self.toggle_on_text_settings()
        assert not self.is_aliyot_toggleSet_displayed()
        assert self.is_vocalization_toggleSet_displayed()
        self.browse_to_ref("Genesis 1")
        self.toggle_on_text_settings()
        assert self.is_aliyot_toggleSet_displayed()
        assert self.is_vocalization_toggleSet_displayed()


class SideBarEntries(AtomicTest):
    suite_class = ReaderSuite
    every_build = True
    single_panel = False

    # todo: make this work on mobile.
    # "sidebar" elements will need to be scrolled into view before clicking

    def body(self):
        self.browse_to_ref("Genesis 1")
        self.click_segment("Genesis 1:1")
        self.click_commentary_on_sidebar()
        self.click_resources_on_sidebar()
        self.click_tanakh_on_sidebar()
        self.click_resources_on_sidebar()
        self.click_targum_on_sidebar()
        self.click_resources_on_sidebar()
        self.click_mishnah_on_sidebar()
        self.click_resources_on_sidebar()
        self.click_talmud_on_sidebar()
        self.click_resources_on_sidebar()
        self.click_midrash_on_sidebar()
        self.click_resources_on_sidebar()
        self.click_halakhah_on_sidebar()
        self.click_resources_on_sidebar()
        self.click_kabbalah_on_sidebar()
        self.click_resources_on_sidebar()
        self.click_philosophy_on_sidebar()
        self.click_resources_on_sidebar()
        self.click_chasidut_on_sidebar()
        self.click_resources_on_sidebar()
        self.click_musar_on_sidebar()
        self.click_resources_on_sidebar()
        self.click_other_on_sidebar()
        self.click_resources_on_sidebar()
        self.click_grammar_on_sidebar()
        self.click_resources_on_sidebar()
        self.click_other_text_on_sidebar()
        assert self.is_sidebar_browse_title_displayed()
        assert self.is_sidebar_calendar_title_displayed()
        self.driver.find_element_by_css_selector('.readerNavMenuMenuButton').click()
        # self.click_sheets_on_sidebar()    #commented out as sheets is being worked on
        self.click_notes_on_sidebar()
        self.click_about_on_sidebar()
        msg = self.driver.find_element_by_css_selector('#panel-1 > div.readerContent > div > div > div > section > div.detailsSection > h2 > span.int-en').text
        assert msg == u'About This Text'
        self.click_resources_on_sidebar()
        self.click_versions_on_sidebar()
        #todo: This version doesn't show up on title bar.  Rework this to change to a version that will show on bar.
        #url1 = self.get_current_url()
        #title1 = self.get_current_content_title()
        assert self.get_sidebar_nth_version_button(1).text in [u'CURRENT', u'Current'],  u"'{}' does not equal 'CURRENT' or 'Current'".format(self.get_sidebar_nth_version_button(1).text)
        assert self.get_sidebar_nth_version_button(2).text in [u'SELECT', u'Select'],  u"'{}' does not equal 'SELECT' or 'Select'".format(self.get_sidebar_nth_version_button(2).text)
        self.click_sidebar_nth_version_button(2)
        #url2 = self.get_current_url()
        #title2 = self.get_current_content_title()
        #assert url1 != url2, u"'{}' equals '{}'".format(url1, url2)
        #assert title1 != title2,  u"'{}' equals '{}'".format(title1, title2)
        time.sleep(1)
        assert self.get_sidebar_nth_version_button(1).text in [u'SELECT', u'Select'],  u"'{}' does not equal 'SELECT' or 'Select'".format(self.get_sidebar_nth_version_button(1).text)
        assert self.get_sidebar_nth_version_button(2).text in [u'CURRENT', u'Current'], u"'{}' does not equal 'CURRENT' or 'Current'".format(self.get_sidebar_nth_version_button(2).text)
        self.click_webpages_on_sidebar()
        self.click_resources_on_sidebar()
        self.login_user()
        self.click_resources_on_sidebar()
        self.click_tools_on_sidebar()
        self.click_share_on_sidebar()

        '''
        Buggy.  Doesn't work on Safari. Mobile?
        
        self.click_sidebar_facebook_link()
        url1 = self.get_newly_opened_tab_url()
        assert 'facebook.com' in url1, u"'{}' not in '{}'".format('facebook.com', url1)
        self.close_tab_and_return_to_prev_tab()
        self.click_resources_on_sidebar()
        self.click_tools_on_sidebar()
        self.click_share_on_sidebar()
        self.click_sidebar_twitter_link()
        url1 = self.get_newly_opened_tab_url()
        assert 'twitter.com' in url1, u"'{}' not in '{}'".format('twitter.com', url1)
        self.close_tab_and_return_to_prev_tab()
        '''

        self.click_resources_on_sidebar()

            # self.click_tools_on_sidebar()     #NOT checking the email option, not to open an email client. Leaving here thoupgh, just in case.
            # self.click_share_on_sidebar()
            # self.click_email_twitter_link()
            # self.click_resources_on_sidebar()
        # self.click_tools_on_sidebar()
        # self.click_add_translation_on_sidebar()   # Time out. Is this a bug?
        # self.back()
        self.click_tools_on_sidebar()
        self.click_add_connection_on_sidebar()
        time.sleep(1)
        assert self.is_sidebar_browse_title_displayed()
        assert self.is_sidebar_calendar_title_displayed()

# Switch between Hebrew and English and sample a few of the objects to make sure the language has actually changed.
class ChangeSiteLanguage(AtomicTest):
    suite_class = ReaderSuite
    every_build = False

    def body(self):
        self.nav_to_toc()
        self.click_ivrit_link()
        ivrit_title = self.get_sefaria_lib_title()
        if 'safari' in self.driver.name or "Safari" in self.driver.name:
            time.sleep(1)
            assert self.driver.find_element_by_class_name('interface-hebrew') != None
        else:
            assert ivrit_title == u'האוסף של ספריא'
            # assume you're not logged in
            # assert self.get_login_link_text() == u'התחבר'
            # assert self.get_signup_link_text() == u'הרשם'
            assert self.get_what_is_sefaria_link_text() == u'מהי ספריא'
            assert self.get_teach_with_sefaria_link_text() == u'למד באמצעות ספריא'
            assert self.get_get_involved_link_text() == u'הצטרף אלינו'
            assert self.get_donate_link_text() == u'תרומות'
            assert self.get_facebook_link_text() == u'פייסבוק'
        self.click_english_link()
        english_title = self.get_sefaria_lib_title()
        if 'safari' in self.driver.name or "Safari" in self.driver.name:
            time.sleep(1)
            assert self.driver.find_element_by_class_name('interface-english') != None
        else:
            assert english_title == u'The Sefaria Library'
            # assume you're not logged in
            # assert self.get_login_link_text() == u'Log in'
            # assert self.get_signup_link_text() == u'Sign up'
            assert self.get_what_is_sefaria_link_text() == u'What is Sefaria?'
            assert self.get_teach_with_sefaria_link_text() == u'Teach with Sefaria'
            assert self.get_get_involved_link_text() == u'Get Involved'
            assert self.get_donate_link_text() == u'Donate'
            assert self.get_facebook_link_text() == u'Facebook'


class CheckGraphs(AtomicTest):
    suite_class = PageloadSuite
    every_build = False

    # Make sure all Tanach books and Mashechtot are displayed, and sample some entries to check that torah>nevi'im>ketuvim and the Sedarim are in the correct order
    def body(self):
        self.driver.get(self.base_url + "/explore")
        #todo ^ add a wait there that is connected to content

        if 'safari' in self.driver.name or "Safari" in self.driver.name:
            time.sleep(1)  # Might fail on Safari without this sleep
        assert self.get_object_by_id('Genesis').is_displayed()
        assert self.get_object_by_id('Exodus').is_displayed()
        assert self.get_object_by_id('Leviticus').is_displayed()
        assert self.get_object_by_id('Numbers').is_displayed()
        assert self.get_object_by_id('Deuteronomy').is_displayed()
        assert float(self.get_object_by_id('Deuteronomy').get_attribute('cx')) < float(self.get_object_by_id('Joshua').get_attribute('cx'))
        assert self.get_object_by_id('Joshua').is_displayed()
        assert self.get_object_by_id('Judges').is_displayed()
        assert self.get_object_by_id('I-Samuel').is_displayed()
        assert self.get_object_by_id('II-Samuel').is_displayed()
        assert self.get_object_by_id('I-Kings').is_displayed()
        assert self.get_object_by_id('II-Kings').is_displayed()
        assert self.get_object_by_id('Isaiah').is_displayed()
        assert self.get_object_by_id('Jeremiah').is_displayed()
        assert self.get_object_by_id('Ezekiel').is_displayed()
        assert self.get_object_by_id('Hosea').is_displayed()
        assert self.get_object_by_id('Joel').is_displayed()
        assert self.get_object_by_id('Amos').is_displayed()
        assert self.get_object_by_id('Obadiah').is_displayed()
        assert self.get_object_by_id('Jonah').is_displayed()
        assert self.get_object_by_id('Micah').is_displayed()
        assert self.get_object_by_id('Nahum').is_displayed()
        assert self.get_object_by_id('Habakkuk').is_displayed()
        assert self.get_object_by_id('Zephaniah').is_displayed()
        assert self.get_object_by_id('Haggai').is_displayed()
        assert self.get_object_by_id('Zechariah').is_displayed()
        assert self.get_object_by_id('Malachi').is_displayed()
        assert float(self.get_object_by_id('Malachi').get_attribute('cx')) < float(self.get_object_by_id('Psalms').get_attribute('cx'))
        assert self.get_object_by_id('Psalms').is_displayed()
        assert self.get_object_by_id('Proverbs').is_displayed()
        assert self.get_object_by_id('Job').is_displayed()
        assert self.get_object_by_id('Song-of-Songs').is_displayed()
        assert self.get_object_by_id('Ruth').is_displayed()
        assert self.get_object_by_id('Lamentations').is_displayed()
        assert self.get_object_by_id('Ecclesiastes').is_displayed()
        assert self.get_object_by_id('Esther').is_displayed()
        assert self.get_object_by_id('Daniel').is_displayed()
        assert self.get_object_by_id('Ezra').is_displayed()
        assert self.get_object_by_id('Nehemiah').is_displayed()
        assert self.get_object_by_id('I-Chronicles').is_displayed()
        assert self.get_object_by_id('II-Chronicles').is_displayed()


        assert self.get_object_by_id('Berakhot').is_displayed()
        assert float(self.get_object_by_id('Berakhot').get_attribute('cx')) < float(self.get_object_by_id('Shabbat').get_attribute('cx'))
        assert self.get_object_by_id('Shabbat').is_displayed()
        assert self.get_object_by_id('Eruvin').is_displayed()
        assert self.get_object_by_id('Pesachim').is_displayed()
        assert self.get_object_by_id('Rosh-Hashanah').is_displayed()
        assert self.get_object_by_id('Yoma').is_displayed()
        assert self.get_object_by_id('Sukkah').is_displayed()
        assert self.get_object_by_id('Beitzah').is_displayed()
        assert self.get_object_by_id('Taanit').is_displayed()
        assert self.get_object_by_id('Megillah').is_displayed()
        assert self.get_object_by_id('Moed-Katan').is_displayed()
        assert self.get_object_by_id('Chagigah').is_displayed()
        assert float(self.get_object_by_id('Chagigah').get_attribute('cx')) < float(self.get_object_by_id('Yevamot').get_attribute('cx'))
        assert self.get_object_by_id('Yevamot').is_displayed()
        assert self.get_object_by_id('Ketubot').is_displayed()
        assert self.get_object_by_id('Nedarim').is_displayed()
        assert self.get_object_by_id('Nazir').is_displayed()
        assert self.get_object_by_id('Sotah').is_displayed()
        assert self.get_object_by_id('Gittin').is_displayed()
        assert self.get_object_by_id('Kiddushin').is_displayed()
        assert float(self.get_object_by_id('Kiddushin').get_attribute('cx')) < float(self.get_object_by_id('Bava-Kamma').get_attribute('cx'))
        assert self.get_object_by_id('Bava-Kamma').is_displayed()
        assert self.get_object_by_id('Bava-Metzia').is_displayed()
        assert self.get_object_by_id('Bava-Batra').is_displayed()
        assert self.get_object_by_id('Sanhedrin').is_displayed()
        assert self.get_object_by_id('Makkot').is_displayed()
        assert self.get_object_by_id('Shevuot').is_displayed()
        assert self.get_object_by_id('Avodah-Zarah').is_displayed()
        assert self.get_object_by_id('Horayot').is_displayed()
        assert float(self.get_object_by_id('Kiddushin').get_attribute('cx')) < float(self.get_object_by_id('Horayot').get_attribute('cx'))
        assert self.get_object_by_id('Zevachim').is_displayed()
        assert self.get_object_by_id('Menachot').is_displayed()
        assert self.get_object_by_id('Chullin').is_displayed()
        assert self.get_object_by_id('Bekhorot').is_displayed()
        assert self.get_object_by_id('Arakhin').is_displayed()
        assert self.get_object_by_id('Temurah').is_displayed()
        assert self.get_object_by_id('Keritot').is_displayed()
        assert self.get_object_by_id('Meilah').is_displayed()
        assert self.get_object_by_id('Tamid').is_displayed()
        assert float(self.get_object_by_id('Tamid').get_attribute('cx')) < float(self.get_object_by_id('Niddah').get_attribute('cx'))
        assert self.get_object_by_id('Niddah').is_displayed()


class RecentInToc(AtomicTest):
    suite_class = ReaderSuite
    single_panel = False
    every_build = True

    def body(self):
        # Using a short chapter can cause the text to fail if the following section is
        # counted as a view and saved in recent in place of the named chapter.
        self.search_ref("Joshua 1")
        self.nav_to_history().click_toc_recent("Joshua 1")
        self.browse_to_ref("Berakhot 23b")
        time.sleep(3)
        self.nav_to_history().click_toc_recent("Berakhot 23b")


class RecentInTocOnReload(AtomicTest):
    suite_class = PageloadSuite
    single_panel = False
    every_build = True

    def body(self):
        self.load_ref("Joshua 1")
        self.load_toc().nav_to_history().click_toc_recent("Joshua 1")


class NavToRefAndClickSegment(AtomicTest):
    suite_class = ReaderSuite
    every_build = True

    def body(self):
        self.browse_to_ref("Psalms 65:4").click_segment("Psalms 65:4")
        assert "Psalms.65.4" in self.driver.current_url, self.driver.current_url
        assert "with=all" in self.driver.current_url, self.driver.current_url

        # If we're one level deep in a menu, go back.
        elems = self.driver.find_elements_by_css_selector(".connectionsHeaderTitle.active")
        if len(elems) > 0:
            elems[0].click()

        self.click_category_filter("Commentary")
        self.click_text_filter("Ibn Ezra")

        assert "Psalms.65.4" in self.driver.current_url, self.driver.current_url
        assert "with=Ibn%20Ezra" in self.driver.current_url or "with=Ibn Ezra" in self.driver.current_url, self.driver.current_url

        self.click_segment_to_close_commentary("Psalms 65:4")  #  This is needed on mobile, to close the commentary window


class LoadRefAndClickSegment(AtomicTest):
    suite_class = PageloadSuite
    every_build = True

    def body(self):
        self.load_ref("Psalms 65:4").click_segment("Psalms 65:4")
        assert "Psalms.65.4" in self.driver.current_url, self.driver.current_url
        assert "with=all" in self.driver.current_url, self.driver.current_url

        self.click_category_filter("Commentary")
        self.click_text_filter("Ibn Ezra")

        assert "Psalms.65.4" in self.driver.current_url, self.driver.current_url
        assert "with=Ibn%20Ezra" in self.driver.current_url or "with=Ibn Ezra" in self.driver.current_url, self.driver.current_url


class LoadRefWithCommentaryAndClickOnCommentator(AtomicTest):
    suite_class = PageloadSuite
    every_build = True

    def body(self):
        self.load_ref("Psalms 45:5", filter="all").click_category_filter("Commentary").click_text_filter("Rashi")
        assert "Psalms.45.5" in self.driver.current_url, self.driver.current_url
        assert "with=Rashi" in self.driver.current_url, self.driver.current_url


class NavAndVerifyTextTOC(AtomicTest):
    suite_class = ReaderSuite
    every_build = True

    def body(self):
        navs = [
            (["Tanakh"], "Genesis"),  # Simple Text
            (["Talmud"], "Shabbat"),  # Talmud Numbering
            (["Tanakh", "Ibn Ezra"], "Ibn Ezra on Psalms"),  # Commentary on Simple text
            (["Kabbalah"], "Zohar"),  # Zohar, just cuz
            (["Talmud", "Tosafot"], "Tosafot on Shabbat"),  # Commentary on Talmud
            (["Liturgy"], "Pesach Haggadah") # Complex text
        ]

        for (cats, text_title) in navs:
            self.nav_to_text_toc(cats, text_title)


class LoadAndVerifyIndepenedentTOC(AtomicTest):
    suite_class = PageloadSuite
    every_build = True

    def body(self):
        titles = [
            "Genesis",  # Simple Text
            "Shabbat",  # Talmud Numbering
            "Ibn Ezra on Psalms",  # Commentary on Simple text
            "Zohar",  # Zohar, just cuz
            "Tosafot on Shabbat",  # Commentary on Talmud
            "Pesach Haggadah" # Complex text
        ]
        for title in titles:
            self.load_text_toc(title)

       # self.load_text_toc("Numbers").click_text_toc_section("Numbers 12").back().click_text_toc_section("Numbers 3").back()


class LoadSpanningRefAndOpenConnections(AtomicTest):
    suite_class = PageloadSuite
    every_build = True

    def body(self):
        self.load_ref("Shabbat 2a-2b")
        self.click_segment("Shabbat 2a:1")


class NavToSpanningRefAndOpenConnections(AtomicTest):
    suite_class = ReaderSuite
    every_build = True
    single_panel = False

    def body(self):
        self.search_ref("Shabbat 2a-2b")
        self.click_segment("Shabbat 2a:1")


class PermanenceOfRangedRefs(AtomicTest):
    """
    There have been bugs around Links with ranged references.
    This test checks that they are present, and that they survive to a second click (they had previously been ephemeral.)
    """
    suite_class = ReaderSuite
    every_build = True
    single_panel = False  # Segment clicks on mobile have different semantics  todo: write this for mobile?  It's primarily a data test.

    def body(self):
        self.search_ref("Shabbat 2a")
        self.click_segment("Shabbat 2a:1")
        self.click_category_filter("Mishnah")
        assert self.find_text_filter("Mishnah Shabbat")
        self.click_segment("Shabbat 2a:2")
        assert self.find_text_filter("Mishnah Shabbat")
        self.click_segment("Shabbat 2a:1")
        assert self.find_text_filter("Mishnah Shabbat")
        self.click_segment("Shabbat 2a:2")
        assert self.find_text_filter("Mishnah Shabbat")


class NavToTocAndCheckPresenceOfDownloadButton(AtomicTest):
    suite_class = ReaderSuite
    every_build = True
    exclude = ['And/5.1', 'iPh5s']  # Android driver doesn't support "Select" class. Haven't found workaround.

    # iPhone has an unrelated bug where a screen size refresh mid-test causes this to fail.
    def body(self):
        # Load Shabbat TOC and scroll to bottom
        self.nav_to_text_toc(["Talmud"], "Shabbat").scroll_nav_panel_to_bottom()

        # Check that DL Button is visible and not clickable
        visible = self.driver.execute_script(
            'var butt = document.getElementsByClassName("downloadButtonInner")[0]; ' + \
            'var butt_bot = butt.getBoundingClientRect().top + butt.getBoundingClientRect().height; ' + \
            'var win_height = window.innerHeight; ' + \
            'return win_height > butt_bot;'
        )
        assert visible, "Download button below page"
        # This isn't sufficient - it only checks if it's visible in the DOM
        # WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, ".downloadButtonInner")))

        WebDriverWait(self.driver, TEMPER).until(
            invisibility_of_element_located((By.CSS_SELECTOR, '.dlVersionFormatSelect + a')))

        # Select version and format
        select1 = Select(self.driver.find_element_by_css_selector('.dlVersionTitleSelect'))
        select1.select_by_value("Wikisource Talmud Bavli/he")
        select2 = Select(self.driver.find_element_by_css_selector('.dlVersionFormatSelect'))
        select2.select_by_value("csv")

        # Check that DL button is clickable
        WebDriverWait(self.driver, TEMPER).until(
            visibility_of_element_located((By.CSS_SELECTOR, '.dlVersionFormatSelect + a')))


class LoadTocAndCheckPresenceOfDownloadButton(AtomicTest):
    suite_class = PageloadSuite
    every_build = True
    exclude = ['And/5.1']           # Android driver doesn't support "Select" class. Haven't found workaround.
                                    # iPhone 5 used to have an unrelated bug where a screen size refresh mid-test causes this to fail.
                                    # Is this bug still on iPhone 6?

    def body(self):
        # Load Shabbat TOC and scroll to bottom
        self.load_text_toc("Shabbat").scroll_nav_panel_to_bottom()

        # Check that DL Button is visible and not clickable
        visible = self.driver.execute_script(
            'var butt = document.getElementsByClassName("downloadButtonInner")[0]; ' +\
            'var butt_bot = butt.getBoundingClientRect().top + butt.getBoundingClientRect().height; ' +\
            'var win_height = window.innerHeight; ' +\
            'return win_height > butt_bot;'
        )
        assert visible, "Download button below page"
        # This isn't sufficient - it only checks if it's visible in the DOM
        #WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, ".downloadButtonInner")))

        WebDriverWait(self.driver, TEMPER).until(invisibility_of_element_located((By.CSS_SELECTOR, '.dlVersionFormatSelect + a')))

        # Select version and format
        select1 = Select(self.driver.find_element_by_css_selector('.dlVersionTitleSelect'))
        select1.select_by_value("Wikisource Talmud Bavli/he")
        select2 = Select(self.driver.find_element_by_css_selector('.dlVersionFormatSelect'))
        select2.select_by_value("csv")

        # Check that DL button is clickable
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, '.dlVersionFormatSelect + a')))


class LoadSearchFromURL(AtomicTest):
    suite_class = PageloadSuite
    every_build = True

    def body(self):
        self.load_search_url("Passover")


class ClickVersionedSearchResultDesktop(AtomicTest):
    suite_class = DeepReaderSuite
    single_panel = False

    def body(self):
        self.search_for("they howl like dogs")
        versionedResult = self.driver.find_element_by_css_selector('a[href="/Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein?qh=they howl like dogs"]')
        versionedResult.click()
        WebDriverWait(self.driver, TEMPER).until(staleness_of(versionedResult))
        assert "Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein" in self.driver.current_url, self.driver.current_url


class BrowserBackAndForward(AtomicTest):
    suite_class = ReaderSuite
    every_build = True
    exclude = ['FF/x12', 'FF/x13', 'Sf/x11', 'Sf/x12', 'Sf/x13'] # Buggy handling of Back button

    def body(self):
        # Sidebar
        self.browse_to_ref("Genesis 2").click_segment("Genesis 2:2").click_category_filter("Commentary")
        assert "Genesis.2.2" in self.driver.current_url, self.driver.current_url        
        assert "with=Commentary" in self.driver.current_url, self.driver.current_url        
        self.driver.back()
        assert "Genesis.2.2" in self.driver.current_url, self.driver.current_url        
        assert "with=all" in self.driver.current_url, self.driver.current_url        
        self.driver.back()
        assert "Genesis.2" in self.driver.current_url, self.driver.current_url
        assert "with=" not in self.driver.current_url, self.driver.current_url        
        self.driver.forward()
        assert "Genesis.2.2" in self.driver.current_url, self.driver.current_url        
        assert "with=all" in self.driver.current_url, self.driver.current_url  
        self.driver.forward()
        assert "Genesis.2.2" in self.driver.current_url, self.driver.current_url        
        assert "with=Commentary" in self.driver.current_url, self.driver.current_url
        # Todo - infinite scroll, nav pages, display options, ref normalization

        self.click_segment_to_close_commentary("Genesis 2:2")  # Close commentary window on mobile


class ClickVersionedSearchResultMobile(AtomicTest):
    suite_class = DeepReaderSuite
    multi_panel = False

    def body(self):
        hamburger = self.driver.find_element_by_css_selector(".readerNavMenuMenuButton")
        if hamburger:
            hamburger.click()
            wait = WebDriverWait(self.driver, TEMPER)
            wait.until(staleness_of(hamburger))
        self.search_for("Dogs")
        versionedResult = self.driver.find_element_by_css_selector('a[href="/Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein?qh=Dogs"]')
        versionedResult.click()
        WebDriverWait(self.driver, TEMPER).until(staleness_of(versionedResult))
        assert "Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein" in self.driver.current_url, self.driver.current_url


class SaveNewSourceSheet(AtomicTest):
    suite_class = ReaderSuite
    every_build = True
    single_panel = False  # No source sheets on mobile

    def body(self):
        self.login_user()
        self.nav_to_sheets()

        textBox = self.driver.find_element_by_css_selector("#inlineAdd")

        textBox.send_keys("Genesis")
        WebDriverWait(self.driver, TEMPER).until(
            one_of_these_texts_present_in_element((By.ID, "inlineAddDialogTitle"), ["Enter a", "ENTER A"]))

        textBox.send_keys(" 1")
        WebDriverWait(self.driver, TEMPER).until(
            one_of_these_texts_present_in_element((By.ID, "inlineAddDialogTitle"), ["to continue or", "TO CONTINUE OR"]))

        textBox.send_keys(":9")
        WebDriverWait(self.driver, TEMPER).until(
            one_of_these_texts_present_in_element((By.ID, "inlineAddDialogTitle"), ["to continue or enter a range", "TO CONTINUE OR ENTER A RANGE"]))

        self.driver.find_element_by_css_selector("#inlineAddSourceOK").click()

        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, "#save")))
        saveButton = self.driver.find_element_by_css_selector('#save')
        saveButton.click()

        try:
            # this is site language dependent. try both options
            WebDriverWait(self.driver, TEMPER).until(title_contains("New Source Sheet | Sefaria Source Sheet Builder"))
        except TimeoutException:
            WebDriverWait(self.driver, TEMPER).until(title_contains(u"דף מקורות חדש | בונה דפי המקורות בספריא"))

        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, '.headerNavSection .library')))


'''
# Not sure why this isn't working.
class LoginOnMobile(AtomicTest):
    suite_class = ReaderSuite
    every_build = True
    multi_panel = False  # Login is tested as part of SaveNewSourceSheet on multipanel

    def body(self):
        self.login_user()
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".accountLinks .account")))

'''


class SpecialCasedSearchBarNavigations(AtomicTest):
    suite_class = ReaderSuite
    every_build = True
    single_panel = False  # This hasn't yet been implemented on mobile

    def body(self):
        self.type_in_search_box("Shabbat")
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, ".readerTextTableOfContents")))
        self.type_in_search_box("Shabbat 12b")
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, ".segment")))
        self.type_in_search_box("Yosef Giqatillah")
        WebDriverWait(self.driver, TEMPER).until(title_contains("Yosef Giqatillah"))
        self.type_in_search_box("Midrash")
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, ".readerNavCategoryMenu")))

        self.type_in_search_box(u"שבת")
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, ".readerTextTableOfContents")))
        self.type_in_search_box(u"שבת י״ד")
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, ".segment")))
        self.type_in_search_box(u"יוסף שאול נתנזון")
        WebDriverWait(self.driver, TEMPER).until(title_contains("Yosef"))
        self.type_in_search_box(u"מדרש")
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, ".readerNavCategoryMenu")))


class EditorPagesLoad(AtomicTest):
    #todo: build a no-load reader test to match this
    suite_class = PageloadSuite
    every_build = True
    single_panel = False

    def body(self):
        self.load_toc()
        #logged in stuff
        self.login_user()
        self.load_translate("Shabbat 43b")
        # self.load_edit("Genesis 1", "en", "Sefaria Community Translation") -- need debugging, threw a 500 on travis, works local
        self.load_add("Mishnah Peah 4")


class InfiniteScrollUp(AtomicTest):
    suite_class = ReaderSuite
    every_build = True

    def test_up(self, start_ref, prev_segment_ref):
        from urllib import quote_plus
        self.browse_to_ref(start_ref)
        self.scroll_reader_panel_up(1000)
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, '[data-ref="%s"]' % prev_segment_ref)))
        time.sleep(.5)
        # Wait then check that URL has not changed as a proxy for checking that visible scroll position has not changed
        assert quote_plus(Ref(start_ref).url()) in self.driver.current_url, self.driver.current_url

    def body(self):
        # Simple Text
        self.test_up("Job 32", "Job 31:40")
        # Complex Text
        self.test_up("Pesach Haggadah, Magid, The Four Sons", "Pesach Haggadah, Magid, Story of the Five Rabbis 2")
  

class InfiniteScrollDown(AtomicTest):
    suite_class = ReaderSuite
    every_build = True

    def test_down(self, start_ref, next_segment_ref):
        self.browse_to_ref(start_ref).scroll_reader_panel_to_bottom()
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, '[data-ref="%s"]' % next_segment_ref)))        

    def body(self):
        # Simple Text
        self.test_down("Job 32", "Job 33:1")
        # Complex Text
        self.test_down("Pesach Haggadah, Magid, The Four Sons", "Pesach Haggadah, Magid, Yechol Me'rosh Chodesh 1")


"""
# Not complete

class LoadRefAndOpenLexicon(AtomicTest):
    suite_class = ReaderSuite
    single_panel = False

    def body(self):
        self.load_ref("Numbers 25:5", lang="he").click_segment("Numbers 25:5")
        assert "Numbers.25.5" in self.driver.current_url, self.driver.current_url
        assert "with=all" in self.driver.current_url, self.driver.current_url
        selector = '.segment[data-ref="{}"] > span.he'.format("Numbers 25:5")
        self.driver.execute_script(
            "var range = document.createRange();" +
            "var start = document.querySelectorAll('[data-ref=\"Numbers 25:5\"]');" +
            "var textNode = start.querySelectorAll('span.he')[0].firstChild;" +
            "range.setStart(textNode, 0);" +
            "range.setEnd(textNode, 5);" +
            "window.getSelection().addRange(range);"
        )
        from selenium.webdriver import ActionChains
        actions = ActionChains(self.driver)
        element = self.driver.find_element_by_css_selector(selector)
        actions.move_to_element(element)
        actions.double_click(on_element=element)
        actions.move_by_offset(50, 0)
        actions.click_and_hold(on_element=None)
        actions.move_by_offset(70, 0)
        actions.release(on_element=None)
        actions.perform()
        WebDriverWait(self.driver, TEMPER).until(element_to_be_clickable((By.CSS_SELECTOR, ".lexicon-content")))

"""
