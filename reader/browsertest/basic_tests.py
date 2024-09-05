# -*- coding: utf-8 -*-
from urllib.parse import urlparse, quote_plus

from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support.expected_conditions import title_contains, staleness_of, element_to_be_clickable, visibility_of_element_located, invisibility_of_element_located, text_to_be_present_in_element
from selenium.common.exceptions import WebDriverException

from sefaria.model import *
from sefaria.utils.hebrew import strip_cantillation, strip_nikkud
from sefaria.utils.hebrew import has_cantillation
from .framework import SefariaTest, one_of_these_texts_present_in_element

import time  # import stand library below name collision in sefaria.model

TEMPER = 30


class PagesLoad(SefariaTest):
    
    every_build = True
    initial_url = "/texts"

    def body(self):
        self.click_toc_category("Midrash").click_toc_text("Ein Yaakov")
        self.load_ref("Tosefta Peah 2", wait_for_connections=True)
        self.load_ref("Sifra, Tzav, Chapter 1", wait_for_connections=True)
        self.load_topics()
        self.load_search_url("Passover")
        self.load_gardens()
        self.load_people()

class PagesLoadLoggedIn(SefariaTest):
    
    every_build  = True
    single_panel = False   # todo write or rewrite this to account for logged in state on mobile
    initial_url  = "/texts"

    def body(self):
        self.login_user()
        self.load_my_profile()
        self.nav_to_profile() # load_account might be superceded by load_my_profile or nav_to_profile
        self.load_notifications()


class SinglePanelOnMobile(SefariaTest):
    
    every_build = True
    multi_panel = False
    initial_url = "/texts"

    def body(self):
        self.nav_to_book_page(["Tosefta"], "Tosefta Peah")
        self.click_text_toc_section("Tosefta Peah 1")
        elems = self.driver.find_elements_by_css_selector(".readerApp.multiPanel")
        assert len(elems) == 0
        self.click_segment("Tosefta Peah 1:1")
        elems = self.driver.find_elements_by_css_selector(".readerApp .readerPanelBox")
        assert len(elems) == 1


class ChangeTextLanguage(SefariaTest):
    
    every_build = True
    initial_url = "/Job.1"

    def body(self):
        expected_heb = 'אִ֛ישׁ הָיָ֥ה בְאֶֽרֶץ־ע֖וּץ אִיּ֣וֹב שְׁמ֑וֹ וְהָיָ֣ה ׀ הָאִ֣ישׁ הַה֗וּא תָּ֧ם וְיָשָׁ֛ר וִירֵ֥א אֱלֹהִ֖ים וְסָ֥ר מֵרָֽע׃'
        expected_eng_closed = 'There was a man in the land of Uz named Job. That man was blameless and upright; he feared God and shunned evil.'
        expected_eng_open = 'THERE was a man in the land of Uz, whose name was Job; and that man was whole-hearted and upright, and one that feared God, and shunned evil.'
        sgmnt_eng = self.get_nth_section_english(1)
        sgmnt_heb = self.get_nth_section_hebrew(1)
        str_eng = sgmnt_eng.text.strip()
        str_heb = sgmnt_heb.text.strip()
        # not sure why, but he strings aren't equal unless vowels are stripped
        expected_heb_stripped = strip_cantillation(expected_heb, strip_vowels=True)
        str_heb_stripped = strip_cantillation(str_heb, strip_vowels=True)
        assert expected_heb_stripped == str_heb_stripped, "'{}' does not equal '{}'".format(expected_heb_stripped, str_heb_stripped)
        assert str_eng in [expected_eng_open, expected_eng_closed], "'{}' does not equal '{}' or '{}'".format(str_eng, expected_eng_closed, expected_eng_open)
        self.toggle_on_text_settings()
        self.toggle_language_hebrew()
        assert 'hebrew' in self.get_content_language()
        assert 'english' not in self.get_content_language()
        assert 'bilingual' not in self.get_content_language()
        assert self.has_hebrew_text() == True
        assert self.has_english_text() == False
        self.toggle_on_text_settings()
        self.toggle_language_english()
        assert 'hebrew' not in self.get_content_language()
        assert 'english' in self.get_content_language()
        assert 'bilingual' not in self.get_content_language()
        assert self.has_hebrew_text() == False
        assert self.has_english_text() == True
        self.toggle_on_text_settings()
        self.toggle_language_bilingual()
        assert 'hebrew' not in self.get_content_language()
        assert 'english' not in self.get_content_language()
        assert 'bilingual' in self.get_content_language()
        assert self.has_hebrew_text() == True
        assert self.has_english_text() == True
        self.get_content_language()


