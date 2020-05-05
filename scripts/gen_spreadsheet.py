__author__ = 'stevenkaplan'
from sefaria.model import *
import csv
import sys

class MetaDataCommentary:
    def __init__(self, comm_title, lang):
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


    def set_word_count(self):
        self.results['word count'] = self.tc.word_count()
        return self.results['word count']

    def set_segment_count(self):
        self.results["segment count"] = len(self.comm.all_segment_refs())
        return self.results["segment count"]

    def set_link_count(self):
        links = LinkSet(Ref(self.comm_title))
        actual_links = [link for link in links if self.comm_title in link.refs[0] or self.comm_title in link.refs[1]]
        self.results["link count"] = len(actual_links)
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


    def calc(self):
        wc = self.set_word_count()
        seg_c = self.set_segment_count()
        link_c = self.set_link_count()
        link_perc = self.calc_link_percent()
        comm_sec_c = self.set_comm_section_count()
        base_sec_c = self.set_base_section_count()
        sec_perc = self.calc_section_percent()
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
    print(collective_title)
    titles = library.get_indexes_in_category(collective_title, include_dependant=True)
    file = "spread.csv"
    results = {}
    columns_order = ["title", "word count", "link count", "segment count", "link %", "comm section count", "base section count", "sections %"]
    count = 0
    for title in titles:
        print(title)
        mdc = MetaDataCommentary(title, lang='he')
        mdc.calc()
        results[title] = mdc.results

    spreadsheet(file, results, columns_order)

