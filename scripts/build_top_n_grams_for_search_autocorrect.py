"""
Build the search auto-correction phrase table (see sefaria/helper/top_n_grams_for_search_autocorrect.py)
and save it as a datrie file.

Every environment loads the one GCS object --upload replaces, so only the production CronJob
uploads. To try a local build, point TOP_N_GRAMS_TRIE_SOURCE in local_settings at --output.

Usage:
    ./run scripts/build_top_n_grams_for_search_autocorrect.py --output /tmp/top_n_grams.trie
    ./run scripts/build_top_n_grams_for_search_autocorrect.py --min-doc-count 100 20 5 --langs he --output he.trie
    ./run scripts/build_top_n_grams_for_search_autocorrect.py --categories Tanakh Mishnah --output tanakh.trie
    ./run scripts/build_top_n_grams_for_search_autocorrect.py --upload   # production CronJob only
"""
import django
import argparse
import tempfile
django.setup()
from sefaria.helper.top_n_grams_for_search_autocorrect import (
    TRIE_BUCKET, TRIE_BLOB, build_top_n_grams, save_top_n_grams_trie, thresholds_by_length, upload_top_n_grams_trie,
)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--min-doc-count", type=int, nargs="+", default=[100, 20, 5], metavar="N",
                         help="Keep only phrases appearing in more than this many documents (segments). Give one "
                              "value for every phrase length, or one per length (1-word 2-word 3-word) -- longer "
                              "phrases are rarer, so a lower bar suits them. Default: 100 20 5")
    parser.add_argument("--langs", nargs="+", default=["he", "en"], choices=["he", "en"],
                         help="Languages to pull segment text in. Default: he en")
    parser.add_argument("--categories", nargs="+", default=None,
                         help="Restrict to these top-level categories (e.g. Tanakh Mishnah). Default: whole library")
    parser.add_argument("--num-shards", type=int, default=16,
                         help="Split each phrase-length counting pass into this many hash shards to cap RAM "
                              "(more shards = less memory, more time). Default: 16")
    parser.add_argument("--output", default=None,
                         help="Where to save the trie file. Default: a temp file (only useful with --upload)")
    parser.add_argument("--upload", action="store_true",
                         help=f"Upload the trie to gs://{TRIE_BUCKET}/{TRIE_BLOB}, which EVERY environment loads. "
                              "Production CronJob only.")
    args = parser.parse_args()
    try:
        thresholds_by_length(args.min_doc_count)
    except ValueError as e:
        parser.error(str(e))
    if not args.output and not args.upload:
        parser.error("give --output, --upload, or both")

    print(f"Building top-n-grams table (min_doc_count={args.min_doc_count}, langs={args.langs}, "
          f"categories={args.categories or 'ALL'})...")
    top_n_grams = build_top_n_grams(args.min_doc_count, langs=args.langs, categories=args.categories,
                                    num_shards=args.num_shards)
    print(f"{len(top_n_grams)} phrases cleared the threshold.")
    with tempfile.NamedTemporaryFile(suffix=".trie") as tmp:
        path = args.output or tmp.name
        num_phrases = save_top_n_grams_trie(top_n_grams, path)
        del top_n_grams
        print(f"Saved {num_phrases} phrases to {path}")
        if args.upload:
            if num_phrases == 0:
                # Never replace a working table with an empty one (e.g. a build that couldn't
                # read the library); the name service would stop correcting.
                raise SystemExit("Refusing to upload an empty table.")
            upload_top_n_grams_trie(path, num_phrases, args.min_doc_count)
            print(f"Uploaded to gs://{TRIE_BUCKET}/{TRIE_BLOB}")
    print("Done.")
