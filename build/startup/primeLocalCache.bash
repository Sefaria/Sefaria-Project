#!/bin/bash

targetHostname=${TARGET_HOSTNAME:-localhost}

# Define list of endpoints to query before the pods head into service
urlsToPrime=(
    "/api/texts/Genesis.1"
    "/"
    "/api/name/stam"
    "/api/name/stam?ref_only=1"
    "/api/name/%D7%A1%D7%AA%D7%9D?ref_only=1"
    "/api/name/%D7%A1%D7%AA%D7%9D"
    "/api/preview/Zohar"
)

for url in "${urlsToPrime[@]}"; do 
    echo $targetHostname$url; 
    curl -s -k -o /dev/null $targetHostname$url; 
done
# for url in "${urlsToPrime[@]}"; do curl -s $targetHostname$u $url; done
