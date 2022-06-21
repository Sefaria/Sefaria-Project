"""
export.py - functions for exporting texts to various text formats.

Exports to the directory specified in SEFARIA_EXPORT_PATH.
"""
import sys
import os
import io
import unicodecsv as csv
import re
import json
from shutil import rmtree
from random import random
from pprint import pprint
from datetime import datetime
from collections import Counter
from copy import deepcopy
import django
django.setup()
from sefaria.model import *
from sefaria.model.text import AbstractIndex

from sefaria.utils.talmud import section_to_daf
from sefaria.system.exceptions import InputError
from .settings import SEFARIA_EXPORT_PATH
from sefaria.system.database import db


lang_codes = {
    "he": "Hebrew",
    "en": "English"
}


def log_error(msg):
    msg = '{}\n'.format(msg)
    log_error.all_errors.append(msg)
    sys.stderr.write(msg)
log_error.all_errors = []


def print_errors():
    if len(log_error.all_errors):
        sys.stderr.write('\n___ERRORS___\n')
    for i, error in enumerate(log_error.all_errors):
        sys.stderr.write('{}. {}'.format(i, error))

def make_path(doc, format, extension=None):
    """
    Returns the full path and file name for exporting 'doc' in 'format'.
    """
    if doc["categories"][0] not in library.get_top_categories():
        doc["categories"].insert(0, "Other")
    path = "%s/%s/%s/%s/%s/%s.%s" % (SEFARIA_EXPORT_PATH,
                                            format,
                                            "/".join(doc["categories"]),
                                            doc["title"],
                                            lang_codes[doc["language"]],
                                            remove_illegal_file_chars(doc["versionTitle"]),
                                            extension or format)
    return path


def remove_illegal_file_chars(filename_str):
    p = re.compile('[/:()<>"|?*]|(\\\)')
    new_filename = p.sub('', filename_str)
    return new_filename


def make_json(doc):
    """
    Returns JSON of 'doc' with export settings.
    """
    if "original_text" in doc:
        doc = {k: v for k, v in doc.items() if k != "original_text"}
    return json.dumps(doc, indent=4, ensure_ascii=False)


def make_text(doc, strip_html=False):
    """
    Export doc into a simple text format.

    if complex, go through nodes depth first,
    at each node, output name of node
    if node is leaf, run flatten on it

    """
    # We have a strange beast here - a merged content tree.  Loading it into a synthetic version.
    chapter = doc.get("original_text", doc["text"])
    version = Version({"chapter": chapter})

    index = library.get_index(doc["title"])
    versionSource = doc["versionSource"] or ""
    text = "\n".join([doc["title"], doc.get("heTitle", ""), doc["versionTitle"], versionSource])

    if "versions" in doc:
        if not len(doc["versions"]):
            return None # Occurs when text versions don't actually have content
        text += "\nThis file contains merged sections from the following text versions:"
        for v in doc["versions"]:
            text += "\n-%s\n-%s" % (v[0], v[1])

    def make_node(node, depth, **kwargs):
        if not node.children:
            content = "\n\n%s\n\n" % node.primary_title(doc["language"])
            cnode = version.content_node(node)
            if strip_html:
                cnode = version.remove_html_and_make_presentable(cnode)
            content += flatten(cnode, node.sectionNames, node.addressTypes)
            return content
        else:
            return "\n\n%s" % node.primary_title(doc["language"])

    def flatten(text, sectionNames, addressTypes):
        text = text or ""
        if len(addressTypes) == 1:
            text = [t if t else "" for t in text]
            # Bandaid for mismatch between text structure, join recursively if text
            # elements are lists instead of strings.
            return "\n".join([t if isinstance(t, str) else "\n".join(t) for t in text])
        flat = ""
        for i in range(len(text)):
            section = section_to_daf(i + 1) if addressTypes[0] == "Talmud" else str(i + 1)
            flat += "\n\n%s %s\n\n%s" % (sectionNames[0], section, flatten(text[i], sectionNames[1:], addressTypes[1:]))

        return flat

    text += index.nodes.traverse_to_string(make_node)


    return text


