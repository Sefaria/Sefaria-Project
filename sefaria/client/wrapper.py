import re

from sefaria import model as model
from sefaria.system.exceptions import InputError
from sefaria.texts import get_text, grab_section_from_text
from sefaria.utils.users import user_link


def format_link_object_for_client(link, with_text, ref, pos=None):
    """
    :param link: Link object
    :param ref: Ref object of the source of the link
    :param pos: Optional position of the Ref in the Link.  If not passed, it will be derived from the first two arguments.
    :return: Dict
    """
    com = {}

    # The text we're asked to get links to
    anchorRef = model.Ref(link.refs[pos])

    # The link we found to anchorRef
    linkRef = model.Ref(link.refs[(pos + 1) % 2])

    com["_id"]           = str(link._id)
    com["category"]      = linkRef.type
    com["type"]          = link.type
    com["ref"]           = linkRef.tref
    com["anchorRef"]     = anchorRef.normal()
    com["sourceRef"]     = linkRef.normal()
    com["anchorVerse"]   = anchorRef.sections[-1]
    com["commentaryNum"] = linkRef.sections[-1] if linkRef.type == "Commentary" else 0
    com["anchorText"]    = getattr(link, "anchorText", "")

    if with_text:
        #from sefaria.texts import get_text
        #text             = get_text(linkRef.normal(), context=0, commentary=False)
        text             = model.TextFamily(linkRef, context=0, commentary=False)
        #com["text"]      = text["text"] if text["text"] else ""
        #com["he"]        = text["he"] if text["he"] else ""
        com["text"]      = text.text
        com["he"]        = text.he

    # strip redundant verse ref for commentators
    # if the ref we're looking for appears exactly in the commentary ref, strip redundant info
    #todo: this comparison - ref in linkRef.normal() - seems brittle.  Make it rigorous.
    if com["category"] == "Commentary" and ref in linkRef.normal():
        com["commentator"] = linkRef.index.commentator
        com["heCommentator"] = linkRef.index.heCommentator if getattr(linkRef.index, "heCommentator", None) else com["commentator"]
    else:
        com["commentator"] = linkRef.book
        com["heCommentator"] = linkRef.index_node.primary_title("he") if linkRef.index_node.primary_title("he") else com["commentator"]

    if linkRef.index_node.primary_title("he"):
        com["heTitle"] = linkRef.index_node.primary_title("he")

    return com


def format_object_for_client(obj, with_text=True, ref=None, pos=None):
    """
    Assumption here is that if obj is a Link, and ref and pos are not specified, then position 0 is the root ref.
    :param obj:
    :param ref:
    :param pos:
    :return:
    """
    if isinstance(obj, model.Note):
        return format_note_object_for_client(obj)
    elif isinstance(obj, model.Link):
        if not ref and not pos:
            ref = obj.refs[0]
            pos = 0
        return format_link_object_for_client(obj, with_text, ref, pos)
    else:
        raise InputError("{} not valid for format_object_for_client".format(obj.__class__.__name__))


def format_note_object_for_client(note):
    """
    Returns an object that represents note in the format expected by the reader client,
    matching the format of links, which are currently handled together.
    """
    com = {}
    anchor_oref = model.Ref(note.ref).padded_ref()

    com["category"]    = "Notes"
    com["type"]        = "note"
    com["owner"]       = note.owner
    com["_id"]         = str(note._id)
    com["anchorRef"]   = note.ref
    com["anchorVerse"] = anchor_oref.sections[-1]
    com["anchorText"]  = getattr(note, "anchorText", "")
    com["public"]      = getattr(note, "public", False)
    com["commentator"] = user_link(note.owner)
    com["text"]        = note.text
    com["title"]       = note.title
#    com["text"]        = note.title + " - " + note.text if getattr(note, "title", None) else note.text

    return com


#this previously had signature: get_notes(tref, public=True, uid=None, pad=True, context=0)
#but all usages used: get_notes(tref, uid=request.user.id, context=1)
def get_notes(oref, public=True, uid=None, context=1):
    """
    Returns a list of notes related to ref.
    If public, include any public note.
    If uid is set, return private notes of uid.
    """
    notes = []

    noteset = oref.padded_ref().context_ref(context).noteset(public, uid)

    for note in noteset:
        com = format_note_object_for_client(note)
        notes.append(com)

    return notes


def get_links(tref, with_text=True):
    """
    Return a list of links tied to 'ref' in client format.
    If with_text, retrieve texts for each link.
    """
    links = []
    oref = model.Ref(tref)
    nRef = oref.normal()
    reRef = oref.regex()

    # for storing all the section level texts that need to be looked up
    texts = {}

    linkset = model.LinkSet({"refs": {"$regex": reRef}})
    # For all links that mention ref (in any position)
    for link in linkset:
        # each link contins 2 refs in a list
        # find the position (0 or 1) of "anchor", the one we're getting links for
        pos = 0 if re.match(reRef, link.refs[0]) else 1
        try:
            com = format_link_object_for_client(link, False, nRef, pos)
        except InputError:
            # logger.warning("Bad link: {} - {}".format(link.refs[0], link.refs[1]))
            continue

        # Rather than getting text with each link, walk through all links here,
        # caching text so that redudant DB calls can be minimized
        if with_text:
            com_oref = model.Ref(com["ref"])
            top_oref = com_oref.top_section_ref()
            top_nref = top_oref.normal()

            # Lookup and save top level text, only if we haven't already
            if top_nref not in texts:
                #texts[top_nref] = get_text(top_nref, context=0, commentary=False, pad=False)
                texts[top_nref] = model.TextFamily(top_oref, context=0, commentary=False, pad=False).contents()

            sections, toSections = com_oref.sections[1:], com_oref.toSections[1:]
            com["text"] = grab_section_from_text(sections, texts[top_nref]["text"], toSections)
            com["he"]   = grab_section_from_text(sections, texts[top_nref]["he"],   toSections)

        links.append(com)

    return links