# Phase 4 Rollback Drill (Staging)

## Required Drill 1: x402 rollback to legacy

1. Set frontend canary variant `VITE_X402_MODE=legacy`.
2. Set edge secret `X402_MODE=legacy`.
3. Re-run:
   - `pay-stream` legacy payment check
   - `stream-session-active` restore check
4. Save evidence:
   - API response JSON
   - timestamp
   - operator name

## Required Drill 2: Scheduler rollback

1. Set edge secret `BOT_AUTOPILOT_ENABLED=false`.
2. Call `bot-autopilot` with service role token.
3. Verify response:
   - HTTP `403`
   - `error=bot_autopilot_disabled`
4. Confirm API endpoints remain callable manually:
   - `moltbook-interact`
   - `mog-upload`
   - `engagement-pay`

## Required Drill 3: Payout abuse rollback

1. For abuse-prone action types (`like`, `comment`, `bookmark`), set:
   - `token_config.is_enabled=false`
2. Call `engagement-pay` for one action and verify:
   - `error=payout_disabled`
   - `skipped=true`
3. Restore flags to enabled when drill completes.

## Evidence Format

Store a markdown artifact in `memory/`:

- incident/drill id
- start/end timestamp
- commands run
- API responses
- pass/fail result per drill
