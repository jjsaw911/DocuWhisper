# DocuWhisper on Google Cloud Run

This deployment path removes runtime dependency on Replit hosting.

## 1) Prerequisites

- Google Cloud project with billing enabled
- `gcloud` CLI installed and authenticated
- Domain (for example `docuwhisper.com`) managed in Cloud DNS or another DNS provider

Enable required services:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com
```

## 2) Configure environment values

Copy and fill:

```bash
cp .env.google.example .env.google
```

At minimum configure:

- `DATABASE_URL`
- `SESSION_SECRET`
- `OPENAI_API_KEY`
- `APP_BASE_URL=https://docuwhisper.com`
- `MOBILE_TEST_LOGIN_ENABLED=true`
- `MOBILE_TEST_USERNAME`
- `MOBILE_TEST_PASSWORD`

For non-Replit web auth, set:

- `LOCAL_AUTH_ENABLED=true`
- `LOCAL_AUTH_USERNAME`
- `LOCAL_AUTH_PASSWORD`

For Stripe on Google, set:

- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`

## 3) Build and deploy

From repo root:

```bash
./scripts/deploy-cloud-run.sh docuwhisper-api us-central1 YOUR_PROJECT_ID
```

## 4) Set Cloud Run environment variables/secrets

Set non-secret env vars:

```bash
gcloud run services update docuwhisper-api \
  --region us-central1 \
  --set-env-vars NODE_ENV=production,APP_BASE_URL=https://docuwhisper.com,MOBILE_TEST_LOGIN_ENABLED=true,LOCAL_AUTH_ENABLED=true,MOBILE_AUTH_REDIRECT_ALLOWLIST=docuwhisper://auth/callback
```

Use Secret Manager for sensitive values:

```bash
echo -n "REPLACE_ME" | gcloud secrets create SESSION_SECRET --data-file=-
echo -n "sk-..." | gcloud secrets create OPENAI_API_KEY --data-file=-
```

Attach secrets to Cloud Run:

```bash
gcloud run services update docuwhisper-api \
  --region us-central1 \
  --set-secrets SESSION_SECRET=SESSION_SECRET:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest
```

## 5) Database migration/data move

- Create Cloud SQL Postgres
- Import your existing dump using `pg_restore`
- Point `DATABASE_URL` to Cloud SQL

## 6) Domain + HTTPS

- Map custom domain to Cloud Run service
- Set `APP_BASE_URL` to the final HTTPS domain

## 7) Apple review/mobile auth verification

Open:

```text
https://docuwhisper.com/api/mobile/auth/start?redirect_uri=docuwhisper://auth/callback
```

Expected behavior: tester credential login page appears (no Replit login).
