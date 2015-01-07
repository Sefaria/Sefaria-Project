# coding=utf-8
from sefaria.model import *


def merge_text_versions(version1, version2, text_title, language, warn=False):
    """
    Merges the contents of two distinct text versions.
    version2 is merged into version1 then deleted.
    Preference is giving to version1 - if both versions contain content for a given segment,
    only the content of version1 will be retained.


    History entries are rewritten for version2.
    NOTE: the history of that results will be incorrect for any case where the content of
    version2 is overwritten - the history of those overwritten edits will remain.
    To end with a perfectly accurate history, history items for segments which have been overwritten
    would need to be identified and deleted.
    """
    v1 = Version().load({"title": text_title, "versionTitle": version1, "language": language})
    if not v1:
        return {"error": "Version not found: %s" % version1 }
    v2 = Version().load({"title": text_title, "versionTitle": version2, "language": language})
    if not v2:
        return {"error": "Version not found: %s" % version2 }

    if warn and v1.ja().overlaps(v2.ja()):
        print "WARNING - %s & %s have overlapping content. Aborting." % (version1, version2)


    merged_text, sources = merge_texts([v1.chapter, v2.chapter], [version1, version2])

    v1.chapter = merged_text
    v1.save()
    history.process_version_title_change_in_history(v1, old=version2, new=version1)

    v2.delete()

    return {"status": "ok"}


def merge_multiple_text_versions(versions, text_title, language, warn=False):
    """
    Merges contents of multiple text versions listed in 'versions'
    Versions listed first in 'versions' will receive priority if there is overlap.
    """
    v1 = versions.pop(0)
    for v2 in versions:
        merge_text_versions(v1, v2, text_title, language)


def merge_text_versions_by_source(text_title, language, warn=False):
    """
    Merges all texts of text_title in langauge that share the same value for versionSource.
    """
    v = VersionSet({"title": text_title, "language": language})

    for s in v.distinct("versionSource"):
        versions = VersionSet({"title": text_title, "versionSource": s, "language": language}).distinct("versionTitle")
        merge_multiple_text_versions(versions, text_title, language)


def merge_text_versions_by_language(text_title, language, warn=False):
    """
    Merges all texts of text_title in langauge.
    """
    versions = VersionSet({"title": text_title, "language": language}).distinct("versionTitle")
    merge_multiple_text_versions(versions, text_title, language)