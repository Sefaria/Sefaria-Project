# -*- coding: utf-8 -*-

import sys
import os
import csv
try:
    import re2 as re
except ImportError:
    import re
import json
import zipfile
import glob
import time
import traceback
import requests
import p929
import codecs
from collections import defaultdict
from shutil import rmtree
from random import random
from pprint import pprint
from datetime import timedelta
from datetime import datetime
import dateutil.parser
from concurrent.futures.thread import ThreadPoolExecutor
from local_settings import *

sys.path.insert(0, SEFARIA_PROJECT_PATH)
sys.path.insert(0, SEFARIA_PROJECT_PATH + "/sefaria")
os.environ['DJANGO_SETTINGS_MODULE'] = "sefaria.settings"
import django
django.setup()

import sefaria.model as model
from sefaria.client.wrapper import get_links
from sefaria.model.text import Version
from sefaria.model.schema import Term
from sefaria.utils.talmud import section_to_daf
from sefaria.utils.calendars import get_all_calendar_items
from sefaria.utils.hebrew import hebrew_parasha_name
from sefaria.system.exceptions import InputError, BookNameError
from sefaria.system.exceptions import NoVersionFoundError
from sefaria.model.history import HistorySet
from sefaria.system.database import db

"""
list all version titles and notes in index
list index of version title / notes in section

OR

put default version title and notes in index
optional var 'merged:true' if merged. In this case section has version title and notes. This can also be merged, in which case ignore version

index is merged if any of its sections are Merged
or
any section has a version different than the default version
"""

SCHEMA_VERSION = "6"  # remove itags from text, make calendars future-proof
EXPORT_PATH = SEFARIA_EXPORT_PATH + "/" + SCHEMA_VERSION

TOC_PATH          = "/toc.json"
SEARCH_TOC_PATH   = "/search_toc.json"
TOPIC_TOC_PATH    = "/topic_toc.json"
HEB_CATS_PATH     = "/hebrew_categories.json"
PEOPLE_PATH       = "/people.json"
PACK_PATH         = "/packages.json"
CALENDAR_PATH     = "/calendar.json"
LAST_UPDATED_PATH = EXPORT_PATH + "/last_updated.json"
MAX_FILE_SIZE = 100e6


def keep_directory(func):
    def new_func(*args, **kwargs):
        original_dir = os.getcwd()
        try:
            return func(*args, **kwargs)
        finally:
            os.chdir(original_dir)
    return new_func


def make_path(doc, format):
    """
    Returns the full path and file name for exporting 'doc' in 'format'.
    """
    path = "%s/%s.%s" % (EXPORT_PATH, doc["ref"], format)
    return path


def write_doc(doc, path):
    """
    Takes a dictionary `doc` ready to export and actually writes the file to the filesystem.
    """

    if not os.path.exists(os.path.dirname(path)):
        os.makedirs(os.path.dirname(path))
    with open(path, "w") as f:
        json.dump(doc, f, ensure_ascii=False, indent=(None if MINIFY_JSON else 4), separators=((',',':') if MINIFY_JSON else None))


def zip_last_text(title):
    """
    Zip up the JSON files of the last text exported into and delete the original JSON files.
    Assumes that all previous JSON files have been deleted and the remaining ones should go in the new zip.
    """
    os.chdir(EXPORT_PATH)

    zipPath = "%s/%s.%s" % (EXPORT_PATH, title, "zip")

    z = zipfile.ZipFile(zipPath, "w", zipfile.ZIP_DEFLATED)

    for file in glob.glob("*.json"):
        # NOTE: this also will skip search_toc.json since it ends in `toc.json`
        if file.endswith("calendar.json") or file.endswith("toc.json") or file.endswith("last_updated.json") or file.endswith("hebrew_categories.json"):
            continue
        z.write(file)
        os.remove(file)
    z.close()

    return


def export_texts(skip_existing=False):
    """
    Exports all texts in the database.
    TODO -- check history and last_updated to only export texts with changes
    """
    indexes = model.library.all_index_records()
    for index in reversed(indexes):
        print(index.title)
        if skip_existing and os.path.isfile("%s/%s.zip" % (EXPORT_PATH, index.title)):
            continue
        success = export_text(index)
        if not success:
            indexes.remove(index)

    write_last_updated([i.title for i in indexes])


@keep_directory
def export_text(index, update=False):
    """Writes a ZIP file containing text content json and text index JSON
    :param index: can be either Index or str
    :param update: True if you want to write_last_updated for just this index
    """
    if isinstance(index, str):
        index = model.library.get_index(index)

    success = export_text_json(index)
    success = export_index(index) and success
    zip_last_text(index.title)

    if update and success:
        write_last_updated([index.title], update=update)

    return success