def make_cltk_full(doc):
    index = library.get_index(doc["title"])
    chapter = doc.get("original_text", doc["text"])
    version = Version({"chapter": chapter})
    sec_name_count = {}
    def make_node(node,depth,**kwargs):
        content = {
            "title": node.primary_title("en")
        }
        if not node.children:
            content["content"] = version.content_node(node)
            content["section_names"] = node.sectionNames
        return content

    def traverse_to_cltk(old_js, **kwargs):
        new_js = {}
        if not "nodes" in old_js:
            content_list = []
            if "content" in old_js:
                #Beginning of jagged array
                content_list = old_js["content"]
                section_names = tuple(old_js["section_names"])
                try:
                    sec_name_count[section_names] += 1
                except KeyError:
                    sec_name_count[section_names] = 1
            elif type(old_js) == list:
                #Traversing jagged array
                content_list = old_js
            for i,content in enumerate(content_list):
                if type(content) == list:
                    temp = traverse_to_cltk(content,**kwargs)
                    if len(list(temp.keys())) > 0:
                        new_js[str(i)] = temp
                elif content != "":
                    new_js[str(i)] = content

        else:
            for i,childJs in enumerate(old_js["nodes"]):
                currNode = old_js["nodes"][i]
                new_js[str(i) + "_" + currNode["title"]] = traverse_to_cltk(currNode,**kwargs)

        return new_js

    temp_doc = index.nodes.traverse_to_json(make_node)
    cltk_doc = {"text":traverse_to_cltk(temp_doc)}
    best_sec_names = []
    best_count = 0
    for sec_names in sec_name_count:
        if sec_name_count[sec_names] > best_count:
            best_count = sec_name_count[sec_names]
            best_sec_names = sec_names

    cltk_doc["meta"] = '-'.join(best_sec_names)
    cltk_doc["work"] = doc["title"]
    return json.dumps(cltk_doc, indent=4, ensure_ascii=False)


def make_cltk_flat(doc):
    index = library.get_index(doc["title"])
    chapter = doc.get("original_text", doc["text"])
    version = Version({"chapter": chapter})
    sec_name_count = {}
    def make_node(node,depth,**kwargs):
        content = {
            "title": node.primary_title("en")
        }
        if not node.children:
            content["content"] = version.content_node(node)
            content["section_names"] = node.sectionNames
        return content

    def traverse_to_cltk(old_js,title="",section_names=None, **kwargs):
        new_js = {}
        title_begin = title if title == "" else "{}, ".format(title)
        if not "nodes" in old_js:
            content_list = []
            if "content" in old_js:
                #Beginning of jagged array
                content_list = old_js["content"]
                section_names = old_js["section_names"]
                try:
                    sec_name_count[tuple(section_names)] += 1
                except KeyError:
                    sec_name_count[tuple(section_names)] = 1
            elif type(old_js) == list:
                #Traversing jagged array
                content_list = old_js
                section_names = section_names[1:]

            for i,content in enumerate(content_list):
                curr_section = "" if len(section_names) == 0 else "_{}".format(section_names[0])
                temp_title = "{}{}{}".format(title_begin,str(i),curr_section)
                if type(content) == list:
                    new_js.update(traverse_to_cltk(content,temp_title,section_names,**kwargs))
                elif content != "":
                    new_js[temp_title] = content

        else:
            for i,childJs in enumerate(old_js["nodes"]):
                curr_node = old_js["nodes"][i]
                new_js.update(traverse_to_cltk(curr_node,"{}{}_{}".format(title_begin,str(i),curr_node["title"]),**kwargs))

        return new_js

    temp_doc = index.nodes.traverse_to_json(make_node)
    cltk_doc = {"text":traverse_to_cltk(temp_doc)}
    best_sec_names = []
    best_count = 0
    for sec_names in sec_name_count:
        if sec_name_count[sec_names] > best_count:
            best_count = sec_name_count[sec_names]
            best_sec_names = sec_names

    cltk_doc["meta"] = '-'.join(best_sec_names)
    cltk_doc["work"] = doc["title"]
    return json.dumps(cltk_doc, indent=4, ensure_ascii=False)
"""
List of export formats, consisting of a name and function.
The name is used as a top level directory and file suffix, unless there are three elements.
With 3 elements, the first is the top level and the third is the file suffix
The function takes a document and returns the text to output.
"""
export_formats = (
    ('json', make_json),
    ('txt', make_text),
    ('cltk-full',make_cltk_full,'json'), #cltk format with fully nested structure
    ('cltk-flat',make_cltk_flat,'json')  #cltk format, flattened
)


def clear_exports():
    """
    Deletes all files from any export directory listed in export_formats.
    """
    for format in export_formats:
        if os.path.exists(SEFARIA_EXPORT_PATH + "/" + format[0]):
            rmtree(SEFARIA_EXPORT_PATH + "/" + format[0])
    if os.path.exists(SEFARIA_EXPORT_PATH + "/schemas"):
        rmtree(SEFARIA_EXPORT_PATH + "/schemas")
    if os.path.exists(SEFARIA_EXPORT_PATH + "/links"):
        rmtree(SEFARIA_EXPORT_PATH + "/links")

