from sefaria import model as model
from sefaria.system.exceptions import InputError
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
        from sefaria.texts import get_text
        text             = get_text(linkRef.normal(), context=0, commentary=False)
        com["text"]      = text["text"] if text["text"] else ""
        com["he"]        = text["he"] if text["he"] else ""

    # strip redundant verse ref for commentators
    # if the ref we're looking for appears exactly in the commentary ref, strip redundant info
    #todo: this comparison - ref in linkRef.normal() - seems brittle.  Make it rigorous.
    if com["category"] == "Commentary" and ref in linkRef.normal():
        com["commentator"] = linkRef.index.commentator
        com["heCommentator"] = linkRef.index.heCommentator if getattr(linkRef.index, "heCommentator", None) else com["commentator"]
    else:
        com["commentator"] = linkRef.book
        com["heCommentator"] = linkRef.index.heTitle if getattr(linkRef.index, "heTitle", None) else com["commentator"]

    if getattr(linkRef.index, "heTitle", None):
        com["heTitle"] = linkRef.index.heTitle

    return com


def format_object_for_client(obj, with_text=true, ref=None, pos=None):
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
    com["text"]        = note.text
    com["title"]       = note.title
    com["commentator"] = user_link(note.owner)

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