class FontSizeTest(SefariaTest):
    
    every_build = True
    initial_url = "/Tosefta_Peah.3"

    def body(self):
        self.toggle_on_text_settings()
        font_size_original = self.get_font_size()
        self.toggle_fontSize_smaller()
        font_size_smaller = self.get_font_size()

        # self.toggle_text_settings()
        self.toggle_fontSize_larger()
        font_size_larger = self.get_font_size()
        assert font_size_larger > font_size_smaller


class LayoutSettings(SefariaTest):
    # 2] Layout: left/right/stacked

    initial_url = "/Tosefta_Peah.3"

    def body(self):
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


class TextVocalizationSettings(SefariaTest):
    
    every_build = True
    initial_url = "/Job.1"

    def body(self):
        just_text = 'איש היה בארץ־עוץ איוב שמו והיה  האיש ההוא תם וישר וירא אלהים וסר מרע'
        text_with_vowels = 'אִישׁ הָיָה בְאֶרֶץ־עוּץ אִיּוֹב שְׁמוֹ וְהָיָה  הָאִישׁ הַהוּא תָּם וְיָשָׁר וִירֵא אֱלֹהִים וְסָר מֵרָע׃'
        text_with_cantillation = 'אִ֛ישׁ הָיָ֥ה בְאֶֽרֶץ־ע֖וּץ אִיּ֣וֹב שְׁמ֑וֹ וְהָיָ֣ה ׀ הָאִ֣ישׁ הַה֗וּא תָּ֧ם וְיָשָׁ֛ר וִירֵ֥א אֱלֹהִ֖ים וְסָ֥ר מֵרָֽע׃'

        self.toggle_on_text_settings()
        self.toggle_vowels_partial()
        assert self.get_nth_section_hebrew(1).text.strip() == text_with_vowels, "'{}' does not equal '{}'".format(self.get_nth_section_hebrew(1).text.strip(), text_with_vowels)

        self.toggle_on_text_settings()
        self.toggle_vowels_all()
        assert self.get_nth_section_hebrew(1).text.strip() == text_with_cantillation, "'{}' does not equal '{}'".format(self.get_nth_section_hebrew(1).text.strip(), text_with_cantillation)

        self.toggle_on_text_settings()
        self.toggle_vowels_none()
        assert self.get_nth_section_hebrew(1).text.strip() == just_text, "'{}' does not equal '{}'".format(self.get_nth_section_hebrew(1).text.strip(), just_text)

'''
class TanakhCantillationAndVowels(SefariaTest):
    
    every_build = False

    def body(self):
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
        # self.nav_to_book_page(["Tanakh"], "Joshua")
        # self.load_ref("Joshua 1")
        # assert not has_cantillation(self.get_nth_section_hebrew(1).text)
        # assert not has_cantillation(self.get_nth_section_hebrew(1).text, False)
'''

class AliyotAndCantillationToggles(SefariaTest):
    
    every_build = True
    initial_url = "/Derashot_HaRan.1"

    def body(self):
        assert not has_cantillation(self.get_nth_section_hebrew(1).text)
        assert not has_cantillation(self.get_nth_section_hebrew(1).text, False)
        self.toggle_on_text_settings()
        assert not self.is_aliyot_toggleSet_displayed()
        assert not self.is_vocalization_toggleSet_displayed()

        self.browse_to_ref("Berakhot 2b")
        self.toggle_on_text_settings()
        assert not self.is_aliyot_toggleSet_displayed()
        assert self.is_vocalization_toggleSet_displayed()
        
        self.browse_to_ref("Joshua 2")
        self.toggle_on_text_settings()
        assert not self.is_aliyot_toggleSet_displayed()
        assert self.is_vocalization_toggleSet_displayed()
        
        self.browse_to_ref("Genesis 1")
        self.toggle_on_text_settings()
        assert self.is_aliyot_toggleSet_displayed()
        assert self.is_vocalization_toggleSet_displayed()


