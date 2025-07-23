
import structlog
from typing import List, Tuple
from sefaria.model.text import Ref, TextChunk
from sefaria.model.marked_up_text_chunk import MarkedUpTextChunk
from sefaria.system.exceptions import InputError
from sefaria.helper.linker.tasks import link_segment_with_worker

logger = structlog.get_logger(__name__)

# Import function for async processing (implemented separately)
# This function handles celery queue processing without making the generator celery-aware
try:
    from .link_test import link_test
except ImportError:
    # Placeholder function if link_test is not yet implemented
    def link_test(segment_ref, vtitle, lang, text):
        """
        Placeholder for link_test function that should handle:
        - Running linking algorithms (Linker, Quotation Finder)
        - Creating MarkedUpTextChunk objects
        - Handling async processing via celery
        """
        linking_args =  {
            "ref": "Genesis 1:1",
            "text": Ref("Genesis 1:1").text().text,
            "lang": "en"
        }
        inference = link_segment_with_worker.apply_async(args=[linking_args], queue="linker")
        print(f"Linking inference for {segment_ref.normal()} with vtitle {vtitle} and lang {lang}: {inference}")


class MarkedUpTextChunkGenerator:
    """
    MarkedUpTextChunkGenerator is responsible for delegating generation of MarkedUpTextChunks
    to relevant algorithms. Currently these include Linker and Quotation Finder.

    The class exposes one public function:
    - generate(ref: Ref) -> None

    This function runs both algorithms for the given Ref and saves new MarkedUpTextChunks
    that it generates. The Ref can be section level, ranged etc. which is accounted for
    when passing to relevant algorithms.
    """

    def __init__(self):
        """Initialize the generator with necessary components."""
        pass

    def generate(self, ref: Ref) -> None:
        """
        Generate MarkedUpTextChunks for the given Ref by running linking algorithms.

        Args:
            ref: A Ref object that can be section level, ranged, etc.
        """
        try:
            # Get all segment-level refs from the input ref
            segment_refs = self._get_segment_refs(ref)

            logger.info(f"Generating MarkedUpTextChunks for {len(segment_refs)} segment refs from {ref.normal()}")

            # Process each segment ref
            for segment_ref in segment_refs:
                self._process_segment_ref(segment_ref)

        except Exception as e:
            logger.error(f"Error generating MarkedUpTextChunks for {ref.normal()}: {str(e)}")
            raise

    def _get_segment_refs(self, ref: Ref) -> List[Ref]:
        """
        Convert any ref type (section level, ranged, etc.) to a list of segment-level refs.

        Args:
            ref: Input Ref of any level

        Returns:
            List of segment-level Ref objects
        """
        if ref.is_segment_level():
            return [ref]
        elif ref.is_section_level():
            # Get all segment refs in this section
            return ref.all_subrefs()
        elif ref.is_range():
            # Get all segment refs in the range
            return ref.all_segment_refs()
        else:
            # Book level or higher - get all segment refs
            return ref.all_segment_refs()

    def _process_segment_ref(self, segment_ref: Ref) -> None:
        """
        Process a single segment-level ref to generate MarkedUpTextChunks.

        Args:
            segment_ref: A segment-level Ref object
        """
        try:
            # Get available versions for this ref
            versions = self._get_available_versions(segment_ref)

            for lang, vtitle in versions:
                # Check if MarkedUpTextChunk already exists for this combination
                if self._chunk_already_exists(segment_ref, vtitle, lang):
                    logger.debug(f"MarkedUpTextChunk already exists for {segment_ref.normal()}, {vtitle}, {lang}")
                    continue

                # Get the text chunk
                text_chunk = TextChunk(segment_ref, lang=lang, vtitle=vtitle)
                if not text_chunk.text:
                    logger.debug(f"No text found for {segment_ref.normal()}, {vtitle}, {lang}")
                    continue

                # Use link_test to make inference and create MarkedUpTextChunks
                # This function handles the actual linking algorithms and chunk creation
                link_test(segment_ref, vtitle, lang, text_chunk.text)

        except Exception as e:
            logger.error(f"Error processing segment ref {segment_ref.normal()}: {str(e)}")
            # Don't re-raise to allow processing of other segments to continue

    def _get_available_versions(self, segment_ref: Ref) -> List[Tuple[str, str]]:
        """
        Get available versions (language, versionTitle) for a given ref.

        Args:
            segment_ref: A segment-level Ref object

        Returns:
            List of (language, versionTitle) tuples
        """
        versions = []

        # Get the index for this ref
        index = segment_ref.index
        version_set = index.versionSet()

        for version in version_set:
            # Check if this version has content for our specific ref
            try:
                text_chunk = TextChunk(segment_ref, lang=version.language, vtitle=version.versionTitle)
                if text_chunk.text and text_chunk.text.strip():
                    versions.append((version.language, version.versionTitle))
            except (InputError, AttributeError):
                # Skip versions that don't have this ref
                continue

        return versions

    def _chunk_already_exists(self, ref: Ref, vtitle: str, lang: str) -> bool:
        """
        Check if a MarkedUpTextChunk already exists for the given parameters.

        Args:
            ref: Segment-level Ref object
            vtitle: Version title
            lang: Language

        Returns:
            True if chunk already exists, False otherwise
        """
        existing = MarkedUpTextChunk().load({
            "ref": ref.normal(),
            "versionTitle": vtitle,
            "language": lang
        })
        return existing is not None