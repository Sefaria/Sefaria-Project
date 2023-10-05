import django
django.setup()
from sefaria.model import *
from sefaria.model.linker.ref_resolver import AmbiguousResolvedRef
from sefaria.model.webpage import WebSite
from sefaria.system.exceptions import InputError
from sefaria.utils.hebrew import gematria
from roman import fromRoman as roman_to_int
import re
import json
import datetime
import requests
import time
from pymarc import parse_xml_to_array
from bs4 import BeautifulSoup
from io import BytesIO


def translliterate_russian_to_latin(string):
    chars = ("абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ",
               "abvgdeejzijklmnoprstufhzcss_y_euaABVGDEEJZIJKLMNOPRSTUFHZCSS_Y_EUA")
    tr = {ord(a): ord(b) for a, b in zip(*chars)}
    string = string.translate(tr)
    return string.replace('_', '')


class Record():

    def __init__(self, marc):
        self.marc = marc
        self.title = ''
        self.description = ''
        self.url = ''
        self.categories = set()
        self.authors = []
        self.articleSource = {}
        self.refs = set()
        self.make_refs()
        if self.refs:
            self.title = self.marc.title()
            self.make_link()
            self.fix_url()
            self.find_authors()
            self.find_source()
            self.clean_strings()
        delattr(self, 'marc')
        delattr(self, 'categories')

    def __hash__(self):
        return hash((self.title, self.refs))

    def __eq__(self, other):
        if not isinstance(other, Record):
            return False
        return self.title == other.title and self.refs == other.refs

    @staticmethod
    def get_refs_from_string(string):
        string = string.replace('–', '-')
        lang = 'he' if len(re.findall('[א-ת]', string)) > len(string) / 2 else 'en'
        if lang == 'en':
            string = translliterate_russian_to_latin(string)
        ref_resolver = library.get_ref_resolver()
        if lang == 'he':  # remove this line when linker v3 is availabe in English
            refs = ref_resolver.bulk_resolve_refs(lang, [None], [string])
            refs = {y.ref for x in refs for y in x if type(y) != AmbiguousResolvedRef}
        else:  # remove else statement (with its content) when linker v3 is availabe in English
            refs = set()
            library.apply_action_for_all_refs_in_string(re.sub('[\(\)]', '', string), lambda x, y: refs.add(x), 'en', citing_only=True)
        return refs

    def get_abstract(self):
        if not self.description:
            try:
                if self.marc['520'] and 'a' in self.marc['520']:
                    self.description = self.marc['520']['a']
            except TypeError:
                pass
        return self.description

    def add_refs_from_abstract(self):
        refs = self.get_refs_from_string(self.get_abstract())
        self.refs |= {r.normal() for r in refs}

    def get_refs_from_issues(self):
        refs = set()
        roman_regex = '(?:^|-)([IVXLC]+)'
        for issue in self.marc.get_fields('630'):
            book = ''
            if issue['a'] and any(word in issue['a'] for word in ['Mishnah', 'Tosefta', 'Talmud Yerushalmi', 'משנה']):
                book = [word for word in ['Mishnah', 'Tosefta', 'Talmud Yerushalmi', 'משנה'] if word in issue['a']][0] + ' '
            if issue['p']:
                try:
                    masechet = issue['p'].replace("Pe'ah", 'Peah')
                    book = Ref(f"{book}{masechet}")
                except (InputError, AttributeError):
                    continue
            else:
                if book:
                    self.categories.add(book.replace('Talmud', '').replace('משנה', 'Mishnah'))
                continue
            if issue['n']:
                loc = issue['n']
            else:
                refs.add(book)
                continue
            for roman in re.findall(roman_regex, loc):
                loc = re.sub(roman, str(roman_to_int(roman)), loc, 1)
            loc = re.sub('\.|a-b', '', loc)
            gem = gematria(loc)
            if gem:
                loc = gem
            try:
                refs.add(Ref(f'{book.normal()} {loc}'))
            except InputError:
                print(f'cannot find {book} {loc}')
                refs.add(book)
        return refs

    @staticmethod
    def get_title_from_field(field):
        title = ' '.join(field['a'].split())
        try:
            title += f" {' '.join(field['b'].split())}"
        except AttributeError:
            pass
        return title

    def add_refs_from_titles(self):
        titles = [self.get_title_from_field(field) for field in self.marc.get_fields('130', '240', '245', '246')]
        refs = {ref for title in titles for ref in self.get_refs_from_string(title)}
        books = {Ref(ref).book for ref in self.refs} | set(b for cat in self.categories for b in library.get_indexes_in_category(cat))
        self.refs |= {r.normal() for r in refs if r.book in books or not books}

    def make_refs(self):
        self.add_refs_from_abstract()
        issue_refs = self.get_refs_from_issues()
        if issue_refs:
            self.refs |= {ref.normal() for ref in issue_refs}
            self.add_refs_from_titles()
        self.refs = tuple(ref for ref in self.refs if not any(Ref(ref).contains(Ref(r)) for r in self.refs-{ref}) and not Ref(ref).is_book_level())

    @staticmethod
    def get_pnx_from_mms(mms_id, iteration=0):
        try:
            resp = requests.get(f"https://merhav.nli.org.il/primo_library/libweb/webservices/rest/primo-explore/v1/pnxs?blendFacetsSeparately=false&getMore=0&inst=NNL&lang=en_US&limit=10&mode=advanced&newspapersActive=false&newspapersSearch=false&offset=0&pcAvailability=true&q=lsr03,contains,{mms_id},AND&qExclude=&qInclude=&refEntryActive=false&rtaLinks=true&scope=RAMBI&skipDelivery=Y&sort=rank&tab=default_tab&vid=NLI_Rambi")
            return resp.json()['docs'][0]['pnx']['search']['recordid'][0]
        except:
            if iteration < 2:
                time.sleep(1)
                iteration += 1
                Record.get_pnx_from_mms(mms_id, iteration)
            else:
                print(f"can't get PNX to MMS {mms_id}")

    def make_link(self):
        link_element = self.marc['907']
        if link_element:
            self.url = f'https://rosetta.nli.org.il/delivery/DeliveryManagerServlet?dps_pid={link_element["c"]}'
            return
        link_element = self.marc['85641']
        if link_element:
            self.url = link_element['u']
            return
        for element in self.marc.get_fields('856'):
            note = str(element['z'])
            if note in ['Click here for the record of the book in the catalog of the National Library', 'Locate this publication in Israeli libraries', 'אתר את הפרסום בקטלוג המאוחד של ספריות ישראל', 'לרשומת כתב היד בקטלוג הספרייה הלאומית', 'Click here for the record of the manuscript in the catalog of the National Library', 'לרשומת כתב היד בקטלוג הספריה הלאומית', 'Display ULS record for this journal', 'For related article in RAMBI, click here', 'פרטי העתון בקטלוג המאוחד לכתבי-עת', 'לאתר הלקסיקון לספרות הזוהר הקלק כאן']:
                continue
            elif note in ['Click here for fulltext (may be restricted to subscribers)', 'קישור לטקסט מלא (תיתכן הגבלה לבעלי מנוי בלבד)', 'לספר האלקטרוני באתר היברובוקס הקש כאן']:
                self.url = element['u']
                if self.url and not self.url.startswith('http://198.62.75.1') and not self.url.startswith('http://christusrex.org'): #links that seems to be to http://christusrex.org which is down
                    return
            else:
                print('unknown note', note)
        self.url = f"https://merhav.nli.org.il/primo-explore/fulldisplay?docid={self.get_pnx_from_mms(self.marc['001'].data)}&context=L&vid=NLI_Rambi"

    def fix_url(self):
        self.url = re.sub('(https?://)(10.(?:1163|1093))', r'\1doi.org/\2', self.url)
        self.url = self.url.replace(' ', '')

    def find_authors(self):
        for author in self.marc.get_fields('100') + self.marc.get_fields('700'):
            if author['8'] == 'PreferredLanguageHeading':
                if author['a'] not in self.authors:
                    self.authors.append(author['a'])
        if not self.authors:
            print(f'did not find author for record id {self.marc["001"]}')

    def find_source(self):
        source_field = self.marc['773']
        if source_field:
            self.articleSource = {'title': self.marc['773']['t'], 'related_parts': self.marc['773']['g']}
        else:
            print(f'no source field for mms id {self.marc["001"].data}')

    def clean_strings(self):
        def clean(string):
            string = re.sub('[\u2029\u2028]', ' ', string)
            string = ' '.join(string.split())
            return string.replace(' :', ':')
        self.title = clean(self.title)
        self.description = clean(self.description)
        for key in self.articleSource:
            self.articleSource[key] = clean(self.articleSource[key])
        for i, author in enumerate(self.authors):
            self.authors[i] = clean(author)
            if author.endswith(','):
                self.authors[i] = self.authors[i][:-1]


