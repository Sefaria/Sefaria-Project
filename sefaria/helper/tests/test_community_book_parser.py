import pytest
from sefaria.helper.community_book_parser import (
    ParseError, ParseResult, Chapter, Section,
    parse_document, build_jagged_array, build_schema,
)


class TestParseDocumentEntryPoint:
    def test_unsupported_file_type_raises(self):
        with pytest.raises(ParseError, match="Unsupported file type"):
            parse_document(None, "txt", 1)

    def test_pdf_raises_not_yet_supported(self):
        with pytest.raises(ParseError, match="PDF upload is not yet supported"):
            parse_document(None, "pdf", 1)


class TestBuildSchema:
    def test_depth_1_schema(self):
        schema = build_schema(1, "Test Book", "ספר בדיקה")
        assert schema["nodeType"] == "JaggedArrayNode"
        assert schema["depth"] == 1
        assert schema["addressTypes"] == ["Integer"]
        assert schema["sectionNames"] == ["Chapter"]
        titles = schema["titles"]
        en_primary = [t for t in titles if t.get("primary") and t["lang"] == "en"]
        assert len(en_primary) == 1
        assert en_primary[0]["text"] == "Test Book"

    def test_depth_2_schema(self):
        schema = build_schema(2, "Test Book", "ספר בדיקה")
        assert schema["depth"] == 2
        assert schema["addressTypes"] == ["Integer", "Integer"]
        assert schema["sectionNames"] == ["Chapter", "Section"]


class TestBuildJaggedArray:
    def test_depth_1_array(self):
        result = ParseResult(
            chapters=[
                Chapter(title="Ch1", sections=[], content=["para1", "para2"], word_count=2),
                Chapter(title="Ch2", sections=[], content=["para3"], word_count=1),
            ],
            total_words=3,
            structure_depth=1,
        )
        ja = build_jagged_array(result)
        assert ja == [["para1", "para2"], ["para3"]]

    def test_depth_2_array(self):
        result = ParseResult(
            chapters=[
                Chapter(
                    title="Ch1",
                    sections=[
                        Section(title="S1", content=["a", "b"], word_count=2),
                        Section(title="S2", content=["c"], word_count=1),
                    ],
                    content=[],
                    word_count=3,
                ),
            ],
            total_words=3,
            structure_depth=2,
        )
        ja = build_jagged_array(result)
        assert ja == [[["a", "b"], ["c"]]]
