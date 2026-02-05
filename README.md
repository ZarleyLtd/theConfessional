# Bar Bill Claims (theConfessional)

A small web app for **claiming** bar bill items (food and drink). Users pick a bill date, identify themselves, then tap icon-style buttons to claim or un-claim each unit. Data is stored in Google Sheets via a Google Apps Script Web App.

## Setup

### 1. Google Sheet

Create a Google Sheet with three tabs:

- **Config**  
  - Column **Name**: one name per row (for the combobox). Optional extra columns later (e.g. ProductIcon).

- **Bills**  
  Headers: **Date**, **RowIndex**, **Category**, **Description**, **Quantity**, **UnitPrice**, **TotalPrice**  
  - One row per line item. **Date** = YYYY-MM-DD. **RowIndex** = 0-based index for that date (optional; if empty, indices are generated). **Category** = "Food" or "Drink". **Quantity** = number of units (e.g. 4 pints).

- **Claims**  
  Headers: **Date**, **UserName**, **RowIndex**, **UnitIndex**  
  - One row per claimed unit. **RowIndex** / **UnitIndex** refer to the Bills row and which unit (0 to Quantity-1).

Add at least one row to **Config** (e.g. "Alice") and one day of data to **Bills** (see `sampledata` for the item shape) so the calendar has a clickable date.

### 2. Backend (Google Apps Script)

1. In the same Google Sheet: **Extensions** → **Apps Script**. Delete default code.
2. Paste the contents of `backend/code.gs`. Save the project.
3. **Deploy** → **New deployment** → type **Web app**.
4. Set **Execute as**: Me, **Who has access**: Anyone (or Anyone with Google account). Deploy.
5. Copy the Web App URL.

### 3. Frontend

1. Build Tailwind CSS (requires Node.js): run `npm install` then `npm run build:css`. This generates `assets/css/tailwind.built.css` and removes the "cdn.tailwindcss.com should not be used in production" console warning.
2. Open `assets/js/config/sheets-config.js` and set `API_URL` to your Web App URL (replace `YOUR_SCRIPT_ID` or the whole URL).
3. Serve the project (e.g. deploy to GitHub Pages or any static host). For local testing, use a simple HTTP server (e.g. `npx serve .`) so the Google Apps Script backend is not blocked by CORS.

## Usage

1. Open the app. Choose a date (only dates that have data in **Bills** are clickable).
2. Select or type your name.
3. Click product buttons to claim; click again to un-claim. Greyed-out buttons are claimed by others.
4. Click **Submit my claims** to save to the sheet.

## Tech stack

- Frontend: Vanilla JS, Tailwind CSS (built with Tailwind CLI; see `npm run build:css`).
- Backend: Google Apps Script; data in Google Sheets.

## Files

- `index.html` – Single-page app shell.
- `assets/css/input.css` – Tailwind source; build with `npm run build:css` to produce `assets/css/tailwind.built.css`.
- `assets/js/config/sheets-config.js` – API URL.
- `assets/js/utils/` – api, formatters, claims-state.
- `assets/js/components/` – calendar, name-combobox, product-row, summary.
- `assets/js/pages/claims.js` – Claims page logic.
- `assets/js/main.js` – Entry point.
- `backend/code.gs` – Google Apps Script Web App.

Bill upload / image extraction is out of scope; the **Bills** sheet is expected to be filled by a separate process (e.g. future script that matches the `sampledata` structure).
