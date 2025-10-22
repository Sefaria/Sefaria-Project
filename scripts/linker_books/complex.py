import django
django.setup()
from sefaria.model import *
from scripts.linker_books.stats import linker_supported_indexes, indexes_with_alt_struct, indexes_with_keyword, get_simple_indexes
from sefaria.helper.schema import merge_default_into_parent
from sefaria.utils.hebrew import is_mostly_hebrew
from sefaria.model.linker.match_template import MatchTemplate
from tqdm import tqdm
from sefaria.helper.linker_index_converter import LinkerIndexConverter, ReusableTermManager, LinkerCategoryConverter
import re
import csv


RTM = ReusableTermManager()


def modify_small_complex():
    with open("linker books to convert - small_complex_parts.csv") as fin:
        cin = csv.DictReader(fin)
        for row in tqdm(list(cin)):
            title = row['Title']
            print(title)
            parts = []
            for i in range(1, 4):
                part = row.get(f"Part {i}", "").strip()
                if not part: continue
                if part[0].isupper():
                    # looks like a title
                    term_set = NonUniqueTermSet({"titles.text": part})
                    if len(term_set) == 1:
                        parts.append(term_set.array()[0].slug)
                    else:
                        print(f"Could not find term for part '{part}' in title '{title}'")
                else:
                    parts.append(part)

            def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
                nonlocal row
                if is_alt_node: return
                if node.is_root():
                    return [MatchTemplate(parts)]
                elif not node.is_default():
                    term_slug = row.get("Non-Default Node Part", "").strip()
                    if not term_slug:
                        term = RTM.get_or_create_term_for_titled_obj(node)
                        term_slug = term.slug
                    return [MatchTemplate([term_slug])]

            converter = LinkerIndexConverter(title, get_match_templates=get_match_templates)
            converter.convert()


def import_new_terms():
    """
    Ignore duplicate titles
    Ignore empty cells
    First Hebrew title is the primary hebrew title
    @return:
    """
    with open("linker books to convert - small_complex_terms.csv", "r") as fin:
        cin = csv.DictReader(fin)
        for row in tqdm(list(cin)):
            primary_english = row['Primary English'].strip()
            term = NonUniqueTerm({"slug": primary_english })
            term.add_title(primary_english, "en", primary=True)
            found_primary_hebrew = False
            for i in range(1, 25):
                alt = row.get(f"Alt {i}", "").strip()
                if alt:
                    lang = "he" if is_mostly_hebrew(alt) else "en"
                    if lang == "he" and not found_primary_hebrew:
                        term.add_title(alt, lang, primary=True)
                        found_primary_hebrew = True
                    else:
                        term.add_title(alt, lang, primary=False)
            term.save()
            assert found_primary_hebrew, f"No Hebrew title for {primary_english}"
            print(f"Saved new term '{primary_english}'")


