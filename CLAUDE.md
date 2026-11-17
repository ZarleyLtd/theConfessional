# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Bar Bill Claims (theConfessional).** A small app for claiming items on a bar bill. A user picks a bill date (only dates that have bills can be picked), identifies themselves, then taps icon buttons to claim or un-claim each unit. Greyed-out buttons are already claimed by someone else.

The main app is the single page `index.html`, with `poweruser.html` alongside it. Everything is vanilla JS and plain CSS, with no build step. The backend is the Supabase Edge Function `theconfessional-api`. It uses Postgres schema `theConfessional` and a private Storage bucket, also named `theConfessional`, on the shared CursorSites Supabase project "Apps" (`yzyipxvlsoxfphwobfkb`).

## Dev server / port

There's no dev server script. Serve the folder statically from the project root:

```powershell
npx serve .        # http://localhost:3000
```

The frontend calls the deployed function. Its URL is `API_URL` in `assets/js/config/sheets-config.js`, which is the only place to change the backend URL.

## Commands

```powershell
supabase functions deploy theconfessional-api --no-verify-jwt   # redeploy after any backend change
npm run migrate:images -- <folder>                               # optional: backfill local bill images to Storage
```

The Edge Function needs these secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`: direct Postgres, `db.<ref>.supabase.co:5432`. The transactional `submitClaims` call requires it.
- `GEMINI_API_KEY`

There are no automated tests.

## Architecture

- **JS load order in the HTML:** config → utils → components → pages → main.js.
  - `assets/js/config/sheets-config.js`
  - `utils/` holds `api.js`, `formatters.js` and `claims-state.js` (the claim-slot state logic).
  - `components/` holds `name-combobox.js`, `product-row.js`, `share-claim-dialog.js` and `summary`. Each exposes a mount/render API.
  - `pages/claims.js` orchestrates the flow: date → name → bill → claims → submit.
  - `main.js` is the entry point.
- **No duplication.** Shared logic goes in utils or components.
- **Backend.** `supabase/functions/theconfessional-api/index.ts` serves dates, bills, claims, config, financial APIs and bill upload. The API is described in `docs/api-contract.md`.
- **Data.** Tables are defined in `supabase/migrations/`: `config_names`, `bills`, `bill_items`, `claims`, `payments`, `opening_balances`, and others. Don't change what a column means without updating both the Edge Function and the frontend. Bill images are referenced by `bills.image_path`.
- **Fetch / CORS.** Use GET with no custom headers, or POST with `Content-Type: text/plain;charset=UTF-8` and a JSON string body. This is the pattern that Scrabble and FamilyTree copy.

## Rules

- **Plain CSS only.** Don't add Tailwind or any other framework. All styles go in `assets/css/style.css`, using semantic BEM-style class names such as `claims-modal__heading`, `claims-product-row` and `claims-slot-btn`. Define new classes there rather than adding utility classes.
- **Relative paths only.** Never use absolute URLs or drive letters.
- **Reference files.** `sampledata/` and `rnrREADME.md` are for reference only. Don't change them.
- **Shared Supabase project.** Don't run `supabase db push`. See `../cursor-sites-shared/supabase/SHARED_DATABASE.md`.

## Keep share/portion claims in step with Splitify

The share/portion claim flow also exists in Splitify (`../Splitify`). Here it lives in `share-claim-dialog.js`, `claims-state.js`, `product-row.js` and the wiring in `pages/claims.js`. The two apps may look different, but their **behaviour must stay the same**. That covers:

- the pie-selection UX
- preselection when a full claim is converted
- confirming all slices as a normal full claim
- the locking rules

If a change here would make the two apps behave differently, or you notice they already do, tell the user so they can bring them back in line, or apply the same fix in both.
