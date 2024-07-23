from dataclasses import dataclass

@dataclass
class AbstractHistoryChange:
    uid: int
    method: str  # ("API" or "Site")

@dataclass
class LinkChange(AbstractHistoryChange):
    raw_link: dict
