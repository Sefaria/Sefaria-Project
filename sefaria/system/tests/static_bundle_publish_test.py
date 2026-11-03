import os

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
NGINX_TEMPLATE = os.path.join(REPO_ROOT, "helm-chart", "sefaria", "conf", "nginx.template.conf.tpl")
STATIC_LOCATION = "location /static/ {"
SERVER_BUNDLE_DENY = "location ~ ^/static/bundles/server/ {"
SOURCE_MAP_DENY = "location ~* ^/static/bundles/(?!linker\\.v3/).*\\.map$ {"


@pytest.fixture(scope="module")
def nginx_template():
    with open(NGINX_TEMPLATE, encoding="utf-8") as f:
        return f.read()


def test_static_alias_refuses_server_bundle_and_source_maps(nginx_template):
    static_blocks = nginx_template.count(STATIC_LOCATION)
    assert static_blocks >= 1
    start = 0
    for _ in range(static_blocks):
        index = nginx_template.index(STATIC_LOCATION, start)
        preceding = nginx_template[max(0, index - 400):index]
        assert SERVER_BUNDLE_DENY in preceding
        assert SOURCE_MAP_DENY in preceding
        start = index + len(STATIC_LOCATION)