def write_text_doc_to_disk(doc=None):
    """
    Writes document to disk according to all formats in export_formats
    """
    assert doc is not None
    for format in export_formats:
        out = format[1](doc)
        if not out:
            print("Skipping %s - no content" % doc["title"])
            return
        path = make_path(doc, format[0], extension=format[2] if len(format) == 3 else None)
        if not os.path.exists(os.path.dirname(path)):
            os.makedirs(os.path.dirname(path))
        try:
            with open(path, "w") as f:
                f.write(out)
        except IOError as e:
            log_error('failed to write to disk: {}'.format(str(e)))

def prepare_text_for_export(text):
    """
    Exports 'text' (a document from the texts collection, or virtual merged document)
    by preparing it as a export document and passing to 'write_text_doc_to_disk'.
    """
    try:
        print(text["title"])
    except KeyError as e:
        log_error('text does\'t contain "title": {}'.format(str(text)))
        return

    try:
        index = library.get_index(text["title"])
    except Exception as e:
        print("Skipping %s - %s" % (text["title"], str(e)))
        return
    if any([n.is_virtual for n in index.nodes.get_leaf_nodes()]):  #skip virtual nodes
        return

    text["heTitle"] = index.nodes.primary_title("he")
    text["categories"] = index.categories

    text["text"] = text.get("text", None) or text.get("chapter", "")

    if index.is_complex():
        text["original_text"] = deepcopy(text["text"])

        def min_node_props(node, depth, **kwargs):
            js = {"heTitle": node.primary_title("he"),
                  "enTitle": node.primary_title("en"),
                  "key": node.key}

            return js

        def key2title(text_node, schema_node):
            for temp_schema_node in schema_node:
                new_key = temp_schema_node["enTitle"]
                try:
                    text_node[new_key] = text_node.pop(temp_schema_node["key"])
                except KeyError:
                    text_node[new_key] = ""

                del temp_schema_node["key"]
                if "nodes" in temp_schema_node:
                    key2title(text_node[new_key], temp_schema_node["nodes"])

        text["schema"] = index.nodes.traverse_to_json(min_node_props)
        key2title(text["text"], text["schema"]["nodes"])

    else:
        text["sectionNames"] = index.schema["sectionNames"]

    if "_id" in text:
        del text["_id"]
        del text["chapter"]

    return text


def text_is_copyright(text):
    return "license" in text and (type(text['license']) is str or type(text['license']) is str) \
           and text["license"].startswith("Copyright")


def export_texts():
    """
    Step through every text in the texts collection and export it with each format
    listed in export_formats.
    """
    clear_exports()

    texts = db.texts.find()

    for text in texts:
        if text_is_copyright(text):
            # Don't export copyrighted texts.
            continue

        prepped_text = prepare_text_for_export(text)
        if prepped_text:
            write_text_doc_to_disk(prepped_text)


def prepare_merged_text_for_export(title, lang=None):
    """
    Exports a "merged" version of title, including the maximal text we have available
    in a single document.
    """

    assert lang is not None

    doc = {
        "title": title,
        "language": lang,
        "versionTitle": "merged",
        "versionSource": "https://www.sefaria.org/%s" % title.replace(" ", "_"),
    }
    text_docs = db.texts.find({"title": title, "language": lang}).sort([["priority", -1], ["_id", 1]])

    print("%d versions in %s" % (text_docs.count(), lang))


    # Exclude copyrighted docs from merging
    text_docs = [text for text in text_docs if not text_is_copyright(text)]

    if len(text_docs) == 0:
        return
    elif len(text_docs) == 1:
        text_doc = text_docs[0]
        doc["text"] = text_doc["chapter"]  # TODO: sort complex according to Index
        doc["versions"] = [(text_doc["versionTitle"], text_doc["versionSource"])]
    else:
        index = library.get_index(title)
        sourceset = set()

        def merge_visitor(node, *texts, **kwargs):
            merged, merged_sources = merge_texts(texts, kwargs.get("sources"))
            sourceset.update(merged_sources)
            return merged

        merged = index.nodes.visit_content(merge_visitor,
                                   *[text["chapter"] for text in text_docs],
                                   sources=[(text["versionTitle"], text["versionSource"]) for text in text_docs]
                                   )

        merged_sources = list(sourceset)

        doc.update({
            "text": merged,
            "versions": merged_sources,
        })

    return prepare_text_for_export(doc)


