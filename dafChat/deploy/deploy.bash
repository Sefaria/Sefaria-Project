#!/bin/bash

# Example invocations
# deploy.bash -n test -c cluster-1 -s default -r us-east1-b -p development-205018 


###################
# Variable Defaults
###################

envName=""
gkeCluster=cluster-1
gkeNamespace=default
gkeRegion=us-east1-b
gcpProject=development-205018 
sefariaHost="sefaria.org"
echo $sefariaHost

######
# Override defaults using command-line flags

args=`getopt n:p:c:d:s:r: $*`
if [ $? != 0 ]
then
  echo 'Look at the README for usage instructions.'
  exit 2
fi
set -- $args

for i
do
  case "$i"
  in
    # Name slug
    -n)
      envName="$2"; shift; shift;;
    
    # gke cluster name
    -c)
      gkeCluster="$2"; shift; shift;;
   
    # gke namespace
    -s)
      gkeNamespace="$2"; shift; shift;;

    # hostname of the sefaria host
    -d)
      sefariaHost="$2"; shift; shift;;

    # gke region
    -r)
      gkeRegion="$2"; shift; shift;;
    
    # gcp project
    -p) 
      gcpProject="$2"; shift; shift;;
  esac
done

echo $sefariaHost

imageTag=`git rev-parse --verify HEAD --short=6`

substVars=()
substVars+=("_GKE_CLUSTER=$gkeCluster")
substVars+=("_GKE_NAMESPACE=$gkeNamespace")
substVars+=("_GKE_REGION=$gkeRegion")
substVars+=("_ENV_NAME=$envName")
substVars+=("_IMAGE_TAG=$imageTag")
substVars+=("_SEFARIA_HOST=$sefariaHost")
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
gcloud builds submit ./ --config ./deploy/cloudbuild.yaml \
  --substitutions $substStr \
  --project $gcpProject \
  --verbosity debug \
  --async

