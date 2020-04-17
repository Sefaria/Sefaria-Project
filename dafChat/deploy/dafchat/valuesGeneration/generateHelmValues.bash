#!/bin/bash

# Example invocation

# - 'IMAGE_NAME=gcr.io/${PROJECT_ID}/sefaria-dafchat-turn'
# - 'IMAGE_TAG=${_IMAGE_TAG}'
# - 'DEPLOY_ENV=${_ENV_NAME}'

# Make sure the required variables have been passed in
if [[ -z "${DEPLOY_ENV}" ]]; then
  echo "Please set DEPLOY_ENV and re-run the script"
  exit 1
fi

if [[ -z "${IMAGE_TAG}" ]]; then
  echo "Please set IMAGE_TAG and re-run the script"
  exit 1
fi

if [[ -z "${IMAGE_NAME_COTURN}" ]]; then
  echo "Please set IMAGE_NAME_COTURN and re-run the script"
  exit 1
fi

if [[ -z "${IMAGE_NAME_RTC}" ]]; then
  echo "Please set IMAGE_NAME_RTC and re-run the script"
  exit 1
fi

if [[ -z "${SEFARIA_HOST}" ]]; then
  echo "Please set SEFARIA_HOST and re-run the script"
  exit 1
fi


export TURN_USER=`openssl rand -hex 8`
export TURN_SECRET=`openssl rand -hex 20`

# Using template, generate Helm Configs file
echo "[INFO] Substituting values..."
envsubst '${DEPLOY_ENV},${IMAGE_NAME_RTC},${IMAGE_NAME_COTURN},${IMAGE_TAG},${TURN_USER},${TURN_SECRET},${SEFARIA_HOST}' \
  < ./values.tmpl.yaml > ./_generatedHelmValues.yaml
echo "[INFO] Subsitution occured successfully."

cat ./_generatedHelmValues.yaml
echo $PWD
