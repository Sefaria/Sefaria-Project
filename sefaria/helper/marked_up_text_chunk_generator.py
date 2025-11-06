
import structlog
from sefaria.model.text import Ref, TextChunk, Version
from sefaria.helper.linker.tasks import LinkingArgs, enqueue_linking_chain


logger = structlog.get_logger(__name__)


class MarkedUpTextChunkGenerator:


    def __init__(self, user_id=None, **kwargs):
        self.user_id = user_id
        self.kwargs = kwargs

    ## Public methods:

    def generate(self, ref: Ref, lang: str, vtitle: str) -> None:
        try:
            segment_refs = ref.all_segment_refs()
            logger.info(f"Generating MarkedUpTextChunks for {len(segment_refs)} segment refs from {ref.normal()}")

            for segment_ref in segment_refs:
                self._generate_single_segment_version(segment_ref, lang, vtitle)

        except Exception as e:
            logger.error(f"Error generating MarkedUpTextChunks for {ref.normal()}: {e}")
            raise

    def generate_from_ref(self, ref: Ref) -> None:
        try:
            segment_refs = ref.all_segment_refs()
            logger.info(f"Generating MarkedUpTextChunks for {len(segment_refs)} segment refs from {ref.normal()}")

            for segment_ref in segment_refs:
                self._generate_all_versions_for_segment(segment_ref)

        except Exception as e:
            logger.error(f"Error generating MarkedUpTextChunks for {ref.normal()}: {e}")
            raise

    def generate_from_ref_and_version_id(self, ref: Ref, version_id: str) -> None:
        try:
            segment_refs = ref.all_segment_refs()
            logger.info(f"Generating MarkedUpTextChunks for {len(segment_refs)} segment refs from {ref.normal()} and version ID {version_id}")

            version = Version().load_by_id(version_id)
            if not version:
                logger.error(f"Version with ID {version_id} not found.")
                return

            lang = version.language
            vtitle = version.versionTitle

            for segment_ref in segment_refs:
                self._generate_single_segment_version(segment_ref, lang, vtitle, version_id)

        except Exception as e:
            logger.error(f"Error generating MarkedUpTextChunks for {ref.normal()} and version ID {version_id}: {e}")
            raise

    ##  Private methods:

    def _create_and_save_marked_up_text_chunk(self, segment_ref: Ref, vtitle: str, lang: str, text: str, version_id: int) -> None:
        self.kwargs['version_id'] = version_id
        linking_args = LinkingArgs(ref=segment_ref.normal(), text=text,
                                   lang=lang, vtitle=vtitle,
                                   user_id=self.user_id, kwargs=self.kwargs)
        enqueue_linking_chain(linking_args)


    def _generate_all_versions_for_segment(self, segment_ref: Ref) -> None:
        lang_title_pairs = [(version.language, version.versionTitle)
                    for version in segment_ref.versionset().array()]
        for lang, vtitle in lang_title_pairs:
            text_chunk = TextChunk(segment_ref, lang=lang, vtitle=vtitle)
            if not text_chunk.text:
                logger.debug(f"No text found for {segment_ref.normal()}, {vtitle}, {lang}")
                continue
            self.generate(segment_ref, lang, vtitle)

    def _generate_single_segment_version(self, segment_ref: Ref, lang: str, vtitle: str, version_id: str) -> None:
        text_chunk = TextChunk(segment_ref, lang=lang, vtitle=vtitle)
        if not text_chunk.text:
            logger.debug(f"No text found for {segment_ref.normal()}, {vtitle}, {lang}")
            return

        try:
            self._create_and_save_marked_up_text_chunk(segment_ref, vtitle, lang, text_chunk.text, version_id)
        except Exception as e:
            logger.error(f"Failed to create/save MarkedUpTextChunk for {segment_ref.normal()}, {vtitle}, {lang}: {e}")
            raise
