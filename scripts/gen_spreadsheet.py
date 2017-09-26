__author__ = 'stevenkaplan'
from sefaria.model import *
import csv
from sefaria.model.schema import AddressTalmud
import sys

class MetaDataCommentary:
    def __init__(self, comm_title, lang, base_type="Talmud"):
        self.comm_title = comm_title
        self.comm = library.get_index(comm_title)
        self.comm.versionState().refresh()
        temp = self.comm.base_text_titles
        assert len(temp) is 1, "Unclear which text is base text {}".format(str(temp))
        self.base = library.get_index(temp[0])
        self.base_title = self.base.title
        self.results = {}
        self.lang = lang
        self.tc = Ref(self.comm_title).text(self.lang)
        self.base_tc = Ref(self.base_title).text(self.lang)
        self.base_type = base_type


    def set_word_count(self):
        self.results['word count'] = self.tc.word_count()
        return self.results['word count']

    def set_segment_count(self):
        self.results["segment count"] = len(self.comm.all_segment_refs())
        return self.results["segment count"]

    def set_link_count(self):
        links = LinkSet(Ref(self.comm_title))
        self.results["link count"] = len(links)
        return self.results["link count"]

    def calc_link_percent(self):
        if "segment count" not in self.results:
            self.set_segment_count()
        if "link count" not in self.results:
            self.set_link_count()
        temp = 100 * float(self.results["link count"]) / float(self.results["segment count"])
        self.results["link %"] = "{0:.2f}%".format(temp)
        return self.results["link %"]

    def set_comm_section_count(self):
        self.results["comm section count"] = len(self.comm.all_top_section_refs())
        return self.results["comm section count"]

    def set_base_section_count(self):
        self.results["base section count"] = len(self.base.all_top_section_refs())
        return self.results["base section count"]

    def calc_section_percent(self):
        if "comm section count" not in self.results:
            self.set_comm_section_count()
        if "base section count" not in self.results:
            self.set_base_section_count()
        temp = 100 * float(self.results["comm section count"]) / float(self.results["base section count"])
        self.results["sections %"] = "{0:.2f}%".format(temp)
        return self.results["sections %"]


    def set_sec_with_links_count(self):
        sec_count = self.results["comm section count"]
        ls = LinkSet(Ref(self.comm_title))
        sec_with_links_set = set()
        for link in ls:
            comm_ref = link.refs[0] if self.comm_title in link.refs[0] else link.refs[1]
            try:
                sec = Ref(comm_ref).sections[0]
                sec_with_links_set.add(sec)
            except IndexError:
                print "Problem with {}".format(comm_ref)
        self.results["sections with links %"] = float(len(sec_with_links_set)) / float(sec_count)
        sec_without_links = self.get_secs_without_links(list(sec_with_links_set))
        print sec_without_links
        return self.results["sections with links %"]


    def get_secs_without_links(self, sections_with_links):
        secs_without_links = []

        if self.base_type == "Talmud":
            range_base_secs = range(3, 3+self.results["base section count"])
        else:
            range_base_secs = range(1, 1+self.results["base section count"])

        for section in range_base_secs:
            if section not in sections_with_links:
                if self.base_type == "Talmud":
                    section = AddressTalmud.toStr("en", section)
                secs_without_links.append(section)

        return secs_without_links


    def calc(self):
        wc = self.set_word_count()
        seg_c = self.set_segment_count()
        link_c = self.set_link_count()
        link_perc = self.calc_link_percent()
        comm_sec_c = self.set_comm_section_count()
        base_sec_c = self.set_base_section_count()
        sec_perc = self.calc_section_percent()
        link_daf = self.set_sec_with_links_count()
        return [wc, seg_c, link_c, link_perc, comm_sec_c, base_sec_c, sec_perc]


def spreadsheet(file, results, columns_order):
    with open(file, 'wb') as sheet:
        writer = csv.DictWriter(sheet, fieldnames=columns_order)
        writer.writeheader()
        for title in sorted(results.keys()):
            this_result = results[title]
            this_result["title"] = title
            writer.writerow(this_result)



if __name__ == "__main__":
    params = " ".join(sys.argv[1:]).split(",")
    collective_title = params[0]
    print collective_title
    titles = library.get_indexes_in_category(collective_title, include_dependant=True)
    file = "spread.csv"
    results = {}
    columns_order = ["title", "word count", "link count", "segment count", "link %", "comm section count", "base section count", "sections %", "sections with links %"]
    count = 0
    for title in titles:
        print title
        mdc = MetaDataCommentary(title, lang='he', base_type='Talmud')
        mdc.calc()
        results[title] = mdc.results

    spreadsheet(file, results, columns_order)