class Parser():

    def __init__(self):
        self.records = set()
        self.websites = set()

    def get_last_date(self):
        date = WebSite().load({'name': 'רמב״י - Jewish Studies Articles'}).lastUpdated
        return f'{date.year}{str(date.month).zfill(2)}{str(date.day).zfill(2)}'

    def get_records(self):
        yyyymmdd = self.get_last_date()
        base_url = f'https://eu01.alma.exlibrisgroup.com/view/sru/972NNL_INST?version=1.2&operation=searchRetrieve&recordSchema=marcxml&query=alma.local_field_999=%22ARTICLE%22%20mms_modificationDate%3E{yyyymmdd}%20sortBy%20alma.main_pub_date/sort.decending'
        url = f'{base_url}&maximumRecords=0'
        res = requests.get(url)
        if res.status_code == 200:
            num = int(BeautifulSoup(res.text, 'xml').numberOfRecords.string)
            for i in range(num // 50 + 1):
                url = f'{base_url}&maximumRecords=50&startRecord={i*50+1}'
                res = requests.get(url)
                if res.status_code == 200:
                    yield BytesIO(res.content)
                else:
                    print(f'request from {url} failed with status code {res.status_code}')
        else:
            print(f'request from {url} failed with status code {res.status_code}')

    def parse_records_array(self, file):
        for xml_record in parse_xml_to_array(file):
            if not xml_record:
                return
            record = Record(xml_record)
            if record.refs and record.url:
                self.records.add(record)

    def make_webpages(self):
        for record in self.records:
            wp = WebPage().load({'url': record.url})
            if wp:
                refs = {ref for ref in list(record.refs) + wp.refs}
                wp.refs = [ref for ref in refs if not any(Ref(ref).contains(Ref(r)) for r in refs-{ref})]
                for attr in ['url', 'title', 'description', 'authors', 'articleSource']:
                    setattr(wp, attr, getattr(record, attr))
            else:
                self.websites.add(WebPage.domain_for_url(WebPage.normalize_url(record.url)))
                wp = WebPage({
                    'url': record.url,
                    'title': record.title,
                    'refs': record.refs,
                    'description': record.description,
                    'type': 'article',
                    'authors': record.authors,
                    'articleSource': record.articleSource
                })
            try:
                wp.save()
            except Exception as e:
                print(e, 'cannot save WebPage. WebPage dict:', wp.contents())

    def make_websites(self):
        self.websites = [ws for ws in self.websites if not WebSite().load({'domains': ws})]
        ws_name = 'רמב״י - Jewish Studies Articles'
        ws = WebSite().load({'name': ws_name})
        if not ws:
            self.websites = ['nli.org.il'] + [x for x in self.websites if x != 'nli.org.il']
            ws = WebSite({
                'name': ws_name,
                'domains': self.websites,
                'is_whitelisted': True
            })
        else:
            ws.domains += [d for d in self.websites if d not in ws.domains]
        ws.lastUpdated = datetime.datetime.utcnow()
        ws.save()

    def parse(self):
        for array in self.get_records():
            self.parse_records_array(array)
        self.make_webpages()
        self.make_websites()


if __name__ == '__main__':
    parser = Parser()
    parser.parse()
    with open('new_rambi_webpages.json', 'w') as fp:
        json.dump([r.__dict__ for r in parser.records], fp)
