#!/bin/bash

# clone k8s-admin

# run destroy sandbox script

gcpProject=${GCP_PROJECT:?Set GCP_PROJECT and re-run.}
gkeCluster=${GKE_CLUSTER:?Set GKE_CLUSTER and re-run.}
gkeRegion=${GKE_REGION:?Set GKE_REGION and re-run.}
sandboxSubdomain=${SANDBOX_SUBDOMAIN:?Set SANDBOX_SUBDOMAIN and re-run.}
gitCommit=${GITHUB_SHA:?Set GITHUB_SHA and re-run.} # GITHUB_SHA is automatically added to the env by GHA
gkeNamespace=${GKE_NAMESPACE:?Set GKE_NAMESPACE and re-run.}
mongoHostName=${MONGO_HOST:?Set MONGO_HOST and re-run.}
mongoDatabaseName="sefaria-ci-${gitCommit:0:6}"

#--------
# Create Cloud Builder variables
substVars=()
substVars+=("_GKE_CLUSTER=$gkeCluster")
substVars+=("_GKE_NAMESPACE=$gkeNamespace")
substVars+=("_GKE_REGION=$gkeRegion")
substVars+=("_SANDBOX_NAME=${gitCommit:0:6}")
substVars+=("_SANDBOX_SUBDOMAIN=$sandboxSubdomain")
# substVars+=("_MONGO_HOST=$mongoHostName")         # Todo: delete db 
# substVars+=("_MONGO_DATABASE=$mongoDatabaseName")
#substVars+=("")
#...

# Concatenate the variable strings
substStr=""
for var in ${substVars[@]}; do
  substStr+=",$var"
done
substStr=${substStr:1} # Omit the leading comma

# Print each variable:
for var in ${substVars[@]}; do 
  echo $var
done

# Invoke `gcloud builds submit` to kick off the build
gcloud builds submit --no-source --config ./build/ci/destroySandbox.yaml \
  --substitutions $substStr \
  --project $gcpProject \
  --verbosity debug \
  --async
