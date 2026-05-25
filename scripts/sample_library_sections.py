"""
Sample Hebrew section-level refs from the library and upload the resulting JSON to GCS.

The sampler:
- uniformly samples eligible sections via reservoir sampling
- excludes sheet/dictionary/reference works
- groups dependent texts one structural level higher by dropping the final address component
- keeps only sections whose sampled Hebrew version has non-empty text for every included segment
- writes the JSON locally and uploads it to `custom_embeddings/<output filename>` in GCS

Examples:
    python scripts/sample_library_sections.py 10
    python scripts/sample_library_sections.py 100 --seed 613
    python scripts/sample_library_sections.py 100 --output scripts/output/my_sample.json
    python scripts/sample_library_sections.py 100 --bucket development-research
"""

import argparse
import json
import random
from collections import OrderedDict, defaultdict
from pathlib import Path

import django

django.setup()

from google.cloud.exceptions import GoogleCloudError
from sefaria.google_storage_manager import GoogleStorageManager
from sefaria.model import Ref, VersionSet, library
from tqdm import tqdm


DEFAULT_BUCKET = "development-research"
DEFAULT_OUTPUT = Path("scripts/output/sampled_library_sections.json")
EXCLUDED_CATEGORIES = {"Sheets", "Dictionary", "Reference"}
BUCKET_PREFIX = "custom_embeddings"
LANGUAGE = "he"


def build_sefaria_url(oref):
    return f"https://www.sefaria.org/{oref.url()}"


def is_supported_index(index):
    categories = set(index.categories or [])
    return categories.isdisjoint(EXCLUDED_CATEGORIES)


def parent_section_ref(oref):
    if len(oref.sections) <= 1:
        return oref
    d = oref._core_dict()
    d["sections"] = d["sections"][:-1]
    d["toSections"] = d["toSections"][:-1]
    return Ref(_obj=d)


def normalize_sample_ref(section_ref):
    if section_ref.is_dependant() and len(section_ref.sections) > 1:
        return parent_section_ref(section_ref)
    return section_ref


def build_hebrew_version_map(indexes):
    titles = [index.title for index in indexes]
    versions_by_title = defaultdict(list)
    version_set = VersionSet({"title": {"$in": titles}, "language": "he"})
    for version in tqdm(version_set, desc="Loading Hebrew versions"):
        versions_by_title[version.title].append(version)
    return versions_by_title


def iter_section_payloads_for_index(index, versions_by_title):
    versions = versions_by_title.get(index.title, [])
    if not versions:
        return
    version = versions[0]

    grouped_segments = OrderedDict()
    empty_segment_refs = set()

    def action(segment_text, en_tref, he_tref, _version):
        segment_ref = Ref(en_tref)
        section_ref = normalize_sample_ref(segment_ref.section_ref())
        section_key = section_ref.normal()
        section_bucket = grouped_segments.setdefault(
            section_key,
            {
                "ref_obj": section_ref,
                "segments": OrderedDict(),
            },
        )

        normalized_text = segment_text.strip()
        if not normalized_text:
            empty_segment_refs.add(section_key)
        section_bucket["segments"][segment_ref.normal()] = normalized_text

    try:
        version.walk_thru_contents(action)
    except Exception as exc:
        print(f"Skipping index={index.title!r}: failed to walk Hebrew version {version.versionTitle!r}: {exc}")
        return

    for section_key, grouped_section in grouped_segments.items():
        if section_key in empty_segment_refs or len(grouped_section["segments"]) == 0:
            continue
        section_ref = grouped_section["ref_obj"]
        yield {
            "ref": section_ref.normal(),
            "url": build_sefaria_url(section_ref),
            "versionTitle": version.versionTitle,
            "language": LANGUAGE,
            "segments": dict(grouped_section["segments"]),
        }


def iter_section_payloads(indexes, versions_by_title):
    for index in tqdm(indexes, desc="Scanning indexes"):
        yield from iter_section_payloads_for_index(index, versions_by_title)


def sample_section_payloads(sample_size, seed=None):
    if sample_size <= 0:
        raise ValueError("sample_size must be positive")

    rng = random.Random(seed)
    reservoir = []
    total_seen = 0

    indexes = [index for index in library.all_index_records() if is_supported_index(index)]
    versions_by_title = build_hebrew_version_map(indexes)

    for payload in iter_section_payloads(indexes, versions_by_title):
        total_seen += 1
        if len(reservoir) < sample_size:
            reservoir.append(payload)
            continue

        replacement_index = rng.randrange(total_seen)
        if replacement_index < sample_size:
            reservoir[replacement_index] = payload

    if total_seen == 0:
        raise ValueError("No eligible Hebrew section refs were found in the library.")
    if total_seen < sample_size:
        raise ValueError(
            f"Requested {sample_size} section refs, but only found {total_seen} eligible Hebrew sections."
        )

    return reservoir, total_seen


def write_json(section_payloads, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w") as fout:
        json.dump(section_payloads, fout, ensure_ascii=False, indent=2)


def build_bucket_filename(output_path):
    return f"{BUCKET_PREFIX}/{output_path.name}"


def upload_output(output_path, bucket_name):
    bucket_filename = build_bucket_filename(output_path)
    return GoogleStorageManager.upload_file(str(output_path), bucket_filename, bucket_name)


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Uniformly sample section-level refs from one selected Hebrew version per index, "
            "write JSON containing per-segment Hebrew text, and upload the JSON to GCS under "
            f"{BUCKET_PREFIX}/<filename>."
        )
    )
    parser.add_argument("n", type=int, help="Number of section refs to sample.")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"JSON output path. Default: {DEFAULT_OUTPUT}",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Optional random seed for reproducible sampling.",
    )
    parser.add_argument(
        "--bucket",
        default=DEFAULT_BUCKET,
        help=f"GCS bucket for the uploaded JSON artifact. Default: {DEFAULT_BUCKET}",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    sampled_payloads, total_sections = sample_section_payloads(args.n, seed=args.seed)
    write_json(sampled_payloads, args.output)
    try:
        uploaded_url = upload_output(args.output, args.bucket)
    except GoogleCloudError as exc:
        raise RuntimeError(f"Failed to upload {args.output} to bucket {args.bucket}: {exc}") from exc
    print(
        f"Sampled {len(sampled_payloads)} Hebrew section refs uniformly from {total_sections} eligible sections. "
        f"Wrote JSON to {args.output} and uploaded it to {uploaded_url}."
    )


if __name__ == "__main__":
    main()
