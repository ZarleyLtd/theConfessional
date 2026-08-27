# Supabase Deployment Runbook

## Prerequisites
- Supabase project created.
- Environment set from `.env.example`.

## Deployment Steps
1. Apply SQL migrations in order (use `supabase db query --linked -f <file>` if `db push` history does not match):
   - `supabase/migrations/20260425223000_theconfessional_schema.sql`
   - `supabase/migrations/20260425223100_theconfessional_bucket.sql`
   - `supabase/migrations/20260425223200_payments.sql`
   - `supabase/migrations/20260425223300_opening_balances.sql`
2. Set function secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `GEMINI_API_KEY`).
3. Deploy function:
   - `supabase functions deploy theconfessional-api --no-verify-jwt`
4. Update frontend endpoint in `assets/js/config/sheets-config.js`.

## Optional image backfill
- `node scripts/migrate-local-images-to-supabase.mjs <directory>` for exported local bill images.

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

## Troubleshooting
1. Redeploy the edge function after backend changes.
2. Confirm migrations were applied and schema `theConfessional` is exposed.
3. Confirm bucket `theConfessional` exists and is private.
4. Ensure `SUPABASE_DB_URL` points at direct Postgres (`db.<ref>.supabase.co:5432`).
5. Check edge function logs in the Supabase dashboard if requests fail.