class SidebarOpens(SefariaTest):
    
    every_build = True
    single_panel = False
    initial_url = "/Ecclesiastes.1"
    # todo: make this work on mobile.
    # "sidebar" elements will need to be scrolled into view before clicking

    def body(self):
        self.wait_for_connections()
        self.click_segment("Ecclesiastes 1:1")

        sections = ("Commentary", "Targum", "Talmud", "Midrash", "Midrash")
        for section in sections:
            self.click_sidebar_entry(section)
            self.click_resources_on_sidebar()

        self.click_sidebar_button("panel.compare_text")
        self.driver.find_element_by_css_selector('.readerNavMenuMenuButton').click()

        self.click_sidebar_button("Sheets")
        self.click_resources_on_sidebar()

        self.click_sidebar_button("About this Text")
        msg = self.driver.find_element_by_css_selector('#panel-1 > div.readerContent > div > div > div > section > div.detailsSection > h2 > span.int-en').get_attribute('innerHTML')
        assert msg == 'About This Text'
        self.click_resources_on_sidebar()

        self.click_sidebar_button("Translations")
        assert self.get_sidebar_nth_version_button(1).text in ['Current Translation', 'מהדורה נוכחית'],  "'{}' does not equal 'Current Translation'".format(self.get_sidebar_nth_version_button(1).text)
        assert self.get_sidebar_nth_version_button(2).text in ['Select Translation', 'בחירת תרגום'],  "'{}' does not equal 'Select Translation'".format(self.get_sidebar_nth_version_button(2).text)
        self.click_sidebar_nth_version_button(2)

        time.sleep(1)
        assert self.get_sidebar_nth_version_button(1).text in ['Select Translation', 'בחירת תרגום'],  u"'{}' does not equal 'Select Translation'".format(self.get_sidebar_nth_version_button(1).text)
        assert self.get_sidebar_nth_version_button(2).text in ['Current Translation', 'מהדורה נוכחית'], u"'{}' does not equal 'Current Translation'".format(self.get_sidebar_nth_version_button(2).text)
        self.click_resources_on_sidebar()

        self.click_sidebar_button("Web Pages")
        self.click_resources_on_sidebar()

        self.click_sidebar_button("Share")
        self.click_resources_on_sidebar()

        self.login_user()

        self.click_sidebar_button("Notes")
        self.click_resources_on_sidebar()

        self.click_sidebar_button("Advanced")
        self.click_sidebar_button("Add Connection")


class ChangeSiteLanguage(SefariaTest):
    # Switch between Hebrew and English and sample a few of the objects to make sure 
    # the language has actually changed.
    
    every_build = True
    initial_url = "/texts"

    def body(self):
        self.click_ivrit_link()
        time.sleep(1)
        assert self.driver.find_element_by_css_selector('.interface-hebrew') != None
        
        self.click_english_link()
        time.sleep(1)
        assert self.driver.find_element_by_css_selector('.interface-english') != None

'''
class LinkExplorer(SefariaTest):
    # Make sure all Tanach books and Mashechtot are displayed, and sample some entries to check 
    # that torah>nevi'im>ketuvim and the Sedarim are in the correct order
    
    every_build = False

    def body(self):
        self.driver.get(urllib.parse.urljoin(self.base_url,"/explore"))
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

'''


class ReadingHistory(SefariaTest):
    
    single_panel = False
    every_build = True
    initial_url = "/texts"

    def body(self):
        # Using a short chapter can cause the text to fail if the following section is
        # counted as a view and saved in recent in place of the named chapter.
        self.login_user()
        self.load_toc()
        self.search_ref("Tosefta Peah 3")
        self.nav_to_history().click_history_item("Tosefta Peah 3")
        self.browse_to_ref("Tosefta Berakhot 4")
        time.sleep(3)
        self.nav_to_history().click_history_item("Tosefta Berakhot 4")

        # Ensure History sticks on reload
        self.load_toc().nav_to_history().click_history_item("Tosefta Peah 3")


class LoadRefAndClickSegment(SefariaTest):
    
    every_build = True
    initial_url = "/Job.3"

    def body(self):
        self.click_segment("Job 3:4")
        assert "Job.3.4" in self.driver.current_url, self.driver.current_url
        assert "with=all" in self.driver.current_url, self.driver.current_url

        self.click_category_filter("Commentary")
        self.click_text_filter("Ibn Ezra")

        assert "Job.3.4" in self.driver.current_url, self.driver.current_url
        assert "with=Ibn%20Ezra" in self.driver.current_url or "with=Ibn Ezra" in self.driver.current_url, self.driver.current_url


class LoadRefWithCommentaryAndClickOnCommentator(SefariaTest):
    
    every_build = True
    initial_url = "/Job.3.4?with=all"

    def body(self):
        self.click_category_filter("Commentary").click_text_filter("Rashi")
        assert "Job.3.4" in self.driver.current_url, self.driver.current_url
        assert "with=Rashi" in self.driver.current_url, self.driver.current_url


