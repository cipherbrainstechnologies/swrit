#!/usr/bin/env bash
# Redeploy the OpenMontage studio worker on Railway (handles studio.render only).
# Run on your machine after: railway login && railway link (dear-swritsinh / production).
set -euo pipefail

SERVICE_NAME="${RAILWAY_OPENMONTAGE_SERVICE:-studio-worker}"

echo "Link the OpenMontage worker service (name on Railway is often '${SERVICE_NAME}')."
echo "In the dashboard: service → Settings → Config-as-code → railway.openmontage.json"
echo ""

if ! command -v railway >/dev/null 2>&1; then
  echo "Install: npm install -g @railway/cli"
  exit 1
fi

railway service "$SERVICE_NAME" 2>/dev/null || true

echo "Triggering redeploy from linked branch (main)…"
railway redeploy -y

echo ""
echo "After the build finishes, verify Chromium inside the running container:"
echo "  railway ssh -- test -x /usr/bin/chromium && printenv REMOTION_BROWSER_EXECUTABLE"
echo "Expected: /usr/bin/chromium"
echo ""
echo "Optional: confirm the worker claims studio.render:"
echo "  railway ssh -- printenv WORKER_JOB_TYPES"
