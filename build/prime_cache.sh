#!/usr/bin/env bash

curl http://localhost/api/texts/Genesis.1 > /dev/null &
curl http://localhost/ > /dev/null &
curl http://localhost/api/name/stam > /dev/null &
curl http://localhost/api/name/stam?ref_only=1 > /dev/null &
curl http://localhost/api/name/%D7%A1%D7%AA%D7%9D?ref_only=1 > /dev/null &
curl http://localhost/api/name/%D7%A1%D7%AA%D7%9D > /dev/null &
curl http://localhost/api/counts/links/Tanach/Bavli > /dev/null &
curl http://localhost/api/preview/Zohar > /dev/null &