def export_updated():
    """
    Writes new TOC and zip files for each text that has changed since the last update.
    Write update times to last updated list.
    """
    #edit text, add text, edit text: {"date" : {"$gte": ISODate("2017-01-05T00:42:00")}, "ref" : /^Rashi on Leviticus/} REMOVE NONE INDEXES
    #add link, edit link: {"rev_type": "add link", "new.refs": /^Rashi on Berakhot/} REMOVE NONE INDEXES
    #delete link, edit link: {"rev_type": "add link", "old.refs": /^Rashi on Berakhot/} REMOVE NONE INDEXES
    if not os.path.exists(LAST_UPDATED_PATH):
        export_all()
        return

    print("Generating updated books list.")
    updated_books = updated_books_list()
    print("{} books updated.".format(len(updated_books)))
    new_books = new_books_since_last_update()
    print("{} books added.".format(len(new_books)))
    updated_books += new_books

    print("Updating {} books\n{}".format(len(updated_books), "\n\t".join(updated_books)))
    updated_indexes = []
    for t in updated_books:
        try:
            updated_indexes += [model.library.get_index(t)]
        except BookNameError:
            print("Skipping update for non-existent book '{}'".format(t))

    updated_books = [x.title for x in updated_indexes]
    for index in updated_indexes:
        success = export_text(index)
        if not success:
            updated_books.remove(index.title) # don't include books which dont export

    export_toc()
    export_topic_toc()
    export_hebrew_categories()
    export_packages()
    export_calendar()
    export_authors()
    write_last_updated(updated_books, update=True)


def updated_books_list():
    """
    Returns a list of books that have updated since the last export.
    Returns None is there is no previous last_updated.json
    """
    if not os.path.exists(LAST_UPDATED_PATH):
        return None
    last_updated = json.load(open(LAST_UPDATED_PATH, "rb")).get("titles", {})
    updated_books = [x[0] for x in [x for x in list(last_updated.items()) if has_updated(x[0], dateutil.parser.parse(x[1]))]]
    return updated_books


def has_updated(title, last_updated):
    """
    title - str name of index
    last_updated - datetime obj of our current knowledge of when this title was last updated
    """
    def construct_query(attribute, queries):
        query_list = [{attribute: {'$regex': query}} for query in queries]
        return {"date": {"$gt": last_updated}, '$or': query_list}
    try:
        title_queries = model.Ref(title).regex(as_list=True)
    except InputError:
        return False

    text_count = HistorySet(construct_query("ref", title_queries)).count()
    if text_count > 0:
        return True

    old_link_count = HistorySet(construct_query("old.refs", title_queries)).count()
    if old_link_count > 0:
        return True

    new_link_count = HistorySet(construct_query("new.refs", title_queries)).count()
    if new_link_count > 0:
        return True

    index_count = HistorySet({"date": {"$gt": last_updated}, "title":title}).count()
    if index_count > 0:
        return True

    return False


def get_default_versions(index):
    vdict = {}
    versions = index.versionSet().array()

    i = 0
    while ('he' not in vdict or 'en' not in vdict) and i < len(versions):
        v = versions[i]
        if v.language not in vdict:
            vdict[v.language] = v
        i += 1

    return vdict


def export_text_json(index):
    """
    Takes a single document from the `texts` collection exports it, by chopping it up
    Add helpful data like

    returns True if export was successful
    """
    # print(index.title)
    defaultVersions = get_default_versions(index)

    try:
        index_text = TextAndLinksForIndex(index)
        for oref in index.all_top_section_refs():
            if oref.is_section_level():
                doc = index_text.section_data(oref, defaultVersions)
            else:
                sections = oref.all_subrefs()
                doc = {
                    "ref": oref.normal(),
                    "sections": {}
                }
                for section in sections:
                    doc["sections"][section.normal()] = index_text.section_data(section, defaultVersions)

            path = make_path(doc, "json")
            write_doc(doc, path)
        return True

    except Exception as e:
        print("Error exporting %s: %s" % (index.title, e))
        print(traceback.format_exc())
        return False


def simple_link(link):
    """
    Returns dictionary with all we care about for link in a section
    """
    simple = {
        "sourceHeRef": link["sourceHeRef"],
        "sourceRef":   link["sourceRef"]
    }
    if link["category"] in ("Quoting Commentary", "Targum"):
        simple["category"] = link["category"]
    if link.get("sourceHasEn", False):  # only include when True
        simple["sourceHasEn"] = True
    return simple


