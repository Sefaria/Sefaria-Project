#encoding=utf-8
from sefaria.model import *
from sefaria.helper.schema import *
en_chapters = ["INTRODUCTION",
                "CHAPTER I The Mystery of the Creation of the World",

                "CHAPTER II The Pillars Of The Service Of God And Its Motivation",

                "CHAPTER III Concerning Faith and Matters Involved In The Mysteries Of The Creator Blessed Be He",

                "CHAPTER IV Service Briefly Discussed",

                "CHAPTER V Concerning The Pillars Of Worship",

                "CHAPTER VI An Explanation Of The Things Which Help In The Worship Of God May He Be Extolled And The Things Which Hinder",

                "CHAPTER VII Concerning Repentance And All Matters Pertaining To It From The Order Of Prayer And The Matters Of Self Restraint",

                "CHAPTER VIII Matters Concerning The Knowledge Of The Creator Blessed Be He",

                "CHAPTER IX Concerning The Signs Of The Will Of The Creator And How A Man Can Know He Has Found Favor In The Eyes Of His God And If God Has Accepted His Deeds",

                "CHAPTER X Concerning Repentance",

                "CHAPTER XI Concerning The Virtues Of The Righteous",

                "CHAPTER XII Concerning The Mysteries Of The World To Come",

                "CHAPTER XIII Concerning Service to God",

                "CHAPTER XIV Concerning The Reckoning A Man Must Make With Himself",

                "CHAPTER XV Explaining The Time Which Is Most Proper For The Service Of God Blessed Be He",

                "CHAPTER XVI I shall note in this chapter some of the delights of the world to come and as opposed to them I will note the plagues the stumbling blocks and the evil of this world",

                "CHAPTER XVII When A Man Remembers The Day Of Death",

                "CHAPTER XVIII Concerning The Difference Between The Righteous Man And The Wicked One",

                "TRANSLATORS FOREWORD",

                "Addendum I THE ETHICAL WORK SEFER HAYASHAR AND THE PHILOSOPHICAL VIEWS CONTAINED THEREIN",

                "Addendum II THE LOVE AND THE FEAR OF GOD IN THE SEFER HAYASHAR"]

def add_default_node_and_addendums():
    index = library.get_index("Sefer HaYashar")
    root = index.nodes

    node_titles = [node.get_titles("en") for node in root.children]
    if [] in node_titles:
        print("Already has default")
    else:
        default = JaggedArrayNode()
        default.key = "default"
        default.default = True
        default.add_structure(["Chapter", "Paragraph"])

        attach_branch(default, root, 1)

    if "Addendum I" in node_titles:
        print("Already has addendum")
    else:
        node = JaggedArrayNode()
        node.add_structure(["Paragraph"])
        node.add_primary_titles("Addendum I", "נספח א")
        attach_branch(node, root, -1)

        node = JaggedArrayNode()
        node.add_structure(["Paragraph"])
        node.add_primary_titles("Addendum II", "נספח ב")
        attach_branch(node, root, -1)

def remove_chapter_nodes():
    index = library.get_index("Sefer HaYashar")
    root = index.nodes
    old_nodes = []

    for node in root.children:
        if getattr(node, "default", False):
            continue
        title = node.get_titles("en")[0]
        if "CHAPTER" in title:
            old_nodes.append((node.get_titles('en')[0], node.get_titles('he')[0]))
            remove_branch(node)
        elif "Addendum" in title:
            old_title = node.get_titles('en')[0]
            if len(old_title.split(" ")) >= 3:
                remove_branch(node)
        elif "Footnotes" in title:
            remove_branch(node)
    return old_nodes


def rewriter(ref):
    ref = Ref(ref)
    if ref.is_range():
        start = ref.starting_ref().normal()
        end = ref.ending_ref().normal()
        if start in segment_map and end in segment_map:
            return Ref(segment_map[start]).to(Ref(segment_map[end])).normal()
        elif start in segment_map:
            return segment_map[start]
        elif end in segment_map:
            return segment_map[end]
        else:
            return ref.normal()
    elif ref.normal() not in segment_map:
        return ref.normal()
    else:
        return segment_map[ref.normal()]


def needs_rewrite(str, *kwargs):
    try:
        needsRewrite = str.startswith("Sefer HaYashar, CHAPTER") or str.startswith("Sefer HaYashar, Addendum I")
        if needsRewrite:
            print("NEEDS REWRITER: {}".format(str))
        return needsRewrite
    except InputError as e:
        print("Problem with {}".format(str))
        print(e.message)


def add_alt_struct(old_nodes):
    nodes = []
    for count, titles_tuple in enumerate(old_nodes):
        en, he = titles_tuple
        node = ArrayMapNode()
        node.add_primary_titles(en, he)
        node.depth = 0
        node.wholeRef = "Sefer HaYashar {}".format(count+1)
        node.refs = []
        nodes.append(node.serialize())
    index = library.get_index("Sefer HaYashar")
    contents = index.contents(v2=True, raw=True)
    contents['alt_structs'] = {}
    contents['alt_structs']["Chapter"] = {"nodes": nodes}
    index.load_from_dict(contents).save()


def get_mapping():
    mapping = {}
    for i, ch in enumerate(en_chapters):
        ch = "Sefer HaYashar, {}".format(ch)
        if ch.startswith("Sefer HaYashar, CHAPTER "):
            mapping[ch] = "Sefer HaYashar {}".format(i)
        else:
            if "Addendum" in ch:
                new_ch = " ".join(ch.split(" ")[0:4])
            else:
                new_ch = ch
            mapping[ch] = new_ch

    return mapping


if __name__ == "__main__":
    title = "Sefer HaYashar"
    add_default_node_and_addendums()

    #cascade links, sheets, and history from old structure based on chapters to new structure based on default node
    mapping = get_mapping()
    segment_map = generate_segment_mapping(title, mapping, mapped_title=lambda x: x)
    cascade(title, rewriter, needs_rewrite)

    #remove chapter nodes from main structure and create alt struct with the chapters
    old_nodes = remove_chapter_nodes()
    add_alt_struct(old_nodes)

    #change node titles
    index = library.get_index(title)
    change_node_title(index.nodes.children[0], "INTRODUCTION", "en", "Introduction")
    change_node_title(index.nodes.children[2], "TRANSLATORS FOREWORD", "en", "Translator's Foreword")

    #still may need to remove data for Footnotes node
    ftnote_links = LinkSet({"refs": {"$regex": "^Sefer HaYashar, Footnotes"}})
    print("Removing {} 'Sefer HaYashar, Footnotes' links".format(ftnote_links.count()))
    ftnote_links.delete()

    ftnote_history = HistorySet({"ref": {"$regex": "^Sefer HaYashar, Footnotes"}})
    print("Removing {} 'Sefer HaYashar, Footnotes' history".format(ftnote_history.count()))
    ftnote_history.delete()