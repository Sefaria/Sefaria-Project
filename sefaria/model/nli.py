# coding=utf-8
from . import abstract as abst
import logging
logger = logging.getLogger(__name__)


class ManuscriptReference(abst.AbstractMongoRecord):
    """
    Reference to a public NLI manuscript
    """
    collection = 'nli_manuscript_reference'

    required_attrs = [
        "fr_code", # Collection
        "tr_code", # Tractate
        "pe_code", # Chapter or Daf - 3 digit pad
        "mi_code", # Mishnah, Halacha, or Amud - 2 digit pad
        "img_pid", # Img ID for image server
        "ms_code",  # Manuscript Code
        "ms_name_en",
        "ms_name_he"
    ]
    optional_attrs = [
        "ms_desc_en",
        "ms_desc_he"
    ]


class ManuscriptReferenceSet(abst.AbstractMongoSet):
    recordClass = ManuscriptReference
