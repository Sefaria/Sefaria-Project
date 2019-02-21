#!/usr/bin/env bash

echo "Started cache priming on $(hostname)"
curl -s http://localhost/api/texts/Genesis.1 > /dev/null &
curl -s http://localhost/ > /dev/null &
curl -s http://localhost/api/name/stam > /dev/null &
curl -s http://localhost/api/name/stam?ref_only=1 > /dev/null &
curl -s http://localhost/api/name/%D7%A1%D7%AA%D7%9D?ref_only=1 > /dev/null &
curl -s http://localhost/api/name/%D7%A1%D7%AA%D7%9D > /dev/null &
curl -s http://localhost/api/preview/Zohar > /dev/null &
#curl -s http://localhost/api/counts/links/Tanach/Bavli > /dev/null &
#curl -s http://localhost/api/texts/version-status/tree/ > /dev/null &
#curl -s http://localhost/api/texts/version-status/tree/he > /dev/null &
#curl -s http://localhost/api/texts/version-status/tree/en > /dev/null &

echo "Completed cache priming on $(hostname)"
