from abc import ABC, abstractmethod

class AbstractResolvedEntity(ABC):
    
    @property
    @abstractmethod
    def is_ambiguous(self) -> bool:
        pass
    
    @property
    @abstractmethod
    def resolution_failed(self) -> bool:
        pass
    
    @property
    @abstractmethod
    def raw_entity(self) -> 'RawNamedEntity':
        pass
    
    @property
    def pretty_text(self) -> str:
        """
        Return a pretty version of the raw entity text for display purposes.
        :return: 
        """
        return self.raw_entity.text
    
    def _get_base_debug_span(self) -> dict:
        """
        Get the base debug span for this resolved entity.
        This includes all data that is common across all possible resolutions.
        :return: 
        """
        return {
            "text": self.raw_entity.text,
            "charRange": self.raw_entity.char_indices,
            "failed": self.resolution_failed,
            "ambiguous": self.is_ambiguous,
        }
    
    @abstractmethod
    def get_debug_spans(self) -> list[dict]:
        """
        Get debug spans for this resolved entity.
        Each span includes text, charRange, failed, and ambiguous fields.
        There is one span for each possible resolution. If the resolution failed, there is one span indicating failure.
        """
        pass
