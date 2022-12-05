#!/bin/bash
set -x
set -e

export WEB_IMAGE="gcr.io/$PROJECT_ID/$IMAGE_NAME-web"
export NODE_IMAGE="gcr.io/$PROJECT_ID/$IMAGE_NAME-node"
export ASSET_IMAGE="gcr.io/$PROJECT_ID/$IMAGE_NAME-asset"
export LINKER_IMAGE="gcr.io/$PROJECT_ID/$IMAGE_NAME-linker"
export TAG="$GIT_COMMIT"

yq e -i '.web.containerImage.imageRegistry = strenv(WEB_IMAGE)' $1
yq e -i '.linker.containerImage.imageRegistry = strenv(LINKER_IMAGE)' $1
yq e -i '.nodejs.containerImage.imageRegistry = strenv(NODE_IMAGE)' $1
yq e -i '.nginx.containerImage.imageRegistry = strenv(ASSET_IMAGE)' $1
yq e -i '.monitor.containerImage.imageRegistry = strenv(WEB_IMAGE)' $1
yq e -i '.web.containerImage.tag = strenv(TAG)' $1
yq e -i '.linker.containerImage.tag = strenv(TAG)' $1
yq e -i '.nodejs.containerImage.tag = strenv(TAG)' $1
yq e -i '.nginx.containerImage.tag = strenv(TAG)' $1
yq e -i '.monitor.containerImage.tag = strenv(TAG)' $1

helm repo add sefaria-project https://sefaria.github.io/Sefaria-Project
helm upgrade -i production sefaria-project/sefaria --version $CHART_VERSION --namespace $NAMESPACE -f $1 --debug --timeout=30m0s

