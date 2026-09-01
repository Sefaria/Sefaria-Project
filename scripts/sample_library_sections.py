"""
Sample Hebrew section-level refs from the library and upload the resulting JSON to GCS.

The sampler:
- uniformly samples eligible sections via reservoir sampling
- can collect all eligible sections with `--all`
- excludes sheet/dictionary/reference works
- keeps only sections whose sampled Hebrew version has non-empty text for every included segment
- writes the JSON locally and uploads it to `custom_embeddings/<output filename>` in GCS

Examples:
    python scripts/sample_library_sections.py 10
    python scripts/sample_library_sections.py --all
    python scripts/sample_library_sections.py 100 --seed 613
    python scripts/sample_library_sections.py 100 --output scripts/output/my_sample.json
    python scripts/sample_library_sections.py 100 --bucket development-research
"""

import argparse
import json
import random
from collections import OrderedDict
from functools import lru_cache
from pathlib import Path

import django

django.setup()

from google.cloud.exceptions import GoogleCloudError
from sefaria.google_storage_manager import GoogleStorageManager
from sefaria.datatype.jagged_array import JaggedTextArray
from sefaria.model import LinkSet, Ref, TextChunk, VersionSet, library
from tqdm import tqdm


DEFAULT_BUCKET = "development-research"
DEFAULT_OUTPUT = Path("scripts/output/sampled_library_sections.json")
EXCLUDED_CATEGORIES = {"Sheets", "Dictionary", "Reference"}
BLOB_PREFIX = "custom_embeddings"
LANGUAGE = "he"


def build_sefaria_url(oref):
    return f"https://www.sefaria.org/{oref.url()}"


def flatten_text(text_value):
    if isinstance(text_value, str):
        return text_value.strip()
    return JaggedTextArray(text_value).flatten_to_string().strip()


@lru_cache(maxsize=20000)
def get_hebrew_text_for_tref(tref):
    try:
        oref = Ref(tref)
        return flatten_text(TextChunk(oref, lang=LANGUAGE).text)
    except Exception as exc:
        print(f"Could not load Hebrew base text for {tref!r}: {exc}")
        return ""


@lru_cache(maxsize=20000)
def get_verified_base_text_mapping(commentary_segment_ref):
    commentary_segment_ref = Ref(commentary_segment_ref)
    if not commentary_segment_ref.is_commentary():
        return None

    base_text_titles = set(getattr(commentary_segment_ref.index, "base_text_titles", []) or [])
    if not base_text_titles:
        return None

    for link in LinkSet(commentary_segment_ref):
        if link.type != "commentary":
            continue
        base_ref = link.ref_opposite(commentary_segment_ref)
        if base_ref is None or base_ref.index.title not in base_text_titles:
            continue
        return {
            "ref": base_ref.normal(),
            "url": build_sefaria_url(base_ref),
            "indexTitle": base_ref.index.title,
            "text": get_hebrew_text_for_tref(base_ref.normal()),
        }

    return None


def build_base_text_mappings(segment_trefs):
    mappings = OrderedDict()
    for segment_tref in segment_trefs:
        mapping = get_verified_base_text_mapping(segment_tref)
        if mapping is not None:
            mappings[segment_tref] = mapping
    return mappings


def add_base_text_mappings(section_payload):
    base_text_mappings = build_base_text_mappings(section_payload["segments"].keys())
    if base_text_mappings:
        section_payload["baseTextMappings"] = dict(base_text_mappings)
    return section_payload


def is_supported_index(index):
    categories = set(index.categories or [])
    return categories.isdisjoint(EXCLUDED_CATEGORIES)

def build_hebrew_version_map(indexes):
    titles = [index.title for index in indexes]
    version_by_title = {}
    version_set = VersionSet({"title": {"$in": titles}, "language": "he"})
    for version in tqdm(version_set, desc="Loading Hebrew versions"):
        version_by_title.setdefault(version.title, version)
    return version_by_title