"""
For each index:
Load all leaf nodes.
For each leaf node, load a jaggedArray. Map full node title to jaggedArray
for oref in index.all_top_section_refs():
    node_title = r.index_node.full_title()
    the specific piece of the jaggedArray can be obtained with ja.get_element(oref.sections)
"""


class SortedLinks:
    """
    This class is supposed to support making a single large db lookup for links, then to dish them out bit by bit for
    each section.
    This algorithm doesn't seem to quite give the same results as calling wrapper.get_links directly on a smaller Ref.
    The speedup given so far doesn't seem to be worth the effort in perfecting this, but we'll keep it here in case
    something of this nature is required in the future.
    """
    def __init__(self, index_obj: model.Index):
        self.index_obj = index_obj
        self.node_numbers = {node.full_title(): j for j, node in enumerate(index_obj.nodes.get_leaf_nodes())}
        self.link_iter = iter(self.get_sorted_links())
        self._next_link = self.safe_next(self.link_iter)

    def sort_key(self, tref):
        oref = model.Ref(tref)
        return [self.node_numbers[oref.index_node.full_title()]] + oref.sections

    def get_sorted_links(self):
        return sorted(get_links(self.index_obj.title, False, False), key=lambda x: self.sort_key(x['anchorRef']))

    def get_matching_links(self, tref: str) -> list:
        if self._next_link is None:
            return []

        oref = model.Ref(tref)
        reg = re.compile(oref.regex())
        link_list = []
        while self._next_link and reg.match(self._next_link['anchorRef']):
            link_list.append(self._next_link)
            self._next_link = self.safe_next(self.link_iter)

        return link_list

    @staticmethod
    def safe_next(iterator):
        try:
            return next(iterator)
        except StopIteration:
            return None


class TextAndLinksForIndex:

    def __init__(self, index_obj: model.Index):
        self._text_map = {}
        self.version_state = index_obj.versionState()
        leaf_nodes = index_obj.nodes.get_leaf_nodes()
        for leaf in leaf_nodes:
            oref = leaf.ref()
            en_chunk, he_chunk = oref.text('en'), oref.text('he')
            self._text_map[leaf.full_title()] = {
                'en_chunk': en_chunk,
                'he_chunk': he_chunk,
                'en_ja': en_chunk.ja(),
                'he_ja': he_chunk.ja()
            }
        # self.sorted_links = SortedLinks(index_obj)

    def section_data(self, oref: model.Ref, default_versions: dict) -> dict:
        """
        :param oref: section level Ref instance
        :param default_versions: {'en': Version, 'he': Version}
        :param prev_next: tuple, with the oref before oref and after oref (or None if this is the first/last ref)
        Returns a dictionary with all the data we care about for section level `oref`.
        """
        prev, next_ref = oref.prev_section_ref(vstate=self.version_state),\
                         oref.next_section_ref(vstate=self.version_state)

        data = {
            "ref": oref.normal(),
            "heRef": oref.he_normal(),
            "indexTitle": oref.index.title,
            "heTitle": oref.index.get_title('he'),
            "sectionRef": oref.normal(),
            "next":    next_ref.normal() if next_ref else None,
            "prev": prev.normal() if prev else None,
            "content": [],
        }

        def get_version_title(chunk):
            if not chunk.is_merged:
                version = chunk.version()
                if version and version.language in default_versions and version.versionTitle != default_versions[version.language].versionTitle:
                    #print "VERSION NOT DEFAULT {} ({})".format(oref, chunk.lang)
                    try:
                        vnotes = version.versionNotes
                    except AttributeError:
                        vnotes = None
                    try:
                        vlicense = version.license
                    except AttributeError:
                        vlicense = None
                    try:
                        vsource = version.versionSource
                    except AttributeError:
                        vsource = None
                    try:
                        vnotesInHebrew = version.versionNotesInHebrew
                    except AttributeError:
                        vnotesInHebrew = None
                    try:
                        versionTitleInHebrew = version.versionTitleInHebrew
                    except AttributeError:
                        versionTitleInHebrew = None

                    return version.versionTitle, vnotes, vlicense, vsource, versionTitleInHebrew, vnotesInHebrew
                else:
                    return None, None, None, None, None, None # default version
            else:
                #merged
                #print "MERGED SECTION {} ({})".format(oref, chunk.lang)
                all_versions = set(chunk.sources)
                merged_version = 'Merged from {}'.format(', '.join(all_versions))
                return merged_version, None, None, None, None, None

        def get_text_array(sections, ja_lang):
            if sections:
                try:
                    return self._text_map[node_title][ja_lang].get_element([j-1 for j in sections])
                except IndexError:
                    return []
            else:  # Ref(Pesach Haggadah, Kadesh) does not have sections, although it is a section ref
                return self._text_map[node_title][ja_lang].array()

        node_title = oref.index_node.full_title()
        en_chunk, he_chunk = self._text_map[node_title]['en_chunk'], self._text_map[node_title]['en_chunk']
        en_vtitle, en_vnotes, en_vlicense, en_vsource, en_vtitle_he, en_vnotes_he = get_version_title(en_chunk)
        he_vtitle, he_vnotes, he_vlicense, he_vsource, he_vtitle_he, he_vnotes_he = get_version_title(he_chunk)

        if en_vtitle:
            data['versionTitle'] = en_vtitle
        if he_vtitle:
            data['heVersionTitle'] = he_vtitle
        if en_vnotes:
            data['versionNotes'] = en_vnotes
        if he_vnotes:
            data['heVersionNotes'] = he_vnotes
        if en_vlicense:
            data['license'] = en_vlicense
        if he_vlicense:
            data['heLicense'] = he_vlicense
        if en_vsource:
            data['versionSource'] = en_vsource
        if he_vsource:
            data['heVersionSource'] = he_vsource
        if en_vtitle_he:
            data['versionTitleInHebrew'] = en_vtitle_he
        if he_vtitle_he:
            data['heVersionTitleInHebrew'] = he_vtitle_he
        if en_vnotes_he:
            data['versionNotesInHebrew'] = en_vnotes_he
        if he_vnotes_he:
            data['heVersionNotesInHebrew'] = he_vnotes_he

        en_text = get_text_array(oref.sections, 'en_ja')
        he_text = get_text_array(oref.sections, 'he_ja')

        en_len = len(en_text)
        he_len = len(he_text)
        section_links = get_links(oref.normal(), False)
        anchor_ref_dict = defaultdict(list)
        for link in section_links:
            anchor_oref = model.Ref(link["anchorRef"])
            if not anchor_oref.is_segment_level() or len(anchor_oref.sections) == 0:
                continue  # don't bother with section level links
            start_seg_num = anchor_oref.sections[-1]
            # make sure sections are the same in range
            # TODO doesn't deal with links that span sections
            end_seg_num = anchor_oref.toSections[-1] if anchor_oref.sections[0] == anchor_oref.toSections[0] else max(en_len, he_len)
            for x in range(start_seg_num, end_seg_num+1):
                anchor_ref_dict[x] += [simple_link(link)]
        for x in range (0,max(en_len,he_len)):
            curContent = {}
            curContent["segmentNumber"] = str(x+1)
            links = anchor_ref_dict[x+1]
            if len(links) > 0:
                curContent["links"] = links

            if x < en_len:
                curContent["text"] = en_text[x]
            if x < he_len:
                curContent["he"] = he_text[x]

            data["content"] += [curContent]

        return data


