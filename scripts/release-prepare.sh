#!/bin/bash
set -euo pipefail

# Called by @semantic-release/exec during the prepare phase.
# Gates on BUILD_IMAGES=true so existing workflows (release.yml) are unaffected.

VERSION="$1"

if [[ "${BUILD_IMAGES:-}" != "true" ]]; then
  echo "BUILD_IMAGES not set — skipping image build"
  exit 0
fi

if [[ -z "${IMAGE_REGISTRY:-}" || -z "${IMAGE_NAME:-}" ]]; then
  echo "ERROR: IMAGE_REGISTRY and IMAGE_NAME must be set"
  exit 1
fi

TAG="v${VERSION}"

echo "Building images with tag ${TAG}"

# Build web and node in parallel
pids=()

docker buildx build --push \
  --build-arg TYPE=build-prod \
  --cache-from "type=registry,ref=${IMAGE_REGISTRY}/${IMAGE_NAME}-web:cache" \
  --cache-to "type=registry,ref=${IMAGE_REGISTRY}/${IMAGE_NAME}-web:cache,mode=max" \
  -t "${IMAGE_REGISTRY}/${IMAGE_NAME}-web:${TAG}" \
  -f build/web/Dockerfile \
  . &
pids+=($!)

docker buildx build --push \
  --build-arg TYPE=build-prod \
  --cache-from "type=registry,ref=${IMAGE_REGISTRY}/${IMAGE_NAME}-node:cache" \
  --cache-to "type=registry,ref=${IMAGE_REGISTRY}/${IMAGE_NAME}-node:cache,mode=max" \
  -t "${IMAGE_REGISTRY}/${IMAGE_NAME}-node:${TAG}" \
  -f build/node/Dockerfile \
  . &
pids+=($!)

# Wait for parallel builds
failed=0
for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    failed=1
  fi
done

if [[ $failed -ne 0 ]]; then
  echo "ERROR: One or more parallel builds failed"
  exit 1
fi

# Asset image depends on web image
docker buildx build --push \
  --build-arg "SRC_IMG=${IMAGE_REGISTRY}/${IMAGE_NAME}-web:${TAG}" \
  --cache-from "type=registry,ref=${IMAGE_REGISTRY}/${IMAGE_NAME}-asset:cache" \
  --cache-to "type=registry,ref=${IMAGE_REGISTRY}/${IMAGE_NAME}-asset:cache,mode=max" \
  -t "${IMAGE_REGISTRY}/${IMAGE_NAME}-asset:${TAG}" \
  -f build/asset/Dockerfile \
  .

echo "All images built and pushed successfully"
