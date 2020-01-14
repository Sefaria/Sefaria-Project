import os
from sefaria.envvar_settings import getEnvVarBinary, getEnvVarString
# TODO: Allow engineers to changes these with ENVVARS or manually

# ------------
# Messaging
# ------------
# SEFARIA__GLOBALMSG_MAINTENANCE_ENABLED
# SEFARIA__GLOBALMSG_MAINTENANCE_MESSAGE
# SEFARIA__GLOBALMSG_WARNING_ENABLED
# SEFARIA__GLOBALMSG_WARNING_MESSAGE
# SEFARIA__GLOBALMSG_INTERRUPT_ENABLED
# SEFARIA__GLOBALMSG_INTERRUPT_MESSAGE
DOWN_FOR_MAINTENANCE = getEnvVarBinary("SEFARIA__GLOBALMSG_MAINTENANCE_ENABLED")
MAINTENANCE_MESSAGE =  getEnvVarString("SEFARIA__GLOBALMSG_MAINTENANCE_MESSAGE")
GLOBAL_WARNING = getEnvVarBinary("SEFARIA__WARNING_ENABLED")
GLOBAL_WARNING_MESSAGE = getEnvVarString("SEFARIA__GLOBALMSG_MAINTENANCE_MESSAGE")
GLOBAL_INTERRUPTING_MESSAGE = getEnvVarBinary("SEFARIA__GLOBALMSG_MAINTENANCE_ENABLED")
GLOBAL_INTERRUPTING_MESSAGE = {
    "name":       "endOfYear-2019-4",
    "repetition": 1,
    "style":      "modal",
    "condition": {"returning_only": True, "desktop_only": False, "english_only": False, "debug": False}
}