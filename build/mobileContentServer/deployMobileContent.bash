#!/bin/bash

# Process envvars
envName=${ENV_NAME:?ENV_NAME must be set}
gcpProject=${GCP_PROJECT:?GCP_PROJECT must be set}
gkeCluster=${GKE_CLUSTER:?GKE_CLUSTER must be set}
gkeNamespace=${GKE_NAMESPACE:? GKE_NAMESPACE must be set}
subdomain=${SUBDOMAIN:?SUBDOMAIN must be set}

randStub=$(date | md5sum | head -c 12)

#----------------
# Create Cloud Builder variables

substVars=()
substVars+=("_ENV_NAME=$envName")
substVars+=("_GKE_CLUSTER=$gkeCluster")
substVars+=("_GKE_NAMESPACE=$gkeNamespace")
substVars+=("_SUBDOMAIN=$subdomain")
substVars+=("_SHARED_TOKEN=$randStub")

#-------------------
# Concatenate the variable strings
substStr=""
for var in ${substVars[@]}; do
  substStr+=",$var"
done

echo
# Print each variable:
for var in ${substVars[@]}; do 
  echo $var
done
echo
substStr=${substStr:1} # Omit the leading comma
echo $substStr


gcloud builds submit ../../ \
  --config ./cloudbuild.yaml \
  --substitutions $substStr \
  --verbosity debug \
  --async \
  --project $gcpProject