def export_index(index):
    """
    Writes the JSON of the index record of the text called `title`.
    TODO - this function should probably take index as a parameter
    """
    try:
        index_counts = index.contents_with_content_counts()
        default_versions = get_default_versions(index)

        if 'en' in default_versions:
            index_counts['versionTitle'] = default_versions['en'].versionTitle
            try:
                index_counts['versionNotes'] = default_versions['en'].versionNotes
            except AttributeError:
                pass
            try:
                index_counts['license'] = default_versions['en'].license
            except AttributeError:
                pass
            try:
                index_counts['versionSource'] = default_versions['en'].versionSource
            except AttributeError:
                pass
            try:
                index_counts['versionTitleInHebrew'] = default_versions['en'].versionTitleInHebrew
            except AttributeError:
                pass
            try:
                index_counts['versionNotesInHebrew'] = default_versions['en'].versionNotesInHebrew
            except AttributeError:
                pass
        if 'he' in default_versions:
            index_counts['heVersionTitle'] = default_versions['he'].versionTitle
            try:
                index_counts['heVersionNotes'] = default_versions['he'].versionNotes
            except AttributeError:
                pass
            try:
                index_counts['heLicense'] = default_versions['he'].license
            except AttributeError:
                pass
            try:
                index_counts['heVersionSource'] = default_versions['he'].versionSource
            except AttributeError:
                pass
            try:
                index_counts['heVersionTitleInHebrew'] = default_versions['he'].versionTitleInHebrew
            except AttributeError:
                pass
            try:
                index_counts['heVersionNotesInHebrew'] = default_versions['he'].versionNotesInHebrew
            except AttributeError:
                pass
        path  = "%s/%s_index.json" % (EXPORT_PATH, index.title)
        write_doc(index_counts, path)

        return True
    except Exception as e:
        print("Error exporting Index for %s: %s" % (index.title, e))
        print(traceback.format_exc())

        return False


