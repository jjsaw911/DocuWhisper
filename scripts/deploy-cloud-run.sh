#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <service-name> <region> <project-id>"
  echo "Example: $0 docuwhisper-api us-central1 my-gcp-project"
  exit 1
fi

SERVICE_NAME="$1"
REGION="$2"
PROJECT_ID="$3"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:$(git rev-parse --short HEAD 2>/dev/null || date +%s)"

gcloud config set project "${PROJECT_ID}" >/dev/null

echo "[deploy] Building image ${IMAGE}"
gcloud builds submit --tag "${IMAGE}" .

echo "[deploy] Deploying ${SERVICE_NAME} to Cloud Run (${REGION})"
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080

echo "[deploy] Done"