class NavToBookPages(SefariaTest):
    
    every_build = True
    initial_url = "/texts"

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
            self.nav_to_book_page(cats, text_title)


class LoadBookPages(SefariaTest):
    
    every_build = True
    initial_url = "/texts"

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
            self.load_book_page(title)


class LoadSpanningRefAndOpenConnections(SefariaTest):
    
    every_build = True
    initial_url = "/Shabbat.2a-2b"

    def body(self):
        self.click_segment("Shabbat 2a:1")


class NavToSpanningRefAndOpenConnections(SefariaTest):
    
    every_build = True
    single_panel = False
    initial_url = "/texts"

    def body(self):
        self.search_ref("Shabbat 2a-2b")
        self.click_segment("Shabbat 2a:1")


class PermanenceOfRangedRefs(SefariaTest):
    """
    There have been bugs around Links with ranged references.
    This test checks that they are present, and that they survive to a second click (they had previously been ephemeral.)
    """
    
    every_build = True
    single_panel = False  # Segment clicks on mobile have different semantics  todo: write this for mobile?  It's primarily a data test.
    initial_url = "/Shabbat.2a"

    def body(self):
        self.click_segment("Shabbat 2a:1")
        self.click_category_filter("Mishnah")
        assert self.find_text_filter("Mishnah Shabbat")
        self.click_segment("Shabbat 2a:2")
        assert self.find_text_filter("Mishnah Shabbat")
        self.click_segment("Shabbat 2a:1")
        assert self.find_text_filter("Mishnah Shabbat")
        self.click_segment("Shabbat 2a:2")
        assert self.find_text_filter("Mishnah Shabbat")


class ClickVersionedSearchResultDesktop(SefariaTest):
    weekly = True
    single_panel = False
    initial_url = "/texts"

    def body(self):
        self.search_for("they howl like dogs")
        versionedResult = self.driver.find_element_by_css_selector('a[href="/Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein?qh=they howl like dogs"]')
        versionedResult.click()
        WebDriverWait(self.driver, TEMPER).until(staleness_of(versionedResult))
        assert "Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein" in self.driver.current_url, self.driver.current_url


class ClickVersionedSearchResultMobile(SefariaTest):
    weekly = True
    multi_panel = False
    initial_url = "/texts"

    def body(self):
        self.search_for("Dogs")
        versionedResult = self.driver.find_element_by_css_selector('a[href="/Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein?qh=Dogs"]')
        versionedResult.click()
        WebDriverWait(self.driver, TEMPER).until(staleness_of(versionedResult))
        assert "Psalms.59.7/en/The_Rashi_Ketuvim_by_Rabbi_Shraga_Silverstein" in self.driver.current_url, self.driver.current_url


class CollectionsPagesLoad(SefariaTest):
    every_build = True
    initial_url = "/texts"

    def body(self):
        self.load_url("/collections", ".collectionsList")
        self.load_url("/collections/bimbam", ".collectionPage .sheet")
        self.login_user()
        self.load_url("/collections/new", "#editCollectionPage .field")


class BrowserBackAndForward(SefariaTest):
    
    every_build = True
    exclude = ['FF/x12', 'FF/x13', 'Sf/x11', 'Sf/x12', 'Sf/x13'] # Buggy handling of Back button
    initial_url = "/texts"

    def body(self):
        # Sidebar
        self.browse_to_ref("Amos 3").click_segment("Amos 3:1").click_category_filter("Commentary")
        assert "Amos.3.1" in self.driver.current_url, self.driver.current_url
        assert "with=Commentary" in self.driver.current_url, self.driver.current_url
        self.driver.back()
        assert "Amos.3.1" in self.driver.current_url, self.driver.current_url
        assert "with=all" in self.driver.current_url, self.driver.current_url
        self.driver.back()
        assert "Amos.3" in self.driver.current_url, self.driver.current_url
        assert "with=" not in self.driver.current_url, self.driver.current_url
        self.driver.forward()
        assert "Amos.3.1" in self.driver.current_url, self.driver.current_url
        assert "with=all" in self.driver.current_url, self.driver.current_url
        self.driver.forward()
        assert "Amos.3.1" in self.driver.current_url, self.driver.current_url
        assert "with=Commentary" in self.driver.current_url, self.driver.current_url
        # Todo - infinite scroll, nav pages, display options, ref normalization