def get_indexes_in_category(cats, toc):
    indexes = []
    for temp_toc in toc:
        if "contents" in temp_toc and (len(cats) == 0 or temp_toc["category"] == cats[0]):
            indexes += get_indexes_in_category(cats[1:], temp_toc["contents"])
        elif len(cats) == 0 and "title" in temp_toc:
            indexes += [temp_toc["title"]]
    return indexes


def get_downloadable_packages():
    toc = clean_toc_nodes(model.library.get_toc())
    packages = [
        {
            "en": "COMPLETE LIBRARY",
            "he": "כל הספרייה",
            "color": "Other",
            "categories": []
        },
        {
            "en": "TANAKH with Rashi",
            "he": "תנ״ך עם רש״י",
            "color": "Tanakh",
            "parent": "TANAKH and all commentaries",
            "categories": [
                "Tanakh/Torah",
                "Tanakh/Prophets",
                "Tanakh/Writings",
                "Tanakh/Commentary/Rashi"
            ]
        },
        {
            "en": "TANAKH and all commentaries",
            "he": "תנ״ך וכל המפרשים",
            "color": "Tanakh",
            "categories": [
                "Tanakh"
            ]
        },
        {
            "en": "TALMUD with Rashi and Tosafot",
            "he": "תלמוד עם רש״י ותוספות",
            "parent": "TALMUD and all commentaries",
            "color": "Talmud",
            "categories": [
                "Talmud/Bavli/Seder Zeraim",
                "Talmud/Bavli/Seder Moed",
                "Talmud/Bavli/Seder Nashim",
                "Talmud/Bavli/Seder Nezikin",
                "Talmud/Bavli/Seder Kodashim",
                "Talmud/Bavli/Seder Tahorot",
                "Talmud/Bavli/Commentary/Rashi",
                "Talmud/Bavli/Commentary/Tosafot"
            ]
        },
        {
            "en": "TALMUD and all commentaries",
            "he": "תלמוד וכל המפרשים",
            "color": "Talmud",
            "categories": [
                "Talmud"
            ]
        }
    ]
    # Add all top-level categories
    for cat in toc[:7]:
        if cat["category"] == "Tanakh" or cat["category"] == "Talmud":
            continue  # already included above
        packages += [{
            "en": cat["category"].upper(),
            "he": cat["heCategory"],
            "color": cat["category"],
            "categories": [cat["category"]]
        }]
    for p in packages:
        indexes = []
        hasCats = len(p["categories"]) > 0
        if hasCats:
            for c in p["categories"]:
                indexes += get_indexes_in_category(c.split("/"), toc)
        else:
            indexes += get_indexes_in_category([], toc)
        size = 0
        for i in indexes:
            size += os.path.getsize("{}/{}.zip".format(EXPORT_PATH, i)) if os.path.isfile("{}/{}.zip".format(EXPORT_PATH, i)) else 0  # get size in kb. overestimate by 1kb
        if hasCats:
            # only include indexes if not complete library
            p["indexes"] = indexes
        del p["categories"]
        p["size"] = size
    return packages


def write_last_updated(titles, update=False):
    """
    Writes to `last_updated.json` the current time stamp for all `titles`.
    :param update: True if you only want to update the file and not overwrite
    """
    def get_timestamp(title):
        return datetime.fromtimestamp(os.stat(f'{EXPORT_PATH}/{title}.zip').st_mtime).isoformat()

    if not titles:
        titles = filter(lambda x: x.endswith('zip'), os.listdir(EXPORT_PATH))
        titles = [re.search(r'([^/]+)\.zip$', title).group(1) for title in titles]

    last_updated = {
        "schema_version": SCHEMA_VERSION,
        "comment": "",
        "titles": {
            title: get_timestamp(title)
            for title in titles
        }
    }
    #last_updated["SCHEMA_VERSION"] = SCHEMA_VERSION
    if update:
        try:
            old_doc = json.load(open(LAST_UPDATED_PATH, "rb"))
        except IOError:
            old_doc = {"schema_version": 0, "comment": "", "titles": {}}

        old_doc["schema_version"] = last_updated["schema_version"]
        old_doc["comment"] = last_updated["comment"]
        old_doc["titles"].update(last_updated["titles"])
        last_updated = old_doc

    write_doc(last_updated, LAST_UPDATED_PATH)

    if USE_CLOUDFLARE:
        purge_cloudflare_cache(titles)


def export_packages(for_sources=False):
    packages = get_downloadable_packages()
    write_doc(packages, (SEFARIA_IOS_SOURCES_PATH if for_sources else EXPORT_PATH) + PACK_PATH)
    write_doc(packages, (SEFARIA_ANDROID_SOURCES_PATH if for_sources else EXPORT_PATH) + PACK_PATH)


