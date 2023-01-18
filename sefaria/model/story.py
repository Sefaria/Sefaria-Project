# -*- coding: utf-8 -*-

"""
story.py
"""

from sefaria.utils.util import strip_tags
from . import user_profile

import structlog
logger = structlog.get_logger(__name__)


class Story(object):
# Deprecated in Nov 2022.  Retained for static methods used in sheet and trend statistics
# TODO: Refactor out of existence

    @staticmethod
    def sheet_metadata(sheet_id, return_id=False):
        from sefaria.sheets import get_sheet_metadata
        metadata = get_sheet_metadata(sheet_id)
        if not metadata:
            return None
        return Story.build_sheet_metadata_dict(metadata, sheet_id, return_id=return_id)

    @staticmethod
    def build_sheet_metadata_dict(metadata, sheet_id, return_id=False):
        d = {
            "sheet_title": strip_tags(metadata["title"]),
            "sheet_summary": strip_tags(metadata["summary"]) if "summary" in metadata else "",
            "publisher_id": metadata["owner"],
            "sheet_via": metadata.get("via", None)
        }
        if return_id:
            d["sheet_id"] = sheet_id
        return d

    @staticmethod
    def publisher_metadata(publisher_id, return_id=False):
        udata = user_profile.public_user_data(publisher_id)
        d = {
            "publisher_name": udata["name"],
            "publisher_url": udata["profileUrl"],
            "publisher_image": udata["imageUrl"],
            "publisher_position": udata["position"],
            "publisher_organization": udata["organization"],
        }
        if return_id:
            d["publisher_id"] = publisher_id

        return d

    @staticmethod
    def sheet_metadata_bulk(sid_list, return_id=False, public=True):
        from sefaria.sheets import get_sheet_metadata_bulk
        metadata_list = get_sheet_metadata_bulk(sid_list, public=public)
        return [Story.build_sheet_metadata_dict(metadata, metadata['id'], return_id) for metadata in metadata_list]
