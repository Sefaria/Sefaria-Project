#!/usr/bin/env python
"""
Fast LLM tagging runner for the research-panel POC fixture.

This script is intentionally pragmatic: it tags the sampled fixture in batches,
checkpoints after every successful batch, and then optionally clusters the
extracted questions. It does not write to application collections.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
import re
import time
from pathlib import Path
from typing import Any

from anthropic import Anthropic
from openai import OpenAI


DEFAULT_IN = Path("data/research_panel_poc/nitzavim_candidates_1000.webpages_enriched.json")
DEFAULT_OUT = Path("data/research_panel_poc/nitzavim_candidates_1000.tagged.json")
DEFAULT_MODEL = os.environ.get("RESEARCH_PANEL_TAG_MODEL", "gpt-5.6-luna")
DEFAULT_ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")

PURPOSES = [
    "Explanatory",
    "Linguistic",
    "Parallel",
    "Proof",
    "Stylistic",
    "Footnote",
    "Base Text",
    "Other",
]


ITEM_TAG_SCHEMA = {
    "name": "research_panel_item_tags",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "id": {"type": "string"},
                        "pocIndex": {"type": "integer"},
                        "resourceType": {"type": "string"},
                        "purposeTags": {
                            "type": "array",
                            "items": {"type": "string", "enum": PURPOSES},
                            "minItems": 1,
                        },
                        "primaryPurpose": {"type": "string", "enum": PURPOSES},
                        "questionsAnswered": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "normalizedQuestion": {"type": "string"},
                        "topicTags": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "quality": {
                            "type": "string",
                            "enum": ["strong", "okay", "weak", "off-topic", "blocked"],
                        },
                        "needsHumanReview": {"type": "boolean"},
                        "rationale": {"type": "string"},
                    },
                    "required": [
                        "id",
                        "pocIndex",
                        "resourceType",
                        "purposeTags",
                        "primaryPurpose",
                        "questionsAnswered",
                        "normalizedQuestion",
                        "topicTags",
                        "quality",
                        "needsHumanReview",
                        "rationale",
                    ],
                },
            },
        },
        "required": ["items"],
    },
    "strict": True,
}


CLUSTER_SCHEMA = {
    "name": "research_panel_question_clusters",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "clusters": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "clusterId": {"type": "string"},
                        "label": {"type": "string"},
                        "questionVariants": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "topicTags": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["clusterId", "label", "questionVariants", "topicTags"],
                },
            },
        },
        "required": ["clusters"],
    },
    "strict": True,
}


def compact_text(value: str, limit: int) -> str:
    value = " ".join((value or "").split())
    return value[:limit]


def item_payload(item: dict[str, Any], index: int) -> dict[str, Any]:
    base = {
        "pocIndex": index,
        "id": str(item["id"]),
        "resourceType": item["resourceType"],
        "anchorRefs": item.get("anchorRefs", []),
        "primaryAnchorRef": item.get("primaryAnchorRef", ""),
        "passage": item.get("passage"),
    }
    if item["resourceType"] == "text-link":
        base.update({
            "sourceRef": item.get("sourceRef"),
            "sourceBook": item.get("sourceBook"),
            "category": item.get("category"),
            "linkType": item.get("linkType"),
            "inlineCitation": item.get("inlineCitation"),
            "deterministicSnippetAvailable": item.get("deterministicSnippetAvailable"),
            "deterministicSnippetText": compact_text(
                " ".join(e.get("text") or "" for e in item.get("deterministicSnippetEvidence", [])),
                500,
            ),
            "sourceTextPreview": compact_text(item.get("sourceTextPreview", ""), 900),
        })
    elif item["resourceType"] == "sheet":
        base.update({
            "title": item.get("title"),
            "summary": compact_text(item.get("summary", ""), 900),
            "topicSlugs": item.get("topicSlugs", [])[:20],
            "themeTopicHits": item.get("themeTopicHits", []),
        })
    elif item["resourceType"] == "webpage":
        base.update({
            "title": item.get("title"),
            "description": item.get("description"),
            "domain": item.get("domain"),
            "fetchOk": item.get("webFetch", {}).get("fetchOk"),
            "fetchStatus": item.get("webFetch", {}).get("fetchStatus"),
            "citationFound": item.get("citationFound"),
            "citationMatch": item.get("citationMatch"),
            "citationSnippet": compact_text(item.get("citationSnippet", ""), 700),
            "extractedTextPreview": compact_text(item.get("extractedTextPreview", ""), 1000),
        })
    return base


def extract_json_payload(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("{"):
        return json.loads(text)
    fenced_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, flags=re.DOTALL)
    if fenced_match:
        return json.loads(fenced_match.group(1))
    object_match = re.search(r"(\{.*\})", text, flags=re.DOTALL)
    if object_match:
        return json.loads(object_match.group(1))
    raise json.JSONDecodeError("Could not find JSON object", text, 0)


def call_openai_json(client: OpenAI, model: str, messages: list[dict[str, str]], schema: dict[str, Any]) -> dict[str, Any]:
    last_error = None
    for attempt in range(1, 4):
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            response_format={"type": "json_schema", "json_schema": schema},
            max_completion_tokens=12000,
        )
        choice = response.choices[0]
        content = choice.message.content or ""
        try:
            return json.loads(content)
        except json.JSONDecodeError as exc:
            last_error = exc
            print(
                f"Malformed JSON response on attempt {attempt}; "
                f"finish_reason={choice.finish_reason}; content_prefix={content[:120]!r}",
                flush=True,
            )
            time.sleep(2 * attempt)
    raise last_error


def call_anthropic_json(client: Anthropic, model: str, messages: list[dict[str, str]], schema: dict[str, Any]) -> dict[str, Any]:
    last_error = None
    user_content = messages[-1]["content"]
    schema_json = json.dumps(schema["schema"], ensure_ascii=False)
    system = (
        f"{messages[0]['content']}\n\n"
        "Return a single valid JSON object and no surrounding prose. "
        f"The JSON object must satisfy this schema:\n{schema_json}"
    )
    for attempt in range(1, 4):
        response = client.messages.create(
            model=model,
            temperature=0,
            max_tokens=12000,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
        content = "".join(block.text for block in response.content if getattr(block, "type", None) == "text")
        try:
            return extract_json_payload(content)
        except json.JSONDecodeError as exc:
            last_error = exc
            print(
                f"Malformed Claude JSON on attempt {attempt}; stop_reason={response.stop_reason}; "
                f"content_prefix={content[:120]!r}",
                flush=True,
            )
            time.sleep(2 * attempt)
    raise last_error


def call_json(
    client: OpenAI | Anthropic,
    provider: str,
    model: str,
    messages: list[dict[str, str]],
    schema: dict[str, Any],
) -> dict[str, Any]:
    if provider == "openai":
        return call_openai_json(client, model, messages, schema)
    if provider == "anthropic":
        return call_anthropic_json(client, model, messages, schema)
    raise ValueError(f"Unsupported provider: {provider}")


def load_existing_output(input_data: dict[str, Any], out_path: Path) -> dict[str, Any]:
    if out_path.exists():
        return json.loads(out_path.read_text(encoding="utf-8"))
    return {
        **{key: value for key, value in input_data.items() if key != "items"},
        "taggingPolicy": {
            "note": "POC LLM tags only. Passage and deterministic citation snippets are not LLM tags.",
            "purposes": PURPOSES,
        },
        "items": input_data["items"],
        "llmTaggingSummary": {},
    }


def merge_tags(output_data: dict[str, Any], tags: list[dict[str, Any]]) -> None:
    for tag in tags:
        index = tag.get("pocIndex")
        if isinstance(index, int) and 0 <= index < len(output_data["items"]):
            output_data["items"][index]["llmTags"] = tag
            continue
    tag_by_key = {(tag["resourceType"], str(tag["id"])): tag for tag in tags}
    for item in output_data["items"]:
        key = (item["resourceType"], str(item["id"]))
        if key in tag_by_key:
            item["llmTags"] = tag_by_key[key]


def item_tagging_prompt(batch: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "Tag research-panel resource candidates for a Jewish text reader POC. "
                "Return only JSON matching the schema. Purpose tags describe why this "
                "resource would appear in a sidebar for the anchor verse. Passage grouping "
                "and deterministic citation snippets are precomputed and must not be treated "
                "as LLM-created data. For blocked or fetch-failed webpages, use quality "
                "'blocked' or 'weak' as appropriate. Keep rationale under 25 words."
            ),
        },
        {
            "role": "user",
            "content": json.dumps({"items": batch, "purposeDefinitions": {
                "Explanatory": "Explains meaning, theology, narrative, law, or interpretation.",
                "Linguistic": "Discusses words, grammar, translation, etymology, or phrasing.",
                "Parallel": "Shows another source with similar language, structure, event, or idea.",
                "Proof": "Uses this verse as evidence for a claim or rule.",
                "Stylistic": "Discusses rhetoric, literary structure, repetition, or style.",
                "Footnote": "Minor cross-reference, note, source trail, or bibliographic aside.",
                "Base Text": "The anchor text itself or very direct continuation/context.",
                "Other": "Useful but not covered by the taxonomy.",
            }}, ensure_ascii=False),
        },
    ]


def cluster_prompt(questions: list[str]) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "Cluster similar normalized questions for a research-panel POC. "
                "Use broad, user-facing labels. Every question variant in your output "
                "must be copied exactly from the provided question list. Prefer fewer, "
                "larger user-facing clusters over near-duplicate clusters. Return only "
                "JSON matching the schema."
            ),
        },
        {
            "role": "user",
            "content": json.dumps({"questions": questions}, ensure_ascii=False),
        },
    ]


def summarize(items: list[dict[str, Any]]) -> dict[str, Any]:
    tagged = [item for item in items if item.get("llmTags")]
    return {
        "totalItems": len(items),
        "taggedItems": len(tagged),
        "untaggedItems": len(items) - len(tagged),
        "taggedWebpages": sum(1 for item in tagged if item["resourceType"] == "webpage"),
        "qualityCounts": {
            quality: sum(1 for item in tagged if item["llmTags"]["quality"] == quality)
            for quality in ["strong", "okay", "weak", "off-topic", "blocked"]
        },
    }


def merge_question_clusters(output_data: dict[str, Any], batch_number: int, clusters: list[dict[str, Any]]) -> None:
    existing_variants = {
        variant
        for cluster in output_data.get("questionClusters", [])
        for variant in cluster.get("questionVariants", [])
    }
    output_data.setdefault("questionClusters", [])
    for local_index, cluster in enumerate(clusters, start=1):
        if not isinstance(cluster, dict):
            continue
        raw_variants = cluster.get("questionVariants", [])
        if not isinstance(raw_variants, list):
            continue
        variants = [q for q in raw_variants if q and q not in existing_variants]
        if not variants:
            continue
        existing_variants.update(variants)
        output_data["questionClusters"].append({
            **cluster,
            "clusterId": f"QB{batch_number:03d}-{local_index:03d}",
            "sourceClusterId": cluster.get("clusterId", ""),
            "sourceBatch": batch_number,
            "questionVariants": variants,
        })


def attach_question_clusters(output_data: dict[str, Any]) -> None:
    question_to_cluster = {}
    for cluster in output_data.get("questionClusters", []):
        for variant in cluster.get("questionVariants", []):
            question_to_cluster[variant] = {
                "clusterId": cluster["clusterId"],
                "clusterLabel": cluster["label"],
            }
    for item in output_data["items"]:
        tags = item.get("llmTags")
        if not tags:
            continue
        question = tags.get("normalizedQuestion", "").strip()
        if question in question_to_cluster:
            tags.update(question_to_cluster[question])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(DEFAULT_IN))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--provider", choices=["openai", "anthropic"], default="anthropic")
    parser.add_argument("--model", default=None)
    parser.add_argument("--batch-size", type=int, default=10)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--cluster-batch-size", type=int, default=50)
    parser.add_argument("--cluster-workers", type=int, default=6)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--skip-clustering", action="store_true")
    parser.add_argument("--only-clustering", action="store_true")
    args = parser.parse_args()
    if args.model is None:
        args.model = DEFAULT_ANTHROPIC_MODEL if args.provider == "anthropic" else DEFAULT_MODEL

    input_path = Path(args.input)
    out_path = Path(args.out)
    input_data = json.loads(input_path.read_text(encoding="utf-8"))
    output_data = load_existing_output(input_data, out_path)
    output_data["taggingPolicy"]["provider"] = args.provider
    output_data["taggingPolicy"]["model"] = args.model
    output_data["taggingPolicy"]["batchSize"] = args.batch_size
    output_data["taggingPolicy"]["workers"] = args.workers
    output_data["taggingPolicy"]["clusterBatchSize"] = args.cluster_batch_size
    output_data["taggingPolicy"]["clusterWorkers"] = args.cluster_workers

    client = OpenAI() if args.provider == "openai" else Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    items = output_data["items"]
    target_indexes = [] if args.only_clustering else [i for i, item in enumerate(items) if not item.get("llmTags")]
    if args.limit is not None:
        target_indexes = target_indexes[:args.limit]

    started = time.time()
    batches = []
    for start in range(0, len(target_indexes), args.batch_size):
        batch_indexes = target_indexes[start:start + args.batch_size]
        batch = [item_payload(items[i], i) for i in batch_indexes]
        batches.append((start // args.batch_size + 1, batch))

    def tag_batch(batch_number: int, batch: list[dict[str, Any]]) -> tuple[int, list[dict[str, Any]]]:
        result = call_json(client, args.provider, args.model, item_tagging_prompt(batch), ITEM_TAG_SCHEMA)
        return batch_number, result["items"]

    if batches:
        print(
            f"Tagging {len(target_indexes)} remaining items in {len(batches)} batches "
            f"with {args.workers} workers via {args.provider}:{args.model}",
            flush=True,
        )
    completed_batches = 0
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(tag_batch, batch_number, batch) for batch_number, batch in batches]
        for future in as_completed(futures):
            batch_number, tags = future.result()
            completed_batches += 1
            merge_tags(output_data, tags)
            output_data["llmTaggingSummary"] = summarize(output_data["items"])
            out_path.write_text(json.dumps(output_data, ensure_ascii=False, indent=2), encoding="utf-8")
            print(
                f"Completed batch {batch_number} ({completed_batches}/{len(batches)}): "
                f"{json.dumps(output_data['llmTaggingSummary'], ensure_ascii=False)}",
                flush=True,
            )

    if not args.skip_clustering:
        questions = sorted({
            item["llmTags"].get("normalizedQuestion", "").strip()
            for item in output_data["items"]
            if item.get("llmTags") and item["llmTags"].get("normalizedQuestion", "").strip()
        })
        clustered_questions = {
            variant
            for cluster in output_data.get("questionClusters", [])
            for variant in cluster.get("questionVariants", [])
        }
        questions = [question for question in questions if question not in clustered_questions]
        cluster_batch_offset = max(
            [cluster.get("sourceBatch", 0) for cluster in output_data.get("questionClusters", [])]
            or [0]
        )
        question_batches = [
            (cluster_batch_offset + i // args.cluster_batch_size + 1, questions[i:i + args.cluster_batch_size])
            for i in range(0, len(questions), args.cluster_batch_size)
        ]

        def cluster_batch(batch_number: int, batch: list[str]) -> tuple[int, list[dict[str, Any]]]:
            result = call_json(client, args.provider, args.model, cluster_prompt(batch), CLUSTER_SCHEMA)
            return batch_number, result["clusters"]

        if question_batches:
            print(
                f"Clustering {len(questions)} remaining questions in {len(question_batches)} batches "
                f"with {args.cluster_workers} workers",
                flush=True,
            )
        completed_cluster_batches = 0
        with ThreadPoolExecutor(max_workers=args.cluster_workers) as executor:
            futures = [
                executor.submit(cluster_batch, batch_number, batch)
                for batch_number, batch in question_batches
            ]
            for future in as_completed(futures):
                batch_number, clusters = future.result()
                completed_cluster_batches += 1
                merge_question_clusters(output_data, batch_number, clusters)
                attach_question_clusters(output_data)
                output_data["llmTaggingSummary"] = summarize(output_data["items"])
                output_data["llmTaggingSummary"]["questionClusterCount"] = len(output_data.get("questionClusters", []))
                output_data["llmTaggingSummary"]["clusteredQuestionCount"] = sum(
                    1 for item in output_data["items"] if item.get("llmTags", {}).get("clusterId")
                )
                out_path.write_text(json.dumps(output_data, ensure_ascii=False, indent=2), encoding="utf-8")
                print(
                    f"Completed cluster batch {batch_number} "
                    f"({completed_cluster_batches}/{len(question_batches)}): "
                    f"{json.dumps(output_data['llmTaggingSummary'], ensure_ascii=False)}",
                    flush=True,
                )
        attach_question_clusters(output_data)
        output_data["llmTaggingSummary"] = summarize(output_data["items"])
        output_data["llmTaggingSummary"]["questionClusterCount"] = len(output_data.get("questionClusters", []))
        output_data["llmTaggingSummary"]["clusteredQuestionCount"] = sum(
            1 for item in output_data["items"] if item.get("llmTags", {}).get("clusterId")
        )
        out_path.write_text(json.dumps(output_data, ensure_ascii=False, indent=2), encoding="utf-8")

    elapsed = int(time.time() - started)
    print(f"Wrote {out_path}")
    print(f"Elapsed seconds: {elapsed}")
    print(json.dumps(output_data["llmTaggingSummary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