def export_new_terms():
    new_term_rows = []
    seen = set()
    with open("../../data/private/linker books to convert - Sheet10.csv", "r") as fin:
        cin = csv.DictReader(fin)
        for row in tqdm(list(cin)):
            index = library.get_index(row['Title'])
            for i in range(1, 4):
                part = row.get(f"Part {i}", "").strip()
                if part in seen: continue
                seen.add(part)
                if part and part != "N/A" and part[0].isupper():
                    row = {"Primary English": part}
                    for j, title in enumerate(index.nodes.title_group.titles):
                        row[f"Alt {j+1}"] = title['text']
                    new_term_rows.append(row)
    with open("../../data/private/small_complex_terms.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=["Primary English"] + [f"Alt {i+1}" for i in range(25)])
        cout.writeheader()
        cout.writerows(new_term_rows)


def merge_default_nodes():
    with open("linker books to convert - small_complex.csv", "r") as fin:
        cin = csv.DictReader(fin)
        for row in tqdm(list(cin)):
            title = row['Title']
            index = library.get_index(title)
            total_nodes = 0
            def traverse_callback(node):
                nonlocal total_nodes
                total_nodes += 1
            index.nodes.traverse_tree(traverse_callback)
            if total_nodes == 2:
                print(f"Merging default node for {title}")
                merge_default_into_parent(index.nodes)


def guess_part_slug(part):
    term_set = NonUniqueTermSet({"titles.text": part.strip()})
    if len(term_set) == 1:
        return term_set.array()[0].slug
    elif part in ("Introduction", "Petichta"):
        return "introduction"
    elif re.match(r'Mishnah .+, Introduction', part):
        return "introduction"

    return None


def simple_complex():
    """
    Auto-detect terms
    - Add "Sefer"
    - Break up "on"
    - Teshuvot

    3-node indexes
    - check that first node is "Introduction". Tos. Yom Tov is special case
    - ignore English Explanation
    @return:
    """
    out_rows = []
    max_parts = 0
    with open("../../data/private/linker books to convert - small_complex.csv", "r") as fin:
        cin = csv.DictReader(fin)
        for row in cin:
            title = row['Title']
            print(title)
            index = library.get_index(title)
            potential_parts = []
            for start_text in (("Sefer", "sefer"), ("Teshuvot", "teshuvot")):
                if title.startswith(start_text[0]):
                    potential_parts.append(start_text[1])
                    title = title[len(start_text[0]):]
            special_parts = []
            for match, slug in (("on Mishnah ", "mishnah"), ("on Tosefta ", "tosefta"), ("on Jerusalem Talmud ", "yerushalmi")):
                if match in title:
                    special_parts.append(slug)
                    replacer = match.replace("on ", "")
                    title = title.replace(replacer, "")
            title_broken = title.split(" on ")
            for part in title_broken:
                term_slug = guess_part_slug(part)
                if term_slug:
                    potential_parts.append(term_slug)
                else:
                    potential_parts.append(part)
            # insert special parts after the first part
            if special_parts:
                potential_parts = potential_parts[:1] + special_parts + potential_parts[1:]
            out_row = {"Title": row['Title']}
            if len(potential_parts) > max_parts:
                max_parts = len(potential_parts)
            for i, part in enumerate(potential_parts):
                out_row[f"Part {i+1}"] = part
            if len(index.nodes.children) == 2:
                for node in index.nodes.children:
                    if node.is_default(): continue
                    node_title = node.get_primary_title('en')
                    out_row["Non-Default Node Title"] = node_title
                    node_slug = guess_part_slug(node_title)
                    if node_slug:
                        out_row["Non-Default Node Part"] = node_slug
            out_rows.append(out_row)
    with open("../../data/private/simple_complex_out.csv", "w") as fout:
        fieldnames = ["Title"] + [f"Part {i+1}" for i in range(max_parts)] + ["Non-Default Node Title", "Non-Default Node Part"]
        cout = csv.DictWriter(fout, fieldnames=fieldnames)
        cout.writeheader()
        cout.writerows(out_rows)


def scan_commentaries():
    indexes = linker_supported_indexes(get_simple_indexes(reverse=True), reverse=True)
    # indexes = indexes_with_alt_struct(indexes, reverse=True)
    # indexes = indexes_with_keyword(" on ", indexes, reverse=True)
    rows = []
    node2rows = []
    hardcomplex = []

    for x in tqdm(indexes):
        try:
            total_nodes = 0
            def traverse_callback(node):
                nonlocal total_nodes
                total_nodes += 1
            x.nodes.traverse_tree(traverse_callback)
            simple_has_default = total_nodes == 3 and x.nodes.has_default_child()
            row = {
                "Title": x.title,
                "Description": getattr(x, "enDesc", ""),
                "Short Description": getattr(x, "enShortDesc", ""),
                "Category": x.categories[0] if x.categories else "",
                "Num Nodes": total_nodes,
                "Simple Has Default": simple_has_default,
            }
            # print(x.title)
        except Exception as e:
            print(e)
            continue

        rows.append(row)
        if (total_nodes == 2 or (total_nodes == 3 and simple_has_default)) and row["Category"] != "Reference":
            default_node = x.nodes.get_default_child()
            assert default_node is not None
            row["Address Types"] = ",".join(default_node.addressTypes)
            node2rows.append(row)
        else:
            hardcomplex.append(row)
    with open("../../data/private/complex.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=rows[0].keys())
        cout.writeheader()
        cout.writerows(rows)

    with open("../../data/private/complex_2_and_3_nodes.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=node2rows[0].keys())
        cout.writeheader()
        cout.writerows(node2rows)

    with open("../../data/private/hard_complex.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=hardcomplex[0].keys() + ["Address Types"])
        cout.writeheader()
        cout.writerows(node2rows)

if __name__ == '__main__':
    scan_commentaries()
    # simple_complex()
    # merge_default_nodes()
    # export_new_terms()
    # import_new_terms()
    # modify_small_complex()
