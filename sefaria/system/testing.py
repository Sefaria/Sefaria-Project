# -*- coding: utf-8 -*-

import os
import secrets

test_uid = os.getenv("DEPLOY_ENV", secrets.token_hex(3))
