# Supabase Migration Runbook

## Prerequisites
- Supabase project created.
- Environment set from `.env.example`.
- Legacy GAS endpoint still available for backfill (`LEGACY_API_URL`).

## Deployment Steps
1. Apply SQL migrations in order:
   - `supabase/migrations/20260425223000_theconfessional_schema.sql`
   - `supabase/migrations/20260425223100_theconfessional_bucket.sql`
2. Set function secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `GEMINI_API_KEY`).
3. Deploy function:
   - `supabase functions deploy theconfessional-api --no-verify-jwt`
4. Update frontend endpoint in `assets/js/config/sheets-config.js`.

## Data Migration
1. Backfill data and images from Google backend:
   - `node scripts/migrate-google-to-supabase.mjs`
2. Optional local image backfill:
   - `node scripts/migrate-local-images-to-supabase.mjs <directory>`

## Smoke Test Checklist
- `GET action=dates` returns only non-inflight bills.
- `GET action=bill` returns items and metadata with `totalPaid`.
- `GET action=getBillImage` returns base64 payload for dates with stored image.
- `POST action=submitClaims` enforces slot conflict checks.
- Upload flow:
  - `analyzeBillImage` returns `jobId`.
  - `completeBillUpload` stores bill rows + image.
  - `updateBillTotalPaid` + `setBillOpen` finalizes.
- `deleteBill` rejects dates with existing claims.

## Rollback
1. Revert `assets/js/config/sheets-config.js` `API_URL` to old GAS endpoint.
2. Keep Supabase data untouched for retry.
3. Investigate edge function logs and rerun migration scripts idempotently.

## Google Decommission (after validation window)
1. Freeze writes to old GAS endpoint.
2. Take final migration pass.
3. Disable/undeploy GAS web app.
4. Archive Sheets + Drive artifacts.