def split_list(l, size):
    chunks = int(len(l) / size)
    values = [l[i*size:(i+1)*size] for i in range(chunks)]
    last_bit = l[chunks*size:len(l)]
    if last_bit:
        values.append(last_bit)
    return values


def build_split_archive(book_list, build_loc, export_dir='', archive_size=MAX_FILE_SIZE):
    if os.path.exists(build_loc):
        try:
            rmtree(build_loc)
        except NotADirectoryError:
            os.remove(build_loc)
    os.mkdir(build_loc)
    z, current_size, i, filenames = None, 0, 0, []
    for title in book_list:
        if not z:
            i += 1
            filename = f'{build_loc}/{i}.zip'
            z = zipfile.ZipFile(filename, 'w', zipfile.ZIP_DEFLATED)
            current_size = 0
            filenames.append(filename)
        try:
            z.write(os.path.join(export_dir, title), arcname=title)
        except FileNotFoundError:
            print(f"No zip file for {title}; the bundles will be missing this text")
            continue
        current_size += z.getinfo(title).compress_size
        if current_size > archive_size:
            z.close()
            z = None
    if z:
        z.close()

    return [os.path.basename(f) for f in filenames]


@keep_directory
def zip_packages():
    packages = get_downloadable_packages()
    bundle_path = f'{EXPORT_PATH}/bundles'
    if not os.path.isdir(bundle_path):
        os.mkdir(bundle_path)

    curdir = os.getcwd()
    os.chdir(EXPORT_PATH)

    for package in packages:
        package_name = package['en']
        print(package_name)
        if package_name == 'COMPLETE LIBRARY':
            titles = [i.title for i in model.library.all_index_records()]
        else:
            titles = package['indexes']
        titles = [f'{t}.zip' for t in titles]
        build_split_archive(titles, f'{bundle_path}/{package_name}')

    os.chdir(curdir)


def export_hebrew_categories(for_sources=False):
    """
    Writes translation of all English categories into a single file.
    """
    print("Export Hebrew Categories")
    term = Term()
    eng_cats = model.library.get_text_categories()
    hebrew_cats_json = {}
    for e in eng_cats:
        t = term.load_by_title(e)
        if not t:
            print("Couldn't load term '{}'. Skipping Hebrew category".format(e))
        else:
            hebrew_cats_json[e] = t.titles[1]['text']
    write_doc(hebrew_cats_json, (SEFARIA_IOS_SOURCES_PATH if for_sources else EXPORT_PATH) + HEB_CATS_PATH)
    write_doc(hebrew_cats_json, (SEFARIA_ANDROID_SOURCES_PATH if for_sources else EXPORT_PATH) + HEB_CATS_PATH)


def export_topic_toc(for_sources=False):
    topic_toc = model.library.get_topic_toc_json_recursive(with_descriptions=True)
    write_doc(topic_toc, (SEFARIA_IOS_SOURCES_PATH if for_sources else EXPORT_PATH) + TOPIC_TOC_PATH)


def clean_toc_nodes(toc):
    """
    Removes any nodes in TOC that we can't handle.
    """
    newToc = []
    for t in toc:
        if "contents" in t:
            new_item = {}
            for k, v in list(t.items()):
                if k != "contents":
                    new_item[k] = v
            newToc += [new_item]
            newToc[-1]["contents"] = clean_toc_nodes(t["contents"])
        elif "isGroup" in t or t.get('isCollection', False):
            continue  # Not currently handling sheets in TOC
        elif "title" in t:
            newToc += [{k: v for k, v in list(t.items())}]
        else:
            print("Goodbye {}".format(t))
    return newToc



def export_toc(for_sources=False):
    """
    Writes the Table of Contents JSON to a single file.
    """
    print("Export Table of Contents")
    new_toc = model.library.get_toc()
    new_search_toc = model.library.get_search_filter_toc()
    new_new_toc = clean_toc_nodes(new_toc)
    new_new_search_toc = clean_toc_nodes(new_search_toc)
    write_doc(new_new_toc, (SEFARIA_IOS_SOURCES_PATH if for_sources else EXPORT_PATH) + TOC_PATH)
    write_doc(new_new_search_toc, (SEFARIA_IOS_SOURCES_PATH if for_sources else EXPORT_PATH) + SEARCH_TOC_PATH)
    write_doc(new_new_toc, (SEFARIA_ANDROID_SOURCES_PATH if for_sources else EXPORT_PATH) + TOC_PATH)
    write_doc(new_new_search_toc, (SEFARIA_ANDROID_SOURCES_PATH if for_sources else EXPORT_PATH) + SEARCH_TOC_PATH)


