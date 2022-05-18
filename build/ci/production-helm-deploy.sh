#!/bin/bash
set -x
set -e

export WEB_IMAGE="gcr.io/$PROJECT_ID/sefaria-web"
export NODE_IMAGE="gcr.io/$PROJECT_ID/sefaria-node"
export ASSET_IMAGE="gcr.io/$PROJECT_ID/sefaria-asset"
export TAG="$GIT_COMMIT"

yq e -i '.web.containerImage.imageRegistry = strenv(WEB_IMAGE)' $1
yq e -i '.nodejs.containerImage.imageRegistry = strenv(NODE_IMAGE)' $1
yq e -i '.nginx.containerImage.imageRegistry = strenv(ASSET_IMAGE)' $1
yq e -i '.monitor.containerImage.imageRegistry = strenv(WEB_IMAGE)' $1
yq e -i '.web.containerImage.tag = strenv(TAG)' $1
yq e -i '.nodejs.containerImage.tag = strenv(TAG)' $1
yq e -i '.nginx.containerImage.tag = strenv(TAG)' $1
yq e -i '.monitor.containerImage.tag = strenv(TAG)' $1

helm repo add sefaria-project https://sefaria.github.io/sefaria-project
helm upgrade -i production sefaria-project/sefaria-project --version $CHART_VERSION --namespace $NAMESPACE -f $1 --debug --timeout=30m0s

