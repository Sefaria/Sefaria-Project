from dataclasses import dataclass, field
from typing import List


class ParseError(Exception):
    pass


@dataclass
class Section:
    title: str
    content: List[str]
    word_count: int


@dataclass
class Chapter:
    title: str
    sections: List[Section]
    content: List[str]
    word_count: int


@dataclass
class ParseResult:
    chapters: List[Chapter]
    total_words: int
    structure_depth: int
    warnings: List[str] = field(default_factory=list)


def parse_document(file_obj, file_type: str, declared_depth: int) -> ParseResult:
    if file_type == "docx":
        return _parse_docx(file_obj, declared_depth)
    elif file_type == "pdf":
        raise ParseError("PDF upload is not yet supported. Please upload a .docx file.")
    else:
        raise ParseError(f"Unsupported file type: {file_type}")


def build_schema(depth: int, title_en: str, title_he: str) -> dict:
    if depth == 1:
        address_types = ["Integer"]
        section_names = ["Chapter"]
    else:
        address_types = ["Integer", "Integer"]
        section_names = ["Chapter", "Section"]

    return {
        "nodeType": "JaggedArrayNode",
        "depth": depth,
        "addressTypes": address_types,
        "sectionNames": section_names,
        "key": title_en,
        "titles": [
            {"text": title_en, "lang": "en", "primary": True},
            {"text": title_he, "lang": "he", "primary": True},
        ],
    }


def build_jagged_array(parse_result: ParseResult) -> list:
    if parse_result.structure_depth == 1:
        return [ch.content for ch in parse_result.chapters]
    else:
        return [[sec.content for sec in ch.sections] for ch in parse_result.chapters]


def _parse_docx(file_obj, declared_depth: int) -> ParseResult:
    raise NotImplementedError("DOCX parsing not yet implemented")