def new_books_since_last_update():
    """
    Returns a list of books that have been added to the library since the last update.
    """
    new_toc = clean_toc_nodes(model.library.get_toc())
    def get_books(temp_toc, books):
        if isinstance(temp_toc, list):
            for child_toc in temp_toc:
                if "contents" in child_toc:
                    child_toc = child_toc["contents"]
                books.update(get_books(child_toc, set()))
        else:
            try:
                books.add(temp_toc["title"])
            except KeyError:
                print("Bad Toc item skipping {}".format(temp_toc))
        return books

    last_updated = json.load(open(LAST_UPDATED_PATH, 'rb')) if os.path.exists(LAST_UPDATED_PATH) else {"titles": {}}
    old_books = list(last_updated["titles"].keys())
    new_books = get_books(new_toc, set())

    added_books = [book for book in new_books if book not in old_books]
    return added_books


def export_calendar(for_sources=False):
    """
    Writes a JSON file with all calendars from `get_all_calendar_items` for the next 365 days
    """
    calendar = {}
    base = datetime.today()
    date_list = [base + timedelta(days=x) for x in range(-2, 365)]
    for dt in date_list:
        curr_cal = defaultdict(list)
        all_possibilities = defaultdict(lambda: defaultdict(list))
        for diaspora in (True, False):
            for custom in ('ashkenazi', 'sephardi'):
                cal_items = get_all_calendar_items(dt, diaspora=diaspora, custom=custom)
                # aggregate by type to combine refs
                cal_items_dict = {}
                for c in cal_items:
                    ckey = c['order']
                    if ckey in cal_items_dict:
                        cal_items_dict[ckey]['refs'] += [c['ref']]
                        cal_items_dict[ckey]['subs'] += [c['displayValue']]
                    else:
                        ref = c['ref']
                        displayValue = c['displayValue']
                        del c['ref']
                        del c['url']
                        del c['displayValue']
                        c['refs'] = [ref]
                        c['subs'] = [displayValue]
                        cal_items_dict[ckey] = c
                for ckey, c in list(cal_items_dict.items()):
                    c['custom'] = custom
                    c['diaspora'] = diaspora
                    all_possibilities[ckey][c['refs'][0]] += [c]
        for key, title_dict in list(all_possibilities.items()):
            for i, (tref, poss_list) in enumerate(title_dict.items()):
                if i == 0:
                    del poss_list[0]['custom']
                    del poss_list[0]['diaspora']
                    curr_cal['d'] += [poss_list[0]]
                else:
                    for p in poss_list:
                        pkey = '{}|{}'.format(1 if p['diaspora'] else 0, p['custom'][0])
                        del p['custom']
                        del p['diaspora']
                        curr_cal[pkey] += [p]
        calendar[dt.date().isoformat()] = curr_cal


    path = (SEFARIA_IOS_SOURCES_PATH if for_sources else EXPORT_PATH) + CALENDAR_PATH
    write_doc(calendar, path)
    write_doc(calendar, (SEFARIA_ANDROID_SOURCES_PATH if for_sources else EXPORT_PATH) + CALENDAR_PATH)


def export_authors(for_sources=False):
    ps = model.PersonSet()
    people = {}
    for person in ps:
        for name in person.names:
            if not isinstance(name["text"], str):
                continue
            people[name["text"].lower()] = 1
    path = (SEFARIA_IOS_SOURCES_PATH if for_sources else EXPORT_PATH) + PEOPLE_PATH
    write_doc(people, path)
    write_doc(people, (SEFARIA_ANDROID_SOURCES_PATH if for_sources else EXPORT_PATH) + PEOPLE_PATH)


def clear_exports():
    """
    Deletes all files from any export directory listed in export_formats.
    """
    if os.path.exists(EXPORT_PATH):
        rmtree(EXPORT_PATH)


def recursive_listdir(path):
    file_list, sub_dirs = [], []

    def recurse(r_path):
        nonlocal file_list, sub_dirs
        for f in os.listdir(r_path):
            if os.path.isfile(f'{r_path}/{f}'):
                file_list.append(f'{"/".join(sub_dirs)}/{f}')
            else:
                sub_dirs.append(f)
                recurse(f'{r_path}/{f}')
                sub_dirs.pop()
    recurse(path)
    return file_list


def iter_chunks(list_obj: list, chunk_size: int):
    current_loc = 0
    while current_loc < len(list_obj):
        yield list_obj[current_loc:current_loc + chunk_size]
        current_loc = current_loc + chunk_size


