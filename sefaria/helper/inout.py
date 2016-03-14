# coding=utf-8

import unicodecsv as csv
import io
from sefaria.model import *


# Version import export format:
# Column 1: References
# Columns 2-n: Versions

# Row 1: Index title (will repeat?)
# Row 2: Version Title
# Row 3: Version Language
# Row 4: Version Source


def export_version_csv(index, version_list):
    assert isinstance(index, Index)
    assert isinstance(version_list, list) or isinstance(version_list, VersionSet)
    assert all(isinstance(v, Version) for v in version_list)

    output = io.BytesIO()
    writer = csv.writer(output)

    #write header data
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


def import_versions(csv_filename, columns):
    """
    Import the versions in the columns listed in `columns`
    :param columns: zero-based list of column numbers with a new version in them
    :return:
    """
    with open(csv_filename, 'rb') as csvfile:
        reader = csv.reader(csvfile)
        rows = [row for row in reader]

    index_title = rows[0][columns[0]] # assume the same index title for all

    # Get Versions from top rows of CSV
    for column in columns:
        Version({
            "title": index_title,
            "versionTitle": rows[1][column],
            "language": rows[2][column],     # Language
            "versionSource": rows[3][column],     # Version Source
            "versionNotes": rows[4][column],     # Version Notes
        }).save()

    # For each existing version

    # For each new version

    pass