def export_all_merged():
    """
    Iterate through all index records and exports a merged text for each.
    """
    texts = db.texts.find().distinct("title")

    for title in texts:
        try:
            Ref(title)
        except:
            continue

        print(title)
        if not title:
            log_error('None title in texts')
            continue
        for lang in ("he", "en"):
            prepped_text = prepare_merged_text_for_export(title, lang=lang)
            if prepped_text:
                write_text_doc_to_disk(prepped_text)

def export_schemas():
    print('exporting schemas...')
    path = SEFARIA_EXPORT_PATH + "/schemas/"
    if not os.path.exists(path):
        os.makedirs(path)
    for i in library.all_index_records():
        title = i.title.replace(" ", "_")

        with open(path + title + ".json", "w") as f:
            try:
                f.write(make_json(i.contents()))

            except InputError as e:
                print("InputError: %s" % e)
                with open(SEFARIA_EXPORT_PATH + "/errors.log", "a") as error_log:
                    error_log.write("%s - InputError: %s\n" % (datetime.now(), e))
            except Exception as e:
                log_error('schemas error on {}: {}'.format(title, str(e)))


def export_toc():
    """
    Exports the TOC to a JSON file.
    """
    toc = library.get_toc()
    with open(SEFARIA_EXPORT_PATH + "/table_of_contents.json", "w") as f:
        f.write(make_json(toc))

def export_links():
    """
    Creates a single CSV file containing all links known to Sefaria.
    """
    print("Exporting links...")
    links_by_book = Counter()
    links_by_book_without_commentary = Counter()

    links = db.links.find().sort([["refs.0", 1]])
    path = SEFARIA_EXPORT_PATH + "/links/"
    if not os.path.exists(os.path.dirname(path)):
        os.makedirs(os.path.dirname(path))

    link_file_number = 0
    links = db.links.find().sort([["refs.0", 1]])
    new_links_file_size = 300000
    for i, link in enumerate(links):
        if i % new_links_file_size == 0:
            filename = '{}links{}.csv'.format(path, link_file_number)
            try:
                csvfile.close()
            except:
                pass
            csvfile = open(filename, 'wb')
            writer = csv.writer(csvfile)
            writer.writerow([
                    "Citation 1",
                    "Citation 2",
                    "Conection Type",
                    "Text 1",
                    "Text 2",
                    "Category 1",
                    "Category 2",
            ])
            link_file_number += 1

        try:
            oref1 = Ref(link["refs"][0])
            oref2 = Ref(link["refs"][1])
        except InputError:
            continue

        writer.writerow([
            link["refs"][0],
            link["refs"][1],
            link["type"],
            oref1.book,
            oref2.book,
            oref1.index.categories[0],
            oref2.index.categories[0],
        ])

        book_link = tuple(sorted([oref1.index.title, oref2.index.title]))
        links_by_book[book_link] += 1
        if link["type"] not in ("commentary", "Commentary", "targum", "Targum"):
            links_by_book_without_commentary[book_link] += 1

    def write_aggregate_file(counter, filename):
        with open(SEFARIA_EXPORT_PATH + "/links/%s" % filename, 'wb') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow([
                "Text 1",
                "Text 2",
                "Link Count",
            ])
            for link in counter.most_common():
                writer.writerow([
                    link[0][0],
                    link[0][1],
                    link[1],
                ])

    write_aggregate_file(links_by_book, "links_by_book.csv")
    write_aggregate_file(links_by_book_without_commentary, "links_by_book_without_commentary.csv")


def export_topic_graph():
    print("Exporting topic graph...")
    counts = Counter()
    sheets = db.sheets.find()
    topics = db.sheets.distinct("topics")
    for topic in topics:
        sheets = db.sheets.find({"topics.asTyped": topic["asTyped"]})
        for sheet in sheets:
            for topic2 in sheet["topics"]:
                if topic["asTyped"] != topic2["asTyped"]:
                    counts[tuple(sorted([topic["asTyped"], topic2["asTyped"]]))] += 0.5

    path = SEFARIA_EXPORT_PATH + "/misc/"
    if not os.path.exists(path):
        os.makedirs(path)
    with open(path + "topic_graph.csv", 'wb') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow([
            "Topic 1",
            "Topic 2",
            "Co-occurrence Count",
        ])
        for link in counts.most_common():
            writer.writerow([
                link[0][0],
                link[0][1],
                link[1],
            ])


def make_export_log():
    """
    Exports a file that logs the last export time.
    """
    with open(SEFARIA_EXPORT_PATH + "/last_export.txt", "w") as f:
        f.write(datetime.now().isoformat())


def export_all():
    """
    Export all texts, merged texts, links, schemas, toc, links & export log.
    """
    clear_exports()
    export_texts()
    export_all_merged()
    export_links()
    export_schemas()
    export_toc()
    export_topic_graph()
    make_export_log()
    print_errors()



