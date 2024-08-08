from dataclasses import dataclass

@dataclass
class AbstractHistoryChange:
    uid: int
    method: str  # ("API" or "Site")

@dataclass
class LinkChange(AbstractHistoryChange):
    raw_link: dict

@dataclass
class VersionChange(AbstractHistoryChange):
    raw_version: dict
    patch: bool
    skip_links: bool
    count_after: int

