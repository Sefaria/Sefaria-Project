import os
import re
import secrets

# Suffix for objects tests create, so concurrent runs against one database do not collide.
# It ends up in Index titles, which may not contain ":.-\\/" (Index._validate), and CI sets
# DEPLOY_ENV to "sandbox-<sha>", so keep only letters and digits.
test_uid = re.sub(r"[^A-Za-z0-9]", "", os.getenv("DEPLOY_ENV") or "") or secrets.token_hex(3)
