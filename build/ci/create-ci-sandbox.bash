#!/bin/bash

# Example Invocation

# GCP_PROJECT=development-205018 \
# GIT_COMMIT=deadbeef \
# GKE_CLUSTER=cluster-1 \
# GKE_NAMESPACE=default \
# GKE_REGION=us-east1-b \
# MONGO_HOST=mongo \
# POSTGRES_HOST=postgres \
# SANDBOX_NAME=deadbeef \
# SANDBOX_SUBDOMAIN=cauldron \
# ./create-ci-sandbox.bash


gcpProject=${GCP_PROJECT:?Set GCP_PROJECT and re-run.}
gkeCluster=${GKE_CLUSTER:?Set GKE_CLUSTER and re-run.}
gkeRegion=${GKE_REGION:?Set GKE_REGION and re-run.}
mongoHostName=${MONGO_HOST:?Set MONGO_HOST and re-run.}
sandboxSubdomain=${SANDBOX_SUBDOMAIN:?Set SANDBOX_SUBDOMAIN and re-run.}
#sanboxName=${SANDBOX_NAME:?Set SANDBOX_NAME and re-run.}
gitCommit=${GITHUB_SHA:?Set GITHUB_SHA and re-run.}
gkeNamespace=${GKE_NAMESPACE:?Set GKE_NAMESPACE and re-run.}
postgresHostName=${POSTGRES_HOST:?Set POSTGRES_HOST and re-run.}
gitRepoName=${GITHUB_REPOSITORY:-'Sefaria/Sefaria-Project'}

mongoLoad="true"
mongoDumpName="latest"
mongoDatabaseName="sefaria-ci-${gitCommit:0:6}"
isSandbox="true"
resourceAllocation="small"


#--------
# Create Cloud Builder variables
substVars=()
substVars+=("_RESOURCE_ALLOCATION=$resourceAllocation")
substVars+=("_ENV_NAME=${gitCommit:0:6}")
substVars+=("_GIT_COMMIT=${gitCommit}")
substVars+=("_GIT_REPO=$gitRepoName")
substVars+=("_GKE_CLUSTER=$gkeCluster")
substVars+=("_GKE_NAMESPACE=$gkeNamespace")
substVars+=("_GKE_REGION=$gkeRegion")
substVars+=("_IS_SANDBOX=$isSandbox")
substVars+=("_MONGO_HOST=$mongoHostName")
substVars+=("_MONGO_DATABASE=$mongoDatabaseName")
substVars+=("_MONGO_LOAD=$mongoLoad")
substVars+=("_MONGO_SNAPSHOT_LOCATION=$mongoDumpName")
substVars+=("_POSTGRES_HOST=$postgresHostName")
substVars+=("_SANDBOX_SUBDOMAIN=$sandboxSubdomain")
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

echo "Substitution String:"
echo $substStr

# Invoke `gcloud builds submit` to kick off the build
#pwd
#ls 
#ls -l

gcloud builds submit --no-source --config ./build/ci/ci-sandbox.yaml \
  --substitutions $substStr \
  --project $gcpProject \
  --verbosity debug \
  --async
