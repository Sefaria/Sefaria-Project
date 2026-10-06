"""
Build the top-n-grams table used for search-query auto-correction (sc-47189).

Walks every segment in the library (optionally scoped to one or more categories), counts
how many distinct segments ("documents") each normalized phrase appears in, keeps only the
phrases that clear --min-doc-count, and writes the result to Mongo
(db.top_n_grams_for_search_autocorrect). `library` (the Library singleton,
sefaria/model/text.py) loads that collection at startup and uses it to auto-correct search
queries -- see sefaria/helper/top_n_grams_for_search_autocorrect.py and
reader/views.py:search_wrapper_api.

Run on a schedule by the `build-top-n-grams-for-search-autocorrect` CronJob
(helm-chart/sefaria/templates/cronjob/build-top-n-grams-for-search-autocorrect.yaml); can
also be run by hand:

Usage:
    ./run build_top_n_grams_for_search_autocorrect.py
    ./run build_top_n_grams_for_search_autocorrect.py --min-doc-count 5 --langs he
    ./run build_top_n_grams_for_search_autocorrect.py --categories Tanakh Mishnah
"""
import django
import argparse
django.setup()
from sefaria.helper.top_n_grams_for_search_autocorrect import build_top_n_grams, save_top_n_grams


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--min-doc-count", type=int, default=3,
                         help="Keep only phrases appearing in more than this many documents (segments). Default: 3")
    parser.add_argument("--langs", nargs="+", default=["he", "en"], choices=["he", "en"],
                         help="Languages to pull segment text in. Default: he en")
    parser.add_argument("--categories", nargs="+", default=None,
                         help="Restrict to these top-level categories (e.g. Tanakh Mishnah). Default: whole library")
    args = parser.parse_args()

    print(f"Building top-n-grams table (min_doc_count={args.min_doc_count}, langs={args.langs}, "
          f"categories={args.categories or 'ALL'})...")
    top_n_grams = build_top_n_grams(args.min_doc_count, langs=args.langs, categories=args.categories)
    print(f"{len(top_n_grams)} phrases cleared the threshold. Writing to Mongo (db.top_n_grams_for_search_autocorrect)")
    save_top_n_grams(top_n_grams, args.min_doc_count)
    print("Done.")
