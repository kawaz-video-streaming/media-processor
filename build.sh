#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-media-processor}"
TAG="${TAG:-latest}"
FULL_IMAGE="${IMAGE_NAME}:${TAG}"

echo "Building Docker image: ${FULL_IMAGE}"
docker build \
  --tag "${FULL_IMAGE}" \
  --file Dockerfile \
  .

echo "Build complete: ${FULL_IMAGE}"
