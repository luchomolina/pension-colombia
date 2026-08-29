"""Search context, weighting, and score metadata models."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class QueryContext:
    query_type: Optional[str] = None
    preferred_chapter: Optional[str] = None
    preferred_section: Optional[str] = None
    preferred_subsection: Optional[str] = None
    query_keywords: List[str] = field(default_factory=list)

    def get_filter_criteria(self) -> Dict[str, str]:
        criteria: Dict[str, str] = {}
        if self.preferred_chapter:
            criteria["chapter_number"] = self.preferred_chapter
        if self.preferred_section:
            criteria["section_number"] = self.preferred_section
        if self.preferred_subsection:
            criteria["subsection_number"] = self.preferred_subsection
        return criteria


@dataclass
class WeightingConfig:
    chapter_match_boost: float = 1.25
    section_match_boost: float = 1.15
    document_type_boosts: Dict[str, float] = field(default_factory=dict)
    positional_decay: float = 0.01

    def get_boost_for_document_type(self, document_type: str) -> float:
        return self.document_type_boosts.get(document_type, 1.0)

    def get_positional_boost(self, chunk_index: int) -> float:
        return max(1.0, 1.0 + self.positional_decay * max(0, 10 - chunk_index))


@dataclass
class SearchMetadata:
    base_score: float
    weighted_score: float
    query_context: QueryContext
    weight_multiplier: float = 1.0
    boosts: Dict[str, float] = field(default_factory=dict)
    chapter_match: bool = False
    section_match: bool = False
    document_type_boost: bool = False
    positional_boost: bool = False

    def add_boost(self, name: str, multiplier: float) -> None:
        self.boosts[name] = multiplier
        self.weight_multiplier *= multiplier

    def to_dict(self) -> Dict[str, Any]:
        return {
            "base_score": self.base_score,
            "weighted_score": self.weighted_score,
            "weight_multiplier": self.weight_multiplier,
            "boosts": dict(self.boosts),
            "chapter_match": self.chapter_match,
            "section_match": self.section_match,
            "document_type_boost": self.document_type_boost,
            "positional_boost": self.positional_boost,
        }
