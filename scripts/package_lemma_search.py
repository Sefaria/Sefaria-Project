"""Create a local Docker build context with frozen research artifacts; never upload."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil


def sha(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda:f.read(1024*1024),b""): h.update(block)
    return h.hexdigest()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--research-root",type=Path,required=True)
    p.add_argument("--output",type=Path,required=True)
    args=p.parse_args()
    src=args.research_root.resolve();out=args.output.resolve()
    project=Path(__file__).resolve().parents[1]
    out.mkdir(parents=True,exist_ok=False)
    def copy(source,target):
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,target)
    for path in (src/"src").glob("*.py"): copy(path,out/"research/src"/path.name)
    copy(src/"configs/model-installation.json",out/"research/configs/model-installation.json")
    for directory,names in {
        "search_lemmas_mishnah_v1":["lemmas.jsonl","manifest.json"],
        "search_tanakh_rashi_mishnah_v1":["documents.jsonl","manifest.json"],
    }.items():
        for name in names: copy(src/"datasets"/directory/name,out/"research/datasets"/directory/name)
    install=json.loads((src/"configs/model-installation.json").read_text())
    for name,info in install["downloaded_files"].items():
        if name.startswith("shoshan/"):
            source=src/"models"/name
            if sha(source)!=info["sha256"]: raise ValueError("Model changed: "+name)
            copy(source,out/"research/models"/name)
    for name in ["lemma_search_worker.py","lemma_search_transport.py","lemma_search_celery.py","import_lemma_search_index.py"]:
        copy(project/"scripts"/name,out/"scripts"/name)
    copy(project/"sefaria/celery_setup/generate_config.py",out/"sefaria/celery_setup/generate_config.py")
    for name in ["Dockerfile","requirements.txt"]: copy(project/"build/lemma-search"/name,out/name)
    manifest={str(f.relative_to(out)):sha(f) for f in sorted(out.rglob("*")) if f.is_file()}
    (out/"bundle-manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    print(json.dumps({"output":str(out),"files":len(manifest),"bytes":sum(f.stat().st_size for f in out.rglob('*') if f.is_file())}))


if __name__ == "__main__": main()
