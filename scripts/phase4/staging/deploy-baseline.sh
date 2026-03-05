#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

if [[ "${SUPABASE_TARGET_ENV:-}" != "staging" ]]; then
  echo "Refusing to run without SUPABASE_TARGET_ENV=staging"
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI not found. Install it and login before running this script."
  exit 1
fi

required_migrations=(
  "20260305101500_phase1_stability_walletproof.sql"
  "20260305120000_phase3_bot_scheduler.sql"
  "20260305200000_phase4_ops_observability.sql"
)

required_functions=(
  "mog-feed"
  "mog-upload"
  "mog-interact"
  "content-interact"
  "engagement-pay"
  "wallet-proof"
  "pay-stream"
  "get-stream"
  "stream-session-active"
  "moltbook-auth"
  "moltbook-interact"
  "bot-autopilot"
)

for migration in "${required_migrations[@]}"; do
  if [[ ! -f "supabase/migrations/$migration" ]]; then
    echo "Missing migration file: supabase/migrations/$migration"
    exit 1
  fi
done

echo "Applying pending migrations to linked staging project..."
supabase db push

echo "Deploying required edge functions..."
for fn in "${required_functions[@]}"; do
  echo "Deploying: $fn"
  supabase functions deploy "$fn"
done

echo "Baseline staging deploy complete."
