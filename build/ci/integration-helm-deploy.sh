#!/bin/bash
set -x
set -e

export WEB_IMAGE="us-east1-docker.pkg.dev/$PROJECT_ID/containers/sefaria-web-$BRANCH"
export NODE_IMAGE="us-east1-docker.pkg.dev/$PROJECT_ID/containers/sefaria-node-$BRANCH"
export ASSET_IMAGE="us-east1-docker.pkg.dev/$PROJECT_ID/containers/sefaria-asset-$BRANCH"
export TAG="sha-$GIT_COMMIT"
export NAME="integration-$GIT_COMMIT"

yq e -i '.web.containerImage.imageRegistry = strenv(WEB_IMAGE)' $1
yq e -i '.nodejs.containerImage.imageRegistry = strenv(NODE_IMAGE)' $1
yq e -i '.nginx.containerImage.imageRegistry = strenv(ASSET_IMAGE)' $1
yq e -i '.monitor.containerImage.imageRegistry = strenv(WEB_IMAGE)' $1
yq e -i '.web.containerImage.tag = strenv(TAG)' $1
yq e -i '.nodejs.containerImage.tag = strenv(TAG)' $1
yq e -i '.nginx.containerImage.tag = strenv(TAG)' $1
yq e -i '.monitor.containerImage.tag = strenv(TAG)' $1
yq e -i '.deployEnv = strenv(NAME)' $1
yq e -i '.secrets.localSettings.data.SEFARIA_DB = "sefaria-integration"' $1
yq e -i '.ingress.hosts[0].host = strenv(GIT_COMMIT)+".integration.sefaria.org"' $1
yq e -i '.localSettings.FRONT_END_URL = "https://"+strenv(GIT_COMMIT)+".integration.sefaria.org"' $1

helm upgrade -i $NAME ./helm-chart/sefaria --namespace $NAMESPACE -f $1 --debug --timeout=30m0s

