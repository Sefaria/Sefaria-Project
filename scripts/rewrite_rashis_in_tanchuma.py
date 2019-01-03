__author__ = 'stevenkaplan'

from sefaria.model import *
from sefaria.helper.text import *
from sefaria.tracker import *
from sefaria.helper.schema import *
import csv
import codecs
import cStringIO



class UnicodeWriter:
    """
    A CSV writer which will write rows to CSV file "f",
    which is encoded in the given encoding.
    """

    def __init__(self, f, dialect=csv.excel, encoding="utf-8", **kwds):
        # Redirect output to a queue
        self.queue = cStringIO.StringIO()
        self.writer = csv.writer(self.queue, dialect=dialect, **kwds)
        self.stream = f
        self.encoder = codecs.getincrementalencoder(encoding)()

    def writerow(self, row):
        self.writer.writerow([s.encode("utf-8") for s in row])
        # Fetch UTF-8 output from the queue ...
        data = self.queue.getvalue()
        data = data.decode("utf-8")
        # ... and reencode it into the target encoding
        data = self.encoder.encode(data)
        # write to the target stream
        self.stream.write(data)
        # empty queue
        self.queue.truncate(0)

    def writerows(self, rows):
        for row in rows:
            self.writerow(row)


def needs_rewrite(text):
    finds = re.findall("Midrash Tanchuma \d.*?[\s|\)|;|,|\]]", text)
    for i in range(len(finds)):
        if finds[i][-1] in [" ", ",", ";", ")"]:
            finds[i] = finds[i][0:-1]
    return finds


def process_ref(text):
    return text.replace(".", ":")


def rewrite(tc, mappings, finds):
    replace_dict = {}
    not_found = []
    ref = tc._oref
    text = tc.text
    found = False

    for find in finds:
        if process_ref(find) in mappings:
            replace_dict[find] = mappings[process_ref(find)]
            found = True
        else:
            not_found.append("In {}, there is the following reference: {}".format(ref.normal(), find))

    if type(text) is list and type(text[0]) is not list:
        for i, line in enumerate(text):
            for key in replace_dict:
                text[i] = text[i].replace(key, replace_dict[key])
    elif type(text) is not list:
        if len(finds) > 0:
            for key in replace_dict:
                text = text.replace(key, replace_dict[key])
    return text, not_found, found


def get_mappings(file):
    file = open(file)
    mappings = {}
    for line in file:
        line = line.replace("\n", "").replace("Complex ", "")
        key, value = line.split(", ", 1)
        mappings[key] = value
    return mappings



def execute():
    results = codecs.open("data/tanchuma_ref_results.csv", 'r', 'utf-8')
    reader = csv.reader(results)
    lines = []
    info = []
    for row in reader:
        other_ref, vtitle = row
        info.append((other_ref, vtitle))
    for count, line in enumerate(codecs.open("data/tanchuma_text_results.txt")):
        lines.append(line)

    assert len(lines) == len(info)

    for count, line in enumerate(lines):
        print count
        line = line.decode('utf-8')
        other_ref, vtitle = info[count]
        # modify_text(15399, Ref(other_ref), vtitle, 'en', line.strip())
        tc = TextChunk(Ref(other_ref), vtitle=vtitle, lang="en")
        tc.text = tc.text.strip()
        tc.save()

def write():
    mappings = get_mappings("data/tanchuma_map.csv")
    ls = LinkSet(Ref("Midrash Tanchuma"))
    section_refs = {}
    not_found_arr = []
    input_errors = 0
    results = codecs.open("data/tanchuma_ref_results.csv", 'w', 'utf-8')
    text_results = codecs.open("data/tanchuma_text_results.txt", 'w', 'utf-8')
    writer = UnicodeWriter(results)
    for count, l in enumerate(ls):
        refs = [ref for ref in l.refs if not ref.startswith("Midrash Tanchuma")]
        try:
            other_ref = Ref(refs[0])
        except InputError:
            input_errors += 1
            continue

        title = other_ref.book
        vtitles = [version.versionTitle for version in library.get_index(title).versionSet() if version.language == 'en']
        TCs = []
        for vtitle in vtitles:
            tc = TextChunk(other_ref, vtitle=vtitle, lang='en')
            finds = needs_rewrite(tc.as_string())
            if len(finds) > 0:
                text, not_found, found = rewrite(tc, mappings, finds)
                not_found_arr += not_found
                if found:
                    try:
                        print "writing... {}".format(other_ref.normal())
                        writer.writerow([other_ref.normal(), vtitle])
                        text_results.write(text+"\n")
                    except:
                        print other_ref

    #print "INPUT ERRORS = {}".format(input_errors)
    print "NOT FOUND BAD REF = {}".format(len(not_found_arr))
    for each in not_found_arr:
        print each
    results.close()

if __name__ == "__main__":
    execute()


    