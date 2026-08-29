# src/rag_system/document_processor_manager.py
from typing import List, Optional, Callable, Tuple
from langchain_core.documents import Document
from langchain_core.language_models import BaseLanguageModel
from src.quality.document_quality_gate import DocumentQualityGate


class DocumentProcessorManager:

    def __init__(self, embeddings, chunk_strategy: str, chunk_size: int, chunk_overlap: int, llm: Optional[BaseLanguageModel] = None, enable_contextual: bool = False, enable_quality_gate: bool = True, enable_empirical_validation: bool = False):
        if chunk_strategy.startswith("agentic") or chunk_strategy == "hybrid_agentic":
            print(f"🤖 Initializing Agentic Document Processor with strategy: {chunk_strategy}")
            if enable_contextual:
                print("Contextual RAG enabled with Agentic chunking")
            from src.document_management.agentic_document_processor import AgenticDocumentProcessor
            self.document_processor = AgenticDocumentProcessor(
                embeddings=embeddings,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                chunk_strategy=chunk_strategy,
                max_workers=4,
                llm=llm,
                enable_contextual=enable_contextual
            )
        else:
            from src.document_management.document_processor import DocumentProcessor
            self.document_processor = DocumentProcessor(
                embeddings=embeddings,
                chunk_strategy=chunk_strategy,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                llm=llm,
                enable_contextual=enable_contextual
            )

        self.chunk_strategy = chunk_strategy
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

        self.quality_gate = DocumentQualityGate(
            min_score_threshold=0.6,
            enable_empirical_validation=enable_empirical_validation
        ) if enable_quality_gate else None

        print(f"🛡️ Quality gate status: {'ENABLED' if enable_quality_gate else 'DISABLED'}", flush=True)
        if enable_quality_gate:
            print("🛡️ Quality gate enabled - documents will be validated before vectorization", flush=True)

    def process_document_pipeline(self, file_path: str, filename: str,
                                progress_callback: Optional[Callable] = None) -> Tuple[List[Document], bool]:

        print(f"\n🎯 Processing document: {filename}")
        print(f"📊 Processing configuration:")
        print(f"   • Chunk Strategy: {self.chunk_strategy}")
        print(f"   • Chunk Size: {self.chunk_size}")
        print(f"   • Chunk Overlap: {self.chunk_overlap}")

        chunks = self.document_processor.process_document_pipeline(file_path, progress_callback)
        print(f"📝 Document processing complete: {len(chunks)} chunks created")

        if chunks:
            avg_size = sum(len(chunk.page_content) for chunk in chunks) / len(chunks)
            print(f"📊 Chunk statistics: avg size {avg_size:.0f} chars, range {min(len(c.page_content) for c in chunks)}-{max(len(c.page_content) for c in chunks)} chars")

        if self.quality_gate:
            print("🛡️ Starting quality gate validation...", flush=True)
            validation_result = self.quality_gate.validate_before_vectorization(chunks, file_path)
            should_vectorize = validation_result[0]
            quality_result = validation_result[1]

            if not should_vectorize:
                print("🚫 Document rejected - quality score too low")
                for reason in quality_result.rejection_reasons:
                    print(f"   • {reason}")
                print("💡 Recommendations:")
                for rec in quality_result.recommendations:
                    print(f"   • {rec}")
                return [], False
            else:
                score = quality_result.quality_score.overall_score
                print(f"✅ Document approved for vectorization (quality score: {score:.3f})")
                return chunks, True
        else:
            print("⚠️ Quality gate disabled - all chunks will be vectorized")
            return chunks, True

    def load_document(self, file_path: str) -> List[Document]:
        return self.document_processor.load_document(file_path)

    def chunk_documents(self, documents: List[Document]) -> List[Document]:
        if hasattr(self.document_processor, 'process_documents_agentic'):
            return self.document_processor.process_documents_agentic(documents)
        return self.document_processor.chunk_documents(documents)

    def get_processor_info(self) -> dict:
        info = {
            "chunk_strategy": self.chunk_strategy,
            "chunk_size": self.chunk_size,
            "chunk_overlap": self.chunk_overlap,
            "quality_gate_enabled": self.quality_gate is not None
        }

        if self.quality_gate:
            info["quality_stats"] = self.quality_gate.get_processing_statistics()

        return info

    def get_document_processor(self):
        return self.document_processor
