# coding=utf-8
import regex as re
from sefaria.system.exceptions import InputError

from . import abstract as abst
from . import text
from sefaria.model.text import Ref

import structlog
logger = structlog.get_logger(__name__)


class Guide(abst.AbstractMongoRecord):
    """
    Learning Guides for sidebar connection panel.

    Data structure:
        ref: A string that references the specific section of the Pesach Haggadah being discussed.
        questions: An array of questions, each containing:
            question: A string representing the question being asked about the Pesach Haggadah.
                commentaries: An array of commentaries related to the question, each containing:
                    commentaryRef: A string that serves as a reference to the specific commentary on the Pesach Haggadah.
                    summaryText: A string providing a summary of the commentary's main points or interpretations.

Formally:
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Pesach Haggadah Commentary",
  "type": "object",
  "properties": {
    "ref": {
      "type": "string",
      "description": "A reference to the specific section of the Pesach Haggadah being discussed."
    },
    "questions": {
      "type": "array",
      "description": "An array of questions related to the Pesach Haggadah.",
      "items": {
        "type": "object",
        "properties": {
          "question": {
            "type": "string",
            "description": "The question being asked about the Pesach Haggadah."
          },
          "commentaries": {
            "type": "array",
            "description": "An array of commentaries related to the question.",
            "items": {
              "type": "object",
              "properties": {
                "commentaryRef": {
                  "type": "string",
                  "description": "A reference to the specific commentary on the Pesach Haggadah."
                },
                "summaryText": {
                  "type": "string",
                  "description": "A summary of the commentary's main points or interpretations."
                }
              },
              "required": ["commentaryRef", "summaryText"],
              "additionalProperties": false
            }
          }
        },
        "required": ["question", "commentaries"],
        "additionalProperties": false
      }
    }
  },
  "required": ["ref", "questions"],
  "additionalProperties": false
}


    Example data:

      "ref": "Pesach Haggadah, Kadesh 2",
      "questions": [
        {
          "question": "Why four cups of wine?",
          "commentaries": [
            {
              "commentaryRef": "Simchat HaRegel on Pesach Haggadah, Kadesh 2:1",
              "summaryText": "Chida explores whether the festival Kiddush is a rabbinic or Torah obligation, why we introduce it with 'Savrei', and what it means that Israel was chosen from the nations."
            },
            {
              "commentaryRef": "Maarechet Heidenheim on Pesach Haggadah, Kadesh 2:2",
              "summaryText": "Tevele Bondi gives three reasons for the four cups: Pharaoh's four decrees against Israel, the four promises of redemption in Exodus, and a midrash relating them to four redeemers."
            },
            {
              "commentaryRef": "Marbeh Lesaper on Pesach Haggadah, Kadesh 2:1",
              "summaryText": "Yedidiah Weil cites the Mekhilta that the four cups honor four mitzvot the Israelites kept in Egypt: avoiding unchastity, slander, name changes, and language/clothing changes."
            },
            {
              "commentaryRef": "Divrei Negidim on Pesach Haggadah, Kadesh 2:3",
              "summaryText": "Yehudah Rosenberg explains the cups mystically as representing higher spiritual redemption. He also connects them to the four matriarchs."
            }
          ]
        },
        {
          "question": "What is Shabbat HaGadol?",
          "commentaries": [
            {
              "commentaryRef": "Divrei Negidim on Pesach Haggadah, Kadesh 2:1",
              "summaryText": "Yehudah Rosenberg explains Shabbat HaGadol is named for the 'great day' of future redemption. He also says it spiritually prepares for Pesach, like Shabbat Teshuva before Yom Kippur."
            }
          ]
        },
        {
          "question": "Why wear a kittel at seder?",
          "commentaries": [
            {
              "commentaryRef": "Divrei Negidim on Pesach Haggadah, Kadesh 2:5",
              "summaryText": "Yehudah Rosenberg says wearing a white kittel represents the simple, higher spiritual source of the redemption, like the High Priest's white garments on Yom Kippur."
            }
          ]
        }
      ]
    }

    Todo?
    In the future may want to support broader Refs and included ExpandedRefs field.

    """
    collection = 'guide'
    required_attrs = [
        'ref',  # May be section level, segment level, or ranged segment level.
        'expanded_refs',  # list of segment level refs
        'questions',
    ]

    def __init__(self, attrs=None):
        self.expanded_refs = []
        super(Guide, self).__init__(attrs)

    def _normalize(self):
        self.ref = Ref(self.ref).normal()
        self.set_expanded_refs()

    def set_expanded_refs(self):
        self.expanded_refs = [r.normal() for r in Ref(self.ref).all_segment_refs()]

    def load_by_ref(self, ref):
        return self.load({"ref": ref.normal()})

    def contents(self):
        d = super(Guide, self).contents()
        d["anchorRef"] = d["ref"]
        d["anchorRefExpanded"] = d["expanded_refs"]
        return d

class GuideSet(abst.AbstractMongoSet):
    recordClass = Guide

    @classmethod
    def load_set_for_client(cls, tref):
        try:
            oref = Ref(tref)
        except InputError:
            return []

        segment_refs = [r.normal() for r in oref.all_segment_refs()]

        documents = cls({"expanded_refs": {"$in": segment_refs}}).contents()  # Presuming exact matches of normal refs
        return documents