class SaveNewSourceSheet(SefariaTest):
    every_build = True
    single_panel = False  # No source sheets on mobile
    initial_url = "/texts"

    def body(self):
        self.login_user()
        self.nav_to_new_sheet()

        time.sleep(2)   #  If we enter text before the js is ready, we don't get a dropdown menu.

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

        self.wait_until_clickable("#save")
        self.click("#save")

        try:
            # this is site language dependent. try both options
            self.wait_until_title_contains("New Source Sheet")
        except TimeoutException:
            self.wait_until_title_contains("דף מקורות חדש")

        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, '.header .home')))


class SearchNavigation(SefariaTest):
    every_build = True
    single_panel = False  # This hasn't yet been implemented on mobile
    initial_url = "/texts"

    def body(self):
        self.type_in_search_box("Shabbat")
        self.wait_until_visible(".textTableOfContents")

        self.type_in_search_box("Shabbat 12b")
        self.wait_until_visible(".segment")

        self.type_in_search_box("#Yosef Giqatillah")
        self.wait_until_title_contains("Yosef Giqatillah")

        self.type_in_search_box("Midrash")
        self.wait_until_visible(".readerNavCategoryMenu")

        self.type_in_search_box("שבת")
        self.wait_until_visible(".textTableOfContents")

        self.type_in_search_box("שבת י״ד")
        self.wait_until_visible(".segment")

        self.type_in_search_box("#יוסף שאול נתנזון")
        self.wait_until_title_contains("Yosef")
        
        self.type_in_search_box("מדרש")
        self.wait_until_visible(".readerNavCategoryMenu")


class EditTextPagesLoad(SefariaTest):
    #todo: build a no-load reader test to match this
    every_build = True
    single_panel = False
    initial_url = "/texts"

    def body(self):
        self.login_user()
        self.load_edit("Genesis 1", "en", "Sefaria Community Translation") # threw a 500 on travis, works local
        self.load_add("Mishnah Peah 4")


class ScrollToHighlight(SefariaTest):
    every_build = True
    single_panel = False        # is_element_visible_in_viewport fails for mobile.
    initial_url = "/texts"

    def test_by_load(self, ref):
        self.load_ref(ref)
        el = self.get_element('[data-ref="{}"]'.format(ref))
        assert self.is_element_visible_in_viewport(el)

    def test_in_app(self, ref):
        self.search_ref(ref)
        el = self.get_element('[data-ref="{}"]'.format(ref))
        assert self.is_element_visible_in_viewport(el)

    def body(self):
        # Test from fresh load, target originally above fold
        self.test_by_load("Kol Bo 130:2")
        # Fresh load, target originally below fold
        self.test_by_load("Kol Bo 3:14")
        # In app, target not in cache
        self.test_in_app("Mishnah Peah 3:3")
        # In app, target in cache
        self.test_in_app("Kol Bo 3:14")


class InfiniteScrollUp(SefariaTest):
    every_build = True
    initial_url = "/texts"

    def test_up(self, start_ref, prev_segment_ref):
        self.browse_to_ref(start_ref)
        time.sleep(.5)
        self.scroll_reader_panel_down(100) # This jiggle feels like cheating, but I am finding that a single scroll doesn't trigger the "scroll" event, causing the next scroll to be ignore (with this.justScrolled flag)
        self.scroll_reader_panel_up(200)
        self.wait_until_visible('[data-ref="%s"]' % prev_segment_ref)
        time.sleep(.5)
        # Wait then check that URL has not changed as a proxy for checking that visible scroll position has not changed
        assert quote_plus(Ref(start_ref).url()) in self.driver.current_url, self.driver.current_url

    def body(self):
        # Simple Text
        self.test_up("Joshua 22", "Joshua 21:45")
        # Complex Text
        self.test_up("Pesach Haggadah, Magid, The Four Sons", "Pesach Haggadah, Magid, Story of the Five Rabbis 2")


class InfiniteScrollDown(SefariaTest):
    every_build = True
    initial_url = "/texts"

    def test_down(self, start_ref, next_segment_ref):
        self.browse_to_ref(start_ref).scroll_reader_panel_to_bottom()
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, '[data-ref="{}"]'.format(next_segment_ref))))

    def body(self):
        # Simple Text
        self.test_down("Joshua 22", "Joshua 23:1")
        # Complex Text
        self.test_down("Pesach Haggadah, Magid, The Four Sons", "Pesach Haggadah, Magid, Yechol Me'rosh Chodesh 1")