def purge_cloudflare_cache(titles):
    """
    Purges the URL for each zip file named in `titles` as well as toc.json, last_updated.json and calendar.json.
    """
    if not titles:
        titles = [t.title for t in model.library.all_index_records()]
    files = ["%s/%s/%s.zip" % (CLOUDFLARE_PATH, SCHEMA_VERSION, title) for title in titles]
    files += ["%s/%s/%s.json" % (CLOUDFLARE_PATH, SCHEMA_VERSION, title) for title in ("toc", "topic_toc", "search_toc", "last_updated", "calendar", "hebrew_categories", "people", "packages")]
    files += [f'{CLOUDFLARE_PATH}/{SCHEMA_VERSION}/{f}' for f in recursive_listdir('./static/ios-export/6/bundles')]
    url = 'https://api.cloudflare.com/client/v4/zones/%s/purge_cache' % CLOUDFLARE_ZONE

    def send_purge(file_list):
        payload = {"files": file_list}
        headers = {
            "X-Auth-Email": CLOUDFLARE_EMAIL,
            "X-Auth-Key": CLOUDFLARE_TOKEN,
            "Content-Type": "application/json",
        }
        return requests.delete(url, data=json.dumps(payload), headers=headers)

    with ThreadPoolExecutor() as executor:
        results = executor.map(send_purge, iter_chunks(files, 25))
    # r = requests.delete(url, data=json.dumps(payload), headers=headers)
    print("Purged {} files from Cloudflare".format(len(files)))

    return results


def export_all(skip_existing=False):
    """
    Export everything we need.
    If `skip_existing`, skip any text that already has a zip file, otherwise delete everything and start fresh.
    """
    start_time = time.time()
    export_toc()
    export_topic_toc()
    export_calendar()
    export_hebrew_categories()
    export_texts(skip_existing)
    export_authors()
    export_packages()
    print(("--- %s seconds ---" % round(time.time() - start_time, 2)))


def export_base_files_to_sources():
    """
    Export the basic files that should be bundled with a new release of the iOS app
    Run this before every new release
    """
    export_toc(for_sources=True)
    export_topic_toc(for_sources=True)
    export_hebrew_categories(for_sources=True)
    export_calendar(for_sources=True)
    export_authors(for_sources=True)
    export_packages(for_sources=True)  # relies on full dump to be available to measure file sizes


@keep_directory
def clear_bundles():
    curdir = os.getcwd()
    try:
        os.chdir(f'{EXPORT_PATH}/bundles')
    except FileNotFoundError:
        return
    for f in os.listdir('.'):
        if os.path.isfile(f):
            os.remove(f)
        else:
            rmtree(f)
    os.chdir(curdir)


if __name__ == '__main__':
    purged = False

    def purge():
        global purged
        if purged:
            return
        else:
            purged = True
            clear_bundles()
            zip_packages()
    # we've been experiencing many issues with strange books appearing in the toc. i believe this line should solve that
    model.library.rebuild_toc()
    action = sys.argv[1] if len(sys.argv) > 1 else None
    index_title = sys.argv[2] if len(sys.argv) > 2 else None
    if action == "export_all":
        export_all()
    elif action == "export_all_skip_existing":
        export_all(skip_existing=True)
    elif action == "export_text":
        if not index_title:
            print("To export_index, please provide index title")
        else:
            export_text(index_title, update=True)
    elif action == "export_updated":
        export_updated()
    elif action == "purge_cloudflare":  # purge general toc and last_updated files
        if USE_CLOUDFLARE:
            purge()
            purge_cloudflare_cache([])
        else:
            print("not using cloudflare")
    elif action == "export_toc":
        export_toc()
        export_topic_toc()
        if USE_CLOUDFLARE:
            purge_cloudflare_cache([])
    elif action == "export_hebrew_categories":
        export_hebrew_categories()
    elif action == "export_calendar":
        export_calendar()
    elif action == "export_authors":
        export_authors()
    elif action == "export_base_files_to_sources":
        export_base_files_to_sources()
    elif action == "export_packages":
        export_packages()
    elif action == "write_last_updated":  # for updating package infor
        write_last_updated([], True)
    purge()
    try:
        url = os.environ['SLACK_URL']
    except KeyError:
        print('slack url not configured')
        sys.exit(0)
    timestamp = datetime.fromtimestamp(os.stat(f'{EXPORT_PATH}/last_updated.json').st_mtime).ctime()
    if DEBUG_MODE:
        print(f'Mobile export complete. Timestamp on `last_updated.json` is {timestamp}')
    else:
        requests.post(url, json={
            'channel': '#engineering-mobile',
            'text': f'Mobile export complete. Timestamp on `last_updated.json` is {timestamp}',
            'username': 'Mobile Export',
            'icon_emoji': ':file_folder:'
        })
