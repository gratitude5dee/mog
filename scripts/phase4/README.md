# Phase 4 Staging Rollout Toolkit

This folder contains staging-first rollout tooling for:

- Iteration A: baseline deploy + acceptance gates
- Iteration B: canary metrics + go/no-go readiness output

## Prerequisites

- Node.js 22 LTS recommended
- Supabase CLI installed and authenticated for the staging project
- Staging secrets available in your shell

## Quickstart

1. Validate env matrix:

```bash
node scripts/phase4/staging/check-env-matrix.mjs
```

2. Apply baseline migrations and deploy required functions:

```bash
SUPABASE_TARGET_ENV=staging bash scripts/phase4/staging/deploy-baseline.sh
```

3. Run acceptance gate:

```bash
STAGING_SUPABASE_URL="https://<project>.supabase.co" \
STAGING_SERVICE_ROLE_KEY="<service-role>" \
STAGING_FRONTEND_URL="https://<staging-host>" \
node scripts/phase4/staging/acceptance-gate.mjs
```

4. Run canary metrics check (Iteration B):

```bash
STAGING_SUPABASE_URL="https://<project>.supabase.co" \
STAGING_SERVICE_ROLE_KEY="<service-role>" \
X402_CANARY_WALLETS="0xabc...,0xdef..." \
node scripts/phase4/staging/canary-metrics.mjs
```

5. Generate go/no-go output:

```bash
node scripts/phase4/staging/generate-go-no-go.mjs
```

## Expected Artifacts

Scripts write reports to `memory/`:

- `phase4-env-matrix-*.json`
- `phase4-acceptance-report-*.json`
- `phase4-acceptance-report-*.md`
- `phase4-canary-report-*.json`
- `phase4-canary-report-*.md`
- `phase4-go-no-go-*.md`
