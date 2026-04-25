# Bar Bill Claims (theConfessional)

A small web app for **claiming** bar bill items (food and drink). Users pick a bill date, identify themselves, then tap icon-style buttons to claim or un-claim each unit. Data and bill images are stored in Supabase and served by a Supabase Edge Function.

## Setup

### 1. Supabase project

Create a Supabase project and provision:

- Schema: `theConfessional`
- Bucket: `theConfessional` (private)
- Tables from `supabase/migrations/20260425223000_theconfessional_schema.sql`
- Bucket migration from `supabase/migrations/20260425223100_theconfessional_bucket.sql`

Set secrets for Edge Functions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL` (port `5432`, required for transactional `submitClaims`)
- `GEMINI_API_KEY`

Deploy edge function:

- `supabase functions deploy theconfessional-api --no-verify-jwt`

Optional migration from legacy Google backend:
- `node scripts/migrate-google-to-supabase.mjs` (uses `LEGACY_API_URL`)
- `node scripts/migrate-local-images-to-supabase.mjs <folder>` for exported local images.

### 2. Frontend

1. Open `assets/js/config/sheets-config.js` and set `API_URL` to your function URL:
   `https://<project-ref>.supabase.co/functions/v1/theconfessional-api`
2. Serve the project (e.g. deploy to GitHub Pages or any static host). For local testing, use a simple HTTP server (e.g. `npx serve .`) so the Google Apps Script backend is not blocked by CORS. No build step is required.

## Usage

1. Open the app. Choose a date (only dates that have data in **Bills** are clickable).
2. Select or type your name.
3. Click product buttons to claim; click again to un-claim. Greyed-out buttons are claimed by others.
4. Click **Submit my claims** to save. If a bill has an image stored, a **View original bill** link is shown on the products view.

## Troubleshooting

1. Redeploy the edge function after backend changes.
2. Confirm the migration SQL was applied and schema is exposed as `theConfessional`.
3. Confirm bucket `theConfessional` exists and is private.
4. Ensure `SUPABASE_DB_URL` points at direct Postgres (`db.<ref>.supabase.co:5432`).
5. If images fail, verify object paths in `bills.image_path` and storage object existence.

## Tech stack

- **Frontend**: Vanilla JS, plain CSS (no framework). Single stylesheet: `assets/css/style.css` with semantic/BEM-style class names (e.g. `app`, `claims-modal`, `claims-name__input`).
- **Backend**: Supabase Edge Function + Postgres + Supabase Storage.

## Files

- `index.html` – Single-page app shell.
- `assets/css/style.css` – All styles; semantic class names for layout, modal, product rows, summary, and products view.
- `assets/js/config/sheets-config.js` – API URL (single source of truth for the backend endpoint).
- `assets/js/utils/` – api, formatters, claims-state.
- `assets/js/components/` – name-combobox, product-row, summary.
- `assets/js/pages/claims.js` – Claims page logic.
- `assets/js/main.js` – Entry point.
- `supabase/functions/theconfessional-api/index.ts` – Supabase Edge Function backend.
- `supabase/migrations/` – schema + bucket migrations.
- `scripts/` – one-time migration scripts.

