#!/bin/bash

# Wait for nginx to become available

# Define list of endpoints to query
urlsToPrime = (
    "a"
    "b"
    "c"
)

for url in "${urlsToPrime[@]}"; do echo $url; done