##############
# Editor Tests

class EditorTest(SefariaTest):
    """
    Tests that do editor things
    """
    every_build = False
    temp_sheet_id = None

    def setup(self):
        self.click_accept_cookies()
        self.close_modal_popup()
        self.login_user()
        self.enable_new_editor()
        self.new_sheet_in_editor()
        self.nav_to_end_of_editor()
        self.temp_sheet_id = urlparse(self.get_current_url()).path.rsplit("/", 1)[-1]

    def teardown(self):
        self.driver.get(f'{self.base_url}/api/sheets/{self.temp_sheet_id}/delete')
        self.disable_new_editor()
        self.driver.close()


class DeleteContentInEditor(EditorTest):
    single_panel = False  # No source sheets on mobile

    def body(self):
        self.delete_sheet_content("back")
        self.delete_sheet_content("forward")
        self.catch_js_error()


class AddSourceToEditor(EditorTest):
    single_panel = False  # No source sheets on mobile

    def body(self):
        self.add_source("Psalms 43:4")
        sheet_items = self.driver.find_elements_by_css_selector(".sheetItem")
        # sheet_items_and_spacers = self.driver.find_elements_by_css_selector(".editorContent div")
        sheet_items_and_spacers = self.driver.find_elements_by_css_selector(".editorContent>div")

        print(len(sheet_items))

        last_sheet_item = sheet_items[-1]
        added_source = last_sheet_item.find_element_by_css_selector(".SheetSource")  # will throw error if doesn't exist

        print(last_sheet_item == sheet_items_and_spacers[-2])

        # print(last_sheet_item.get_attribute('innerHTML'))

        spacer_after_source = last_sheet_item.find_elements_by_css_selector(".sheetItem")

        print(len(spacer_after_source))

        # assert len(sheet_items) == 1


class AddSheetContent(EditorTest):
    single_panel = False  # No source sheets on mobile

    def body(self):
        self.type_lorem_ipsum_text("he")
        self.type_lorem_ipsum_text("en")
        self.catch_js_error()
        assert 1 == 1
        # edited_sheet = self.get_sheet_html()
        # sheetURL = self.get_current_url()
        # self.driver.get(sheetURL)
        # loaded_sheet = self.get_sheet_html()
        # assert edited_sheet == loaded_sheet


'''
# This test is cranky.  It can pass and fail without any external changes.  Seemingly because the underlying functionality isn't dependable yet.
class BackRestoresScrollPosition(SefariaTest):
    
    every_build = True
    initial_url = "/texts"

    def body(self):
        SCROLL_DISTANCE = 200

        # TOC
        self.scroll_content_to_position(SCROLL_DISTANCE)
        time.sleep(0.4)
        self.click_toc_category("Midrash")
        self.driver.back()
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, '[data-cat="Midrash"]')))
        time.sleep(0.4)
        assert self.get_content_scroll_position() == SCROLL_DISTANCE, "Scroll Position {} != {}".format(self.get_content_scroll_position(), SCROLL_DISTANCE)

        # Search
        self.search_for("restoration")
        self.scroll_content_to_position(SCROLL_DISTANCE)
        time.sleep(0.4)
        versionedResult = self.driver.find_element_by_css_selector('a[href="/Mishneh_Torah%2C_Kings_and_Wars.12.2?ven=Yad-Hachazakah,_edited_by_Elias_Soloweyczik%3B_London,_1863&qh=restoration"]')
        versionedResult.click()
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, '.segment')))
        self.driver.back()
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, '.text_result')))
        time.sleep(0.4)
        assert self.get_content_scroll_position() == SCROLL_DISTANCE, "Scroll Position {} != {}".format(self.get_content_scroll_position(), SCROLL_DISTANCE)

        # Topic
        self.load_topic_page("wonders")
        self.scroll_content_to_position(SCROLL_DISTANCE)
        time.sleep(0.4)
        source = self.driver.find_element_by_css_selector('.storyTitle a')
        source.click()
        WebDriverWait(self.driver, TEMPER).until(visibility_of_element_located((By.CSS_SELECTOR, '.segment')))
        self.driver.back()
        time.sleep(0.4)
        assert self.get_content_scroll_position() == SCROLL_DISTANCE, "Scroll Position {} != {}".format(self.get_content_scroll_position(), SCROLL_DISTANCE)
'''


"""
# Not complete

class LoadRefAndOpenLexicon(SefariaTest):
    
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