# CSV Version import export format:
#
# Column 1: References
# Columns 2-n: Versions

# Row 1: Index title (will repeat?)
# Row 2: Version Title
# Row 3: Version Language
# Row 4: Version Source


def export_version_csv(index, version_list):
    assert isinstance(index, AbstractIndex)
    assert isinstance(version_list, list) or isinstance(version_list, VersionSet)
    assert all(isinstance(v, Version) for v in version_list)

    csv.field_size_limit(sys.maxsize)

    output = io.BytesIO()
    writer = csv.writer(output)

    # write header data
    writer.writerow(["Index Title"] + [index.title for _ in version_list])
    writer.writerow(["Version Title"] + [v.versionTitle for v in version_list])
    writer.writerow(["Language"] + [v.language for v in version_list])
    writer.writerow(["Version Source"] + [v.versionSource for v in version_list])
    writer.writerow(["Version Notes"] + [getattr(v, "versionNotes", "") for v in version_list])

    section_refs = index.all_section_refs()

    for section_ref in section_refs:
        segment_refs = section_ref.all_subrefs()
        seg_vers = {}

        # set blank array for version data
        for ref in segment_refs:
            seg_vers[ref.normal()] = []

        # populate each version
        for version in version_list:
            section = section_ref.text(vtitle=version.versionTitle, lang=version.language).text
            for ref in segment_refs:
                if ref.sections[-1] > len(section):
                    seg_vers[ref.normal()] += [""]
                else:
                    seg_vers[ref.normal()] += [section[ref.sections[-1] - 1]]

        # write lines for each section
        for ref in segment_refs:
            writer.writerow([ref.normal()] + seg_vers[ref.normal()])

    return output.getvalue()


def export_merged_csv(index, lang=None):
    assert isinstance(index, Index)
    assert lang in ["en", "he"]

    csv.field_size_limit(sys.maxsize)

    output = io.BytesIO()
    writer = csv.writer(output)

    # write header data
    writer.writerow(["Index Title"] + [index.title])
    writer.writerow(["Version Title"] + ["merged"])
    writer.writerow(["Language"] + [lang])
    writer.writerow(["Version Source"] + ["-"])
    writer.writerow(["Version Notes"] + ["-"])

    section_refs = index.all_section_refs()

    for section_ref in section_refs:
        segment_refs = section_ref.all_subrefs()
        seg_vers = {}

        # set blank array for version data
        for ref in segment_refs:
            seg_vers[ref.normal()] = []

        # populate each version
        section = section_ref.text(lang=lang, exclude_copyrighted=True).text
        for ref in segment_refs:
            if ref.sections[-1] > len(section):
                seg_vers[ref.normal()] += [""]
            else:
                seg_vers[ref.normal()] += [section[ref.sections[-1] - 1]]

        # write lines for each section
        for ref in segment_refs:
            writer.writerow([ref.normal()] + seg_vers[ref.normal()])

    return output.getvalue()


def import_versions_from_stream(csv_stream, columns, user_id):
    csv.field_size_limit(sys.maxsize)
    reader = csv.reader(csv_stream)
    rows = [row for row in reader]
    return _import_versions_from_csv(rows, columns, user_id)


def import_versions_from_file(csv_filename, columns):
    """
    Import the versions in the columns listed in `columns`
    :param columns: zero-based list of column numbers with a new version in them
    :return:
    """
    csv.field_size_limit(sys.maxsize)
    with open(csv_filename, 'rb') as csvfile:
        reader = csv.reader(csvfile)
        rows = [row for row in reader]
    return _import_versions_from_csv(rows, columns)


def _import_versions_from_csv(rows, columns, user_id):
    from sefaria.tracker import modify_bulk_text

    index_title = rows[0][columns[0]]  # assume the same index title for all
    index_node = Ref(index_title).index_node


    action = "edit"
    for column in columns:
        # Create version
        version_title = rows[1][column]
        version_lang = rows[2][column]

        v = Version().load({
            "title": index_title,
            "versionTitle": version_title,
            "language": version_lang
        })

        if v is None:
            action = "add"
            v = Version({
                "chapter": index_node.create_skeleton(),
                "title": index_title,
                "versionTitle": version_title,
                "language": version_lang,            # Language
                "versionSource": rows[3][column],       # Version Source
                "versionNotes": rows[4][column],        # Version Notes
            }).save()

        # Populate it
        text_map = {}
        for row in rows[5:]:
            text_map[row[0]] = row[column]
        modify_bulk_text(user_id, v, text_map, type=action)
