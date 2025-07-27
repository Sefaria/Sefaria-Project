
import structlog
from typing import List, Tuple
from sefaria.model.text import Ref, TextChunk
from sefaria.model.marked_up_text_chunk import MarkedUpTextChunk
from sefaria.system.exceptions import InputError
from sefaria.helper.linker.tasks import link_segment_with_worker

logger = structlog.get_logger(__name__)


class MarkedUpTextChunkGenerator:


    def __init__(self):
        """Initialize the generator with necessary components."""
        pass

    def create_and_save_marked_up_text_chunk(self, segment_ref, vtitle, lang, text):
        linking_args = {
            "ref": segment_ref.normal(),
            "text": text,
            "lang": lang,
            "vtitle": vtitle
        }
        inference = link_segment_with_worker.apply_async(args=[linking_args], queue="linker").get()
        # inference = link_segment_with_worker_debug(linking_args)
        print(f"Linking inference for {segment_ref.normal()} with vtitle {vtitle} and lang {lang}: {inference}")

    def generate_from_ref(self, ref: Ref) -> None:
        try:
            segment_refs = ref.all_segment_refs()
            logger.info(f"Generating MarkedUpTextChunks for {len(segment_refs)} segment refs from {ref.normal()}")

            for segment_ref in segment_refs:
                self._generate_all_versions_for_segment(segment_ref)

        except Exception as e:
            logger.error(f"Error generating MarkedUpTextChunks for {ref.normal()}: {e}")
            raise

    def _generate_all_versions_for_segment(self, segment_ref: Ref) -> None:
        for lang, vtitle in self._get_available_versions(segment_ref):
            text_chunk = TextChunk(segment_ref, lang=lang, vtitle=vtitle)
            if not text_chunk.text:
                logger.debug(f"No text found for {segment_ref.normal()}, {vtitle}, {lang}")
                continue
            self.generate(segment_ref, lang, vtitle)

    def generate(self, ref: Ref, lang: str, vtitle: str) -> None:
        try:
            segment_refs = ref.all_segment_refs()
            logger.info(f"Generating MarkedUpTextChunks for {len(segment_refs)} segment refs from {ref.normal()}")

            for segment_ref in segment_refs:
                self._generate_single_segment_version(segment_ref, lang, vtitle)

        except Exception as e:
            logger.error(f"Error generating MarkedUpTextChunks for {ref.normal()}: {e}")
            raise

    def _generate_single_segment_version(self, segment_ref: Ref, lang: str, vtitle: str) -> None:
        text_chunk = TextChunk(segment_ref, lang=lang, vtitle=vtitle)
        if not text_chunk.text:
            logger.debug(f"No text found for {segment_ref.normal()}, {vtitle}, {lang}")
            return

        try:
            self.create_and_save_marked_up_text_chunk(segment_ref, vtitle, lang, text_chunk.text)
        except Exception as e:
            logger.error(f"Failed to create/save MarkedUpTextChunk for {segment_ref.normal()}, {vtitle}, {lang}: {e}")
            raise



    def _process_segment_ref(self, segment_ref: Ref) -> None:

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
                self.create_and_save_marked_up_text_chunk(segment_ref, vtitle, lang, text_chunk.text)

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