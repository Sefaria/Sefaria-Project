"""Explicit one-time import into a NEW dedicated dev index; never changes aliases."""
import argparse
import os
from pathlib import Path
import sys
from scripts.lemma_search_transport import validate_target, transport


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--research-root",type=Path,default=Path("/opt/lemma/research"))
    p.add_argument("--url",required=True)
    p.add_argument("--index",required=True)
    p.add_argument("--allowed-host",action="append",required=True)
    args=p.parse_args()
    validate_target(args.url,args.index,args.allowed_host)
    sys.path.insert(0,str(args.research_root/"src"))
    import offline_search
    # Isolated importer process; the local-only CLI's guard is left unchanged.
    offline_search.request=transport(args.url,os.getenv("ELASTIC_USERNAME",""),
                                     os.getenv("ELASTIC_PASSWORD",""),writable=True)
    args.corpus=args.research_root/"datasets/search_tanakh_rashi_mishnah_v1"
    args.lemmas=args.research_root/"datasets/search_lemmas_mishnah_v1"
    args.allow_partial=False
    offline_search.load(args)


if __name__ == "__main__":
    main()
