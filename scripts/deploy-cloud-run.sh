#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <service-name> <region> <project-id>"
  echo "Example: $0 docuwhisper-api us-central1 my-gcp-project"
  echo ""
  echo "Optional environment variables (consumed at build time):"
  echo "  VITE_POSTHOG_KEY   PostHog project key (phc_...). Without it, analytics is disabled."
  echo "  VITE_POSTHOG_HOST  PostHog host (default: https://us.i.posthog.com)."
  exit 1
fi

SERVICE_NAME="$1"
REGION="$2"
PROJECT_ID="$3"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:$(git rev-parse --short HEAD 2>/dev/null || date +%s)"

ENV_FILE=".env.production"
CREATED_ENV_FILE=0
cleanup() {
  if [ "${CREATED_ENV_FILE}" -eq 1 ] && [ -f "${ENV_FILE}" ]; then
    rm -f "${ENV_FILE}"
  fi
}
trap cleanup EXIT

if [ -n "${VITE_POSTHOG_KEY:-}" ]; then
  if [ -f "${ENV_FILE}" ]; then
    echo "[deploy] ${ENV_FILE} already exists; leaving it in place."
  else
    echo "[deploy] Writing ${ENV_FILE} from shell env (will be removed after build)"
    {
      printf 'VITE_POSTHOG_KEY=%s\n' "${VITE_POSTHOG_KEY}"
      printf 'VITE_POSTHOG_HOST=%s\n' "${VITE_POSTHOG_HOST:-https://us.i.posthog.com}"
    } > "${ENV_FILE}"
    CREATED_ENV_FILE=1
  fi
else
  echo "[deploy] WARNING: VITE_POSTHOG_KEY not set. Analytics will be disabled in this build."
fi

gcloud config set project "${PROJECT_ID}" >/dev/null

echo "[deploy] Building image ${IMAGE}"
gcloud builds submit --tag "${IMAGE}" .

DEPLOY_ENV_FLAGS=()
if [ -n "${VITE_POSTHOG_KEY:-}" ]; then
  DEPLOY_ENV_FLAGS+=(
    "--update-env-vars=VITE_POSTHOG_KEY=${VITE_POSTHOG_KEY},VITE_POSTHOG_HOST=${VITE_POSTHOG_HOST:-https://us.i.posthog.com}"
  )
fi

echo "[deploy] Deploying ${SERVICE_NAME} to Cloud Run (${REGION})"
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  ${DEPLOY_ENV_FLAGS[@]+"${DEPLOY_ENV_FLAGS[@]}"}

echo "[deploy] Done"
