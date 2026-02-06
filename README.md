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

- **ProductIcons** (optional)  
  Headers: **Product**, **Image**  
  - Maps product descriptions to image files. **Product** = text to match (case-insensitive, partial match: e.g. "Guinness" matches "Pt Guinness 0.0"). **Image** = filename (e.g. `GuinnessPint.png`). Images live in `assets/images/`. Longer matches take precedence. If no match, built-in rules and emoji fallbacks apply.

Add at least one row to **Config** (e.g. "Alice") and one day of data to **Bills** (see `sampledata` for the item shape) so the calendar has a clickable date.

### 2. Backend (Google Apps Script)

1. In the same Google Sheet: **Extensions** → **Apps Script**. Delete default code.
2. Paste the contents of `backend/code.gs`. Save the project.
3. **Deploy** → **New deployment** → type **Web app**.
4. Set **Execute as**: Me, **Who has access**: Anyone (or Anyone with Google account). Deploy.
5. Copy the Web App URL.

### 3. Frontend

1. Open `assets/js/config/sheets-config.js` and set `API_URL` to your Web App URL (replace the placeholder or the whole URL).
2. Serve the project (e.g. deploy to GitHub Pages or any static host). For local testing, use a simple HTTP server (e.g. `npx serve .`) so the Google Apps Script backend is not blocked by CORS. No build step is required.

## Usage

1. Open the app. Choose a date (only dates that have data in **Bills** are clickable).
2. Select or type your name.
3. Click product buttons to claim; click again to un-claim. Greyed-out buttons are claimed by others.
4. Click **Submit my claims** to save to the sheet.

## Troubleshooting – ProductIcons / images not showing

1. **Redeploy the Apps Script** – After adding `getProductIcons` to `code.gs`, you must create a **new deployment** (or edit the existing one and deploy a new version). The live Web App runs the code from the last deployment.

2. **Sheet name** – The tab must be named exactly `ProductIcons` (no space, that capitalization).

3. **Column headers** – First row must include `Product` and `Image` (case doesn’t matter). Trailing spaces are ignored.

4. **Image filenames** – Must match exactly, including case (e.g. `goujons.png` vs `Goujons.png`). Files live in `assets/images/`.

5. **Subdirectory hosting** – If the app is served from a subpath (e.g. `yoursite.com/theConfessional/`), add `BASE_PATH: '/theConfessional'` to `CONFIRMATIONAL_CONFIG` in `sheets-config.js`.

6. **Check the console** – If ProductIcons fails to load, a warning is logged. Open Developer Tools → Console to see it.

## Tech stack

- **Frontend**: Vanilla JS, plain CSS (no framework). Single stylesheet: `assets/css/style.css` with semantic/BEM-style class names (e.g. `app`, `claims-modal`, `claims-name__input`).
- **Backend**: Google Apps Script; data in Google Sheets.

## Files

- `index.html` – Single-page app shell.
- `assets/css/style.css` – All styles; semantic class names for layout, modal, calendar, product rows, summary, and products view.
- `assets/js/config/sheets-config.js` – API URL (single source of truth for the Web App URL).
- `assets/js/utils/` – api, formatters, claims-state.
- `assets/js/components/` – calendar, name-combobox, product-row, summary.
- `assets/js/pages/claims.js` – Claims page logic.
- `assets/js/main.js` – Entry point.
- `backend/code.gs` – Google Apps Script Web App.

Bill upload / image extraction is out of scope; the **Bills** sheet is expected to be filled by a separate process (e.g. future script that matches the `sampledata` structure).
