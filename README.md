# Cerna Trading

## IBKR Daily Auto-Sync

A Trigger.dev scheduled task at `src/trigger/ibkr-daily-sync.ts` re-syncs every
user's IBKR Flex Query data once a day.

- **Schedule:** `0 21 * * *` UTC (07:00 AEST, after ASX EOD + IBKR Flex
  statement generation lag)
- **Deploy:** runs via Trigger.dev cloud — push the latest task definition
  with `npx trigger.dev@latest deploy` (Trigger.dev v3) after merging changes
  that touch `src/trigger/`. Failures are visible in the Trigger.dev dashboard.
- **Manual trigger / emergency rerun:** `POST /api/portfolio/sync-all` with an
  `x-cron-secret` header matching the `CRON_SECRET` env var. Returns the
  Trigger.dev `runId` so you can follow the run in the dashboard.
- **Per-user behaviour:** iterates `ib_connections` rows, calls
  `fetchActivityReport` + `syncActivityReport` for each, then syncs trade
  confirmations if a `trade_confirm_query_id` is configured. Errors for one
  user don't stop the others; failures are recorded in `sync_history` with
  `status='error'`.
