"""
local_settings_pytest.py -- Mongo endpoint for the local, decoupled pytest run.

Only the three Mongo settings are defined here. sefaria/conftest.py imports this
module directly (see the block above the `from sefaria.system.database import
QueryCounter` line) and applies these three values to `sefaria.settings` *before*
sefaria.system.database is first imported, since database.py opens its MongoClient
at import time from module-level constants.

This file intentionally does not touch DATABASES, CACHES, or any other setting --
those keep coming from whatever local_settings.py / local_settings_example.py the
developer already has, via the normal sefaria/settings.py load path.

MONGO_HOST/MONGO_PORT MUST stay loopback. This file backs a local mongod restored
from Sefaria's public dump_small.tar.gz for a one-off decoupling investigation; it
must never be pointed at a shared or cluster Mongo, which the suite would mutate.
"""
import os as _os

MONGO_HOST = "127.0.0.1"
MONGO_PORT = 27018
# LOCAL_TEST_DB_NAME selects which local database the suite runs against --
# "sefaria" for the full restored dump, "sefaria_min" for the generated
# minimal dataset. Both live on the same loopback mongod.
SEFARIA_DB = _os.environ.get("LOCAL_TEST_DB_NAME", "sefaria")
SEFARIA_DB_USER = ""
SEFARIA_DB_PASSWORD = ""
