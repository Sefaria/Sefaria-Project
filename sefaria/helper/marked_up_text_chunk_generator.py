
import structlog
from typing import List, Tuple
from sefaria.model.text import Ref, TextChunk
from sefaria.system.exceptions import InputError
from sefaria.helper.linker.tasks import link_segment_with_worker, LinkingArgs

logger = structlog.get_logger(__name__)


class MarkedUpTextChunkGenerator:


    def __init__(self):
        """Initialize the generator with necessary components."""
        pass

    def create_and_save_marked_up_text_chunk(self, segment_ref: Ref, vtitle: str, lang: str, text: str):
        linking_args = LinkingArgs(ref=segment_ref.normal(), text=text, lang=lang, vtitle=vtitle)
        link_segment_with_worker.apply_async(args=[linking_args.to_dict()], queue="linker")

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


    def _get_available_versions(self, segment_ref: Ref) -> List[Tuple[str, str]]:
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