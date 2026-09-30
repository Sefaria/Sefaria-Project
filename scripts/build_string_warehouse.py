"""
Build the string warehouse used for search-query auto-correction (sc-47189).

Walks every segment in the library (optionally scoped to one or more categories), counts
how many distinct segments ("documents") each normalized word appears in, keeps only the
words that clear --min-doc-count, and writes the result to Mongo (db.string_warehouse).
`library` (the Library singleton, sefaria/model/text.py) loads that collection at startup
and uses it to auto-correct search queries -- see sefaria/helper/string_warehouse.py and
reader/views.py:search_wrapper_api.

Run on a schedule by the `build-string-warehouse` CronJob
(helm-chart/sefaria/templates/cronjob/build-string-warehouse.yaml); can also be run by hand:

Usage:
    ./run build_string_warehouse.py
    ./run build_string_warehouse.py --min-doc-count 5 --langs he
    ./run build_string_warehouse.py --categories Tanakh Mishnah
"""
import django
import argparse
django.setup()
from sefaria.helper.string_warehouse import build_warehouse, save_warehouse


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--min-doc-count", type=int, default=3,
                         help="Keep only words appearing in more than this many documents (segments). Default: 3")
    parser.add_argument("--langs", nargs="+", default=["he", "en"], choices=["he", "en"],
                         help="Languages to pull segment text in. Default: he en")
    parser.add_argument("--categories", nargs="+", default=None,
                         help="Restrict to these top-level categories (e.g. Tanakh Mishnah). Default: whole library")
    args = parser.parse_args()

    print(f"Building string warehouse (min_doc_count={args.min_doc_count}, langs={args.langs}, "
          f"categories={args.categories or 'ALL'})...")
    warehouse = build_warehouse(args.min_doc_count, langs=args.langs, categories=args.categories)
    print(f"{len(warehouse)} words cleared the threshold. Writing to Mongo (db.string_warehouse)")
    save_warehouse(warehouse, args.min_doc_count)
    print("Done.")