def iter_section_payloads_for_title(index_title, version):
    if version is None:
        return

    grouped_segments = OrderedDict()
    partially_empty_sections = set()

    def action(segment_text, en_tref, he_tref, _version):
        segment_ref = Ref(en_tref)
        section_ref = segment_ref.section_ref()
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
            partially_empty_sections.add(section_key)
        section_bucket["segments"][segment_ref.normal()] = normalized_text

    try:
        version.walk_thru_contents(action)
    except Exception as exc:
        print(f"Skipping title={index_title!r}: failed to walk Hebrew version {version.versionTitle!r}: {exc}")
        return

    for section_key, grouped_section in grouped_segments.items():
        if section_key in partially_empty_sections or len(grouped_section["segments"]) == 0:
            continue
        section_ref = grouped_section["ref_obj"]
        yield {
            "ref": section_ref.normal(),
            "url": build_sefaria_url(section_ref),
            "versionTitle": version.versionTitle,
            "language": LANGUAGE,
            "segments": dict(grouped_section["segments"]),
        }


def iter_section_payloads(indexes, version_by_title):
    for index in tqdm(indexes, desc="Scanning indexes"):
        yield from iter_section_payloads_for_title(index.title, version_by_title.get(index.title))


def get_supported_indexes_and_versions():
    indexes = [index for index in library.all_index_records() if is_supported_index(index)]
    return indexes, build_hebrew_version_map(indexes)


def add_base_text_mappings_to_payloads(section_payloads):
    for payload in tqdm(section_payloads, desc="Loading base text mappings"):
        add_base_text_mappings(payload)


def collect_all_section_payloads():
    indexes, version_by_title = get_supported_indexes_and_versions()
    payloads = list(iter_section_payloads(indexes, version_by_title))

    if not payloads:
        raise ValueError("No eligible Hebrew section refs were found in the library.")

    add_base_text_mappings_to_payloads(payloads)
    return payloads, len(payloads)


def sample_section_payloads(sample_size, seed=None):
    if sample_size <= 0:
        raise ValueError("sample_size must be positive")

    rng = random.Random(seed)
    reservoir = []
    total_seen = 0

    indexes, version_by_title = get_supported_indexes_and_versions()

    for payload in iter_section_payloads(indexes, version_by_title):
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

    add_base_text_mappings_to_payloads(reservoir)

    return reservoir, total_seen


def write_json(section_payloads, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w") as fout:
        json.dump(section_payloads, fout, ensure_ascii=False, indent=2)


def build_bucket_filename(output_path):
    return f"{BLOB_PREFIX}/{output_path.name}"


def upload_output(output_path, bucket_name):
    bucket_filename = build_bucket_filename(output_path)
    return GoogleStorageManager.upload_file(str(output_path), bucket_filename, bucket_name)


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Uniformly sample or collect all section-level refs from one selected Hebrew version per index, "
            "write JSON containing per-segment Hebrew text, and upload the JSON to GCS under "
            f"{BLOB_PREFIX}/<filename>."
        )
    )
    parser.add_argument("n", type=int, nargs="?", help="Number of section refs to sample.")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Collect all eligible Hebrew section refs instead of taking a random sample.",
    )
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
    args = parser.parse_args()
    if args.all and args.n is not None:
        parser.error("n cannot be combined with --all.")
    if not args.all and args.n is None:
        parser.error("n is required unless --all is passed.")
    return args


def main():
    args = parse_args()
    if args.all:
        section_payloads, total_sections = collect_all_section_payloads()
        action_description = "Collected all"
    else:
        section_payloads, total_sections = sample_section_payloads(args.n, seed=args.seed)
        action_description = f"Sampled {len(section_payloads)}"

    write_json(section_payloads, args.output)
    try:
        uploaded_url = upload_output(args.output, args.bucket)
    except GoogleCloudError as exc:
        raise RuntimeError(f"Failed to upload {args.output} to bucket {args.bucket}: {exc}") from exc
    print(
        f"{action_description} Hebrew section refs from {total_sections} eligible sections. "
        f"Wrote JSON to {args.output} and uploaded it to {uploaded_url}."
    )


if __name__ == "__main__":
    main()
