#!/bin/bash
set -x
set -e

export WEB_IMAGE="gcr.io/$PROJECT_ID/sefaria-web-$BRANCH"
export NODE_IMAGE="gcr.io/$PROJECT_ID/sefaria-node-$BRANCH"
export ASSET_IMAGE="gcr.io/$PROJECT_ID/sefaria-asset-$BRANCH"
export TAG="sha-$GIT_COMMIT"
export NAME="sandbox-$GIT_COMMIT"

yq e -i '.web.containerImage.imageRegistry = strenv(WEB_IMAGE)' $1
yq e -i '.nodejs.containerImage.imageRegistry = strenv(NODE_IMAGE)' $1
yq e -i '.nginx.containerImage.imageRegistry = strenv(ASSET_IMAGE)' $1
yq e -i '.monitor.containerImage.imageRegistry = strenv(WEB_IMAGE)' $1
yq e -i '.web.containerImage.tag = strenv(TAG)' $1
yq e -i '.nodejs.containerImage.tag = strenv(TAG)' $1
yq e -i '.nginx.containerImage.tag = strenv(TAG)' $1
yq e -i '.monitor.containerImage.tag = strenv(TAG)' $1
yq e -i '.deployEnv = strenv(NAME)' $1
yq e -i '.localSettings.FRONT_END_URL = "https://"+strenv(NAME)+".cauldron.sefarai.org"' $1

helm upgrade -i $NAME ./helm-chart --namespace $NAMESPACE -f $1 --debug --timeout=30m0s

