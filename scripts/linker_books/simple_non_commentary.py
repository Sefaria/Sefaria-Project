from scripts.linker_books.stats import linker_supported_indexes, indexes_with_alt_struct, indexes_with_keyword, get_simple_indexes
from sefaria.model import *
from sefaria.utils.hebrew import is_mostly_hebrew
from tqdm import tqdm
import csv
from sefaria.helper.linker_index_converter import LinkerIndexConverter, ReusableTermManager, LinkerCategoryConverter
from sefaria.model.linker.match_template import MatchTemplate


RTM = ReusableTermManager()


def add_new_terms():
    with open("../../data/private/linker books to convert - New Terms.csv", "r") as fin:
        cin = csv.DictReader(fin)
        for row in cin:
            term = NonUniqueTerm({
                "slug": row['Primary En']
            })
            term.add_primary_titles(row['Primary En'], row['Primary He'])
            for i in range(1, 6):
                alt_title = row.get(f'Alt {i}', '').strip()
                if alt_title:
                    lang = 'he' if is_mostly_hebrew(alt_title) else 'en'
                    term.add_title(alt_title, lang)
            term.save()
            print('----')
            for title in term.get_titles_object():
                print(title)


def add_books():
    with open("../../data/private/linker books to convert - simple non comm.csv", "r") as fin:
        cin = csv.DictReader(fin)
        for row in cin:
            title = row['Title']
            print(title)
            index = library.get_index(title)
            new_addrs = list(filter(lambda x: len(x), row['New Address Types'].split(',')))
            if not row['To Add'].strip() == 'y': continue
            if row['Has One Title Part'].strip() == 'y':
                title_term = RTM.get_or_create_term_for_titled_obj(index.nodes)
                term_slugs = [title_term.slug]
            else:
                term_slugs = list(filter(lambda x: len(x), [row.get(f'Part {i}').strip() for i in range(1, 4)]))

            def get_match_templates(node, depth, isibling, num_siblings, is_alt_node):
                if is_alt_node: return
                return [MatchTemplate(term_slugs)]

            def get_other_fields(node, depth, isibling, num_siblings, is_alt_node):
                if len(new_addrs):
                    assert len(new_addrs) == len(node.addressTypes)
                    return {
                        "addressTypes": new_addrs
                    }

            converter = LinkerIndexConverter(title, get_match_templates=get_match_templates, get_other_fields=get_other_fields)
            converter.convert()


def scan_commentaries():
    indexes = linker_supported_indexes(get_simple_indexes(), reverse=True)
    indexes = indexes_with_alt_struct(indexes, reverse=True)
    indexes = indexes_with_keyword(" on ", indexes, reverse=True)
    rows = []

    for x in tqdm(indexes):
        try:
            row = {
                "Title": x.title,
                "Address Types": ",".join(x.nodes.addressTypes),
            }
        except Exception as e:
            print(e)
            continue

        rows.append(row)
    with open("../../data/private/simple_non_commentary.csv", "w") as fout:
        cout = csv.DictWriter(fout, fieldnames=rows[0].keys())
        cout.writeheader()
        cout.writerows(rows)


if __name__ == '__main__':
    # scan_commentaries()
    # add_new_terms()
    add_books()
