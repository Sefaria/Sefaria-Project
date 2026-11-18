"""Django admin for the portal: one module per area (contract C1). Importing this package
registers them; Django's admin autodiscovery imports it."""

from . import routing  # noqa: F401
