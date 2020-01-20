import re
from sefaria.model import *
from sefaria.helper.schema import *

def get_ftnotes(sec_ref, title):
    # get footnotes on text found in sec_ref
    if "PART VII" in sec_ref.normal():
        relevant_footnote_ref = "Or Neerav, Footnotes, PART VII"
    else:
        node_name = sec_ref.normal().replace("{}, ".format(title), "")
        relevant_footnote_ref = "{}, Footnotes, {}".format(title, node_name)
        if "Subject" in relevant_footnote_ref:
            relevant_footnote_ref = relevant_footnote_ref.replace(", Subject", " 1")
    ftnotes = Ref(relevant_footnote_ref).text('en').text
    assert type(ftnotes[0]) is str
    ftnotes = dict(enumerate(ftnotes))
    return ftnotes

if __name__ == "__main__":
    title = "Or Neerav"
    vtitle = "Moses Cordovero's Introduction to Kabbalah, Annotated trans. of Or ne'erav, Ira Robinson, 1994."
    index = library.get_index(title)
    sec_refs_in_main_text = index.all_section_refs()
    for sec_ref in sec_refs_in_main_text:
        if "Footnotes" in sec_ref.normal():
            continue
        ftnotes = get_ftnotes(sec_ref, title)
        text = sec_ref.text('en').text
        for comment_n, comment in enumerate(text):
            matches = re.findall("<sup>(\d+)</sup>", comment)
            assert len(set(matches)) == len(matches)  # assert no duplicates
            for match in matches:
                old_ftnote = "<sup>{}</sup>".format(match)
                ftnote_num = int(match)
                ftnote_text = ftnotes[ftnote_num - 1]
                new_ftnote = "{}<i class='footnote'>{}</i>".format(old_ftnote, ftnote_text)
                if new_ftnote not in text[comment_n]:
                    text[comment_n] = text[comment_n].replace(old_ftnote, new_ftnote)
        tc = TextChunk(sec_ref, vtitle=vtitle, lang='en')
        tc.text = text
        tc.save()

    remove_branch(library.get_index("Or Neerav").nodes.children[-1])
