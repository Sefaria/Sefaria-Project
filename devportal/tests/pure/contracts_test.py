"""Contract C3: every fixture validates against its JSON Schema (PLAN §3, Phase 0).

Pure test: no Django, no database. Layout:

- ``devportal/contracts/schemas/<name>.schema.json``: one schema per shape, draft 2020-12.
  ``common`` and ``editor-common`` hold shared ``$defs`` only.
- ``devportal/contracts/fixtures/shapes/<name>/*.json``: must validate against ``<name>``.
- ``devportal/contracts/fixtures/shapes-invalid/<name>/*.json``: must not validate. They prove the schema
  constrains what it claims to.

The TypeScript side (``devportal-ui/src/contracts/contracts.test.ts``) checks the same fixtures against
the same schemas and against the TypeScript types.
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"
SCHEMAS = CONTRACTS / "schemas"
VALID = CONTRACTS / "fixtures" / "shapes"
INVALID = CONTRACTS / "fixtures" / "shapes-invalid"
DEFINITIONS_ONLY = {"common", "editor-common"}
ID_PREFIX = "https://developers.sefaria.org/_contracts/"


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _schemas() -> dict[str, dict]:
    return {path.name.removesuffix(".schema.json"): _load(path) for path in sorted(SCHEMAS.glob("*.schema.json"))}


def _registry(schemas: dict[str, dict]) -> Registry:
    return Registry().with_resources((schema["$id"], Resource.from_contents(schema)) for schema in schemas.values())


SCHEMA_DOCS = _schemas()
REGISTRY = _registry(SCHEMA_DOCS)
SHAPES = sorted(set(SCHEMA_DOCS) - DEFINITIONS_ONLY)


def _validator(name: str) -> Draft202012Validator:
    return Draft202012Validator(
        SCHEMA_DOCS[name], registry=REGISTRY, format_checker=Draft202012Validator.FORMAT_CHECKER
    )


def _fixtures(base: Path) -> list[tuple[str, Path]]:
    return [(path.parent.name, path) for path in sorted(base.glob("*/*.json"))]


def _fixture_id(item: tuple[str, Path]) -> str:
    return f"{item[0]}/{item[1].stem}"


@pytest.mark.parametrize("name", sorted(SCHEMA_DOCS))
def test_schema_is_valid_draft_2020_12(name):
    schema = SCHEMA_DOCS[name]
    Draft202012Validator.check_schema(schema)
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["$id"] == f"{ID_PREFIX}{name}.schema.json"


def test_every_shape_has_valid_and_invalid_fixtures():
    with_valid = {name for name, _ in _fixtures(VALID)}
    assert with_valid == set(SHAPES), "each shape needs at least one fixture, and each fixture folder a schema"
    with_invalid = {name for name, _ in _fixtures(INVALID)}
    assert with_invalid <= set(SHAPES), f"invalid fixtures without a schema: {with_invalid - set(SHAPES)}"


def test_fixture_folders_hold_only_json():
    for base in (VALID, INVALID):
        for path in base.rglob("*"):
            if path.is_file():
                assert path.suffix == ".json", path


@pytest.mark.parametrize("item", _fixtures(VALID), ids=_fixture_id)
def test_fixture_validates(item):
    name, path = item
    errors = sorted(_validator(name).iter_errors(_load(path)), key=lambda e: list(e.absolute_path))
    assert not errors, "\n".join(f"{list(e.absolute_path)}: {e.message}" for e in errors)


@pytest.mark.parametrize("item", _fixtures(INVALID), ids=_fixture_id)
def test_invalid_fixture_is_rejected(item):
    name, path = item
    assert not _validator(name).is_valid(_load(path)), f"{name}/{path.name} should not validate"


def test_page_payload_fixtures_cover_every_kind():
    kinds = {_load(path)["kind"] for path in (VALID / "page-payload").glob("*.json")}
    defined = {
        branch["properties"]["kind"]["const"]
        for key, branch in SCHEMA_DOCS["page-payload"]["$defs"].items()
        if key.endswith("Payload")
    }
    assert kinds == defined == {"home", "doc", "endpoint", "notfound", "redirect", "gallery", "editor"}
