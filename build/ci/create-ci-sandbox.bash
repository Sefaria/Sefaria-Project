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
mongoDatabaseName=${MONGO_DATABASE:-sefaria-vecino}
sandboxSubdomain=${SANDBOX_SUBDOMAIN:?Set SANDBOX_SUBDOMAIN and re-run.}
#sanboxName=${SANDBOX_NAME:?Set SANDBOX_NAME and re-run.}
gitCommit=${GITHUB_SHA:?Set GITHUB_SHA and re-run.}
gkeNamespace=${GKE_NAMESPACE:?Set GKE_NAMESPACE and re-run.}
postgresHostName=${POSTGRES_HOST:?Set POSTGRES_HOST and re-run.}
gitRepoName=${GITHUB_REPOSITORY:-'Sefaria/Sefaria-Project'}

mongoLoad="true"
isSandbox="true"
resourceAllocation="small"

# TODO: 
# 1. Specify the k8s-admin branch  (if I want this to run without context)

############
# Set Infrastructure Defaults
############
# gcpProject=development-205018 
# gkeCluster=cluster-1
# gkeNamespace=default
# gkeRegion=us-east1-b
# mongoHostName=mongo
# sandboxSubdomain=cauldron

############
# Handle CLI Options
############

#-------
# Set CLI Defaults
# gitBranchName=master
# gitRepoName=Sefaria/Sefaria-Project # Assumes GitHub
# isSandbox="true"
# mongoDumpName=latest
# mongoLoad=false
# replicaCount=1
# resourceAllocation="small"
# envName=""
# postgresHostName=postgres

#-------
# Override defaults from commandline
# args=`getopt n:b:m:d:p:f:sr:o $*`
# if [ $? != 0 ]
# then
#   echo 'Look at the README for usage instructions.'
#   exit 2
# fi
# set -- $args

# for i
# do
#   case "$i"
#   in
#     # Name of the Sandbox
#     -n)
#       envName="$2"; shift; shift;;
#     # Name o the git branch
#     -b)
#       gitBranchName="$2"; shift; shift;;
#     -d)
#       mongoDumpName="$2"; shift; shift;;
#     -f)
#       gitRepoName="$2"; shift; shift;;
#     # -r defines the resource allocation for the web pods
#     # "small": is the default
#     # "medium":  
#     # "production": The allocation matches the production setup
#     -r)
#       resourceAllocation="$2"; shift; shift;;
#     -s) 
#       isSandbox="false"
#       gkeNamespace=default; shift;;
#     # Don't load a mongo table
#     -o)
#       mongoLoad="true"; shift;;
#     -m)
#       mongoHostName="$2"; shift; shift;;
#     -p)
#       postgresHostName="$2"; shift; shift;;
#   esac
# done

#--------
# Create Cloud Builder variables
substVars=()
substVars+=("_RESOURCE_ALLOCATION=$resourceAllocation")
substVars+=("_ENV_NAME=${gitCommit:0:6}")
substVars+=("_GIT_COMMIT=${gitCommit:0:6}")
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
pwd
ls 
ls -l
gcloud builds submit --no-source --config ./build/ci/ci-sandbox.yaml \
  --substitutions $substStr \
  --project $gcpProject \
  --verbosity debug \
  --async
