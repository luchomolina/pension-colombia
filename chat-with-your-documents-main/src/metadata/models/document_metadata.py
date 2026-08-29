"""Metadata models attached to indexed document chunks."""

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, Optional


class DocumentType(str, Enum):
    PDF = "pdf"
    DOCX = "docx"
    DOC = "doc"
    TXT = "txt"
    MD = "md"
    HTML = "html"


@dataclass
class ChapterMetadata:
    number: str
    title: Optional[str] = None
    raw_number: Optional[str] = None


@dataclass
class SectionMetadata:
    number: str
    subsection: Optional[str] = None
    title: Optional[str] = None
    level: int = 1


@dataclass
class DocumentMetadata:
    source_filename: str
    document_type: DocumentType
    chunk_index: int
    content_length: int
    word_count: int
    processing_timestamp: str
    chapter: Optional[ChapterMetadata] = None
    section: Optional[SectionMetadata] = None
    inherited_metadata: bool = False
    custom_fields: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["document_type"] = self.document_type.value
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DocumentMetadata":
        values = dict(data)
        values["document_type"] = DocumentType(values.get("document_type", "txt"))
        chapter = values.get("chapter")
        section = values.get("section")
        if isinstance(chapter, dict):
            values["chapter"] = ChapterMetadata(**chapter)
        if isinstance(section, dict):
            values["section"] = SectionMetadata(**section)
        return cls(
            source_filename=values.get("source_filename", "unknown"),
            document_type=values["document_type"],
            chunk_index=int(values.get("chunk_index", 0)),
            content_length=int(values.get("content_length", 0)),
            word_count=int(values.get("word_count", 0)),
            processing_timestamp=values.get("processing_timestamp", ""),
            chapter=values.get("chapter"),
            section=values.get("section"),
            inherited_metadata=bool(values.get("inherited_metadata", False)),
            custom_fields=dict(values.get("custom_fields", {})),
        )
