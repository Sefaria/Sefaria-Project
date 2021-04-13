#!/bin/bash

dateTag=$(date +"%Y%m%d%H%M%S")

docker build . \
-t  gcr.io/${GCP_PROJECT_PROD}/base-web:$dateTag \
-t  gcr.io/${GCP_PROJECT_PROD}/base-web:latest \
-t  gcr.io/${GCP_PROJECT_DEV}/base-web:$dateTag \
-t  gcr.io/${GCP_PROJECT_DEV}/base-web:latest \
-f ./build/base-web/Dockerfile &

docker build . \
-t  gcr.io/${GCP_PROJECT_PROD}/base-node:$dateTag \
-t  gcr.io/${GCP_PROJECT_PROD}/base-node:latest \
-t  gcr.io/${GCP_PROJECT_DEV}/base-node:$dateTag \
-t  gcr.io/${GCP_PROJECT_DEV}/base-node:latest \
-f ./build/base-node/Dockerfile &

wait

docker push gcr.io/${GCP_PROJECT_PROD}/base-web:$dateTag &
docker push gcr.io/${GCP_PROJECT_PROD}/base-node:$dateTag &

wait

#docker push gcr.io/${GCP_PROJECT_PROD}/base-web:$dateTag
docker push gcr.io/${GCP_PROJECT_PROD}/base-web:latest
docker push gcr.io/${GCP_PROJECT_DEV}/base-web:$dateTag
docker push gcr.io/${GCP_PROJECT_DEV}/base-web:latest


#docker push gcr.io/${GCP_PROJECT_PROD}/base-node:$dateTag
docker push gcr.io/${GCP_PROJECT_PROD}/base-node:latest
docker push gcr.io/${GCP_PROJECT_DEV}/base-node:$dateTag
docker push gcr.io/${GCP_PROJECT_DEV}/base-node:latest