from abc import ABC, abstractmethod
import re
from typing import Union, Any
import structlog
from sefaria.model.linker.ne_span import NESpan, NEDoc
try:
    import spacy
except ImportError:
    spacy = None

logger = structlog.get_logger(__name__)


def load_spacy_model(path: str):
    import tarfile
    from tempfile import TemporaryDirectory
    from sefaria.google_storage_manager import GoogleStorageManager
    from sefaria.spacy_function_registry import inner_punct_tokenizer_factory  # this looks unused, but spacy.load() expects this function to be in scope

    using_gpu = spacy.prefer_gpu()
    logger.info(f"Spacy successfully connected to GPU: {using_gpu}")

    if path.startswith("gs://"):
        # file is located in Google Cloud
        # file is expected to be a tar.gz of the contents of the model folder (not the folder itself)
        match = re.match(r"gs://([^/]+)/(.+)$", path)
        bucket_name = match.group(1)
        blob_name = match.group(2)
        model_buffer = GoogleStorageManager.get_filename(blob_name, bucket_name)
        tar_buffer = tarfile.open(fileobj=model_buffer)
        with TemporaryDirectory() as tempdir:
            tar_buffer.extractall(tempdir)
            nlp = spacy.load(tempdir)
    else:
        nlp = spacy.load(path)
    return nlp


class NERFactory:
    @staticmethod
    def create(model_type: str, model_location: str) -> 'AbstractNER':
        if model_type == "spacy":
            return SpacyNER(model_location)
        elif model_type == "huggingface":
            return HuggingFaceNER()
        else:
            raise ValueError(f"Unknown model type: {model_type}")


class AbstractNER(ABC):

    @abstractmethod
    def __init__(self, model_location: str):
        """
        Initializes the inference model with the specified model name.

        :param model_location: The name of the model to load.
        """
        pass

    @abstractmethod
    def predict(self, text: str) -> list[NESpan]:
        """
        Predicts the named entities in the given text.

        :param text: The input text to analyze.
        :return: A list of named entities found in the text.
        """
        pass

    @abstractmethod
    def bulk_predict(self, texts: list[str], batch_size: int) -> list[list[NESpan]]:
        """
        Predicts named entities for a list of texts.

        :param texts: A list of input texts to analyze.
        :param batch_size: Batch size for processing the texts.
        :return: A list of lists, where each inner list contains named entities for the corresponding text.
        """
        pass

    @abstractmethod
    def bulk_predict_as_tuples(self, text__context: list[tuple[str, Any]], batch_size: int) -> tuple[list[list[NESpan]], Any]:
        """
        Predicts named entities for a list of texts with additional context information.

        :param text__context: A list of input texts to analyze. Each text is paired with additional context information.
        :param batch_size: Batch size for processing the texts.
        :return: A tuple containing a list of lists of named entities and additional context information.
        """
        pass


class SpacyNER(AbstractNER):

    def __init__(self, model_location: str):
        self.__ner = load_spacy_model(model_location)

    @staticmethod
    def __doc_to_ne_spans(doc) -> list[NESpan]:
        ne_doc = NEDoc(doc.text)
        return [NESpan(ne_doc, ent.start_char, ent.end_char, ent.label_) for ent in doc.ents]

    def predict(self, text: str) -> list[NESpan]:
        return self.__doc_to_ne_spans(self.__ner(text))

    def bulk_predict(self, texts: list[str], batch_size: int) -> list[list[NESpan]]:
        return [self.__doc_to_ne_spans(doc) for doc in self.__ner.pipe(texts, batch_size=batch_size)]

    def bulk_predict_as_tuples(self, text__context: list[tuple[str, Any]], batch_size: int) -> tuple[list[list[NESpan]], Any]:
        ret = []
        for doc__context in self.__ner.pipe(text__context, batch_size=batch_size, as_tuples=True):
            doc, context = doc__context
            ret.append((self.__doc_to_ne_spans(doc), context))
        return ret


class HuggingFaceNER(AbstractNER):

    def __init__(self, model_location: str):
        pass
