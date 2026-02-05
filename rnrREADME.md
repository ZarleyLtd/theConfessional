# Holiday Home Booking System

A zero-cost booking system for a holiday home, built with a static frontend (deployable on GitHub Pages) and Google Apps Script backend.

## Features

- **Custom Multi-Month Calendar View**: Horizontal scrolling calendar showing 12 months ahead with visual availability indicators
- **Room Booking Management**: Book individual rooms (Master, Twin, Bunk) or the entire house
- **Smart Conflict Detection**: Prevents double-booking with real-time availability checking
- **Password Protection**: Family and Admin password authentication (configurable via Settings sheet)
- **PIN-Based Booking Security**: Optional PIN codes for individual bookings to protect edits/deletes
- **Activity Logging**: Admin-accessible activity log tracking all booking changes
- **Responsive Design**: Mobile-optimized with bottom-sheet modals and touch-friendly interactions
- **Coastal Theme**: Beautiful ocean-inspired color palette with local photography
- **Zero Cost**: Frontend on GitHub Pages, backend on Google Apps Script (both free)

## Setup Instructions

### Frontend Setup

1. The frontend files (`index.html`, `app.js`, `house-info.html`, `local-info.html`) are ready to use
2. Update the `API_URL` constant in `app.js` with your Google Apps Script Web App URL (see Backend Setup)
3. Deploy to GitHub Pages or any static hosting service

### Backend Setup (Google Apps Script)

1. **Create a Google Sheet**:
   - Create a new Google Sheet (name doesn't matter)
   - The script will automatically create three tabs:
     - **Bookings**: Stores all booking data (Guest Name, Room, Start Date, End Date, Notes, PIN)
     - **ActivityLog**: Tracks all booking changes (admin only)
     - **Settings**: Stores Family Password and Admin Password

2. **Create the Script**:
   - In your Google Sheet, go to `Extensions` → `Apps Script`
   - Delete any default code
   - Copy and paste the contents of `backend/code.gs`
   - Save the project (give it a name like "Holiday Booking")

3. **Deploy as Web App**:
   - Click `Deploy` → `New deployment`
   - Click the gear icon ⚙️ next to "Select type" and choose "Web app"
   - Set the following:
     - **Description**: "Holiday Booking API" (or any description)
     - **Execute as**: "Me"
     - **Who has access**: "Anyone" (or "Anyone with Google account" for more security)
   - Click "Deploy"
   - Copy the Web App URL that appears
   - Click "Done"

4. **Update Frontend**:
   - Open `app.js`
   - Replace the `API_URL` constant with your actual Web App URL

5. **Configure Passwords** (Optional):
   - In your Google Sheet, go to the "Settings" tab
   - Update the "Family Password" and "Admin Password" values as needed
   - Default passwords are: `rnr` (family) and `rnrAdmin` (admin)

6. **Authorize the Script** (First time only):
   - When you first access the Web App URL, Google will ask for authorization
   - Click "Review Permissions" → Choose your Google account → "Advanced" → "Go to [Project Name] (unsafe)" → "Allow"

## Usage

1. Access the booking system through your deployed frontend URL
2. Enter the family or admin password when prompted
3. Click on dates in the calendar to select check-in and check-out dates
4. Click "Proceed" to open the booking form
5. Fill in the booking form:
   - Guest Name (autocomplete from predefined list)
   - Room(s) - Select one or more rooms (all 3 = Entire House)
   - Dates (pre-filled from calendar selection)
   - Notes (optional)
   - PIN Code (optional - protects booking from unauthorized edits)
6. Submit the booking
7. Click on any booking in the "Current Bookings" list to edit or delete (PIN required if set)

## Technical Details

- **Frontend**: HTML, Vanilla JavaScript, Tailwind CSS (via CDN)
- **Backend**: Google Apps Script
- **Data Storage**: Google Sheets (3 sheets: Bookings, ActivityLog, Settings)
- **Date Format**: ISO 8601 (YYYY-MM-DD) for consistency
- **Authentication**: Password-based (Family/Admin roles stored in Settings sheet)
- **Security**: Optional PIN codes per booking, session-based authentication
- **Calendar**: Custom-built multi-month view (not using FullCalendar.io)

## Files

- `index.html` - Main HTML file with calendar and booking modals
- `app.js` - Frontend JavaScript logic (1,838 lines)
- `backend/code.gs` - Google Apps Script backend code (646 lines)
- `house-info.html` - House information page
- `local-info.html` - Local area information page
- `images/` - Local photography assets

## Architecture

### Data Flow
User Action → Frontend (app.js) → Fetch API → Google Apps Script (code.gs) → Google Sheets
↓
Response (JSON)


### Sheets Structure
- **Bookings**: Guest Name | Room | Start Date | End Date | Notes | PIN
- **ActivityLog**: Timestamp | Action | Booking ID | Data | Session Info
- **Settings**: Setting | Value (Family Password, Admin Password)

## Notes

- The booking system includes conflict detection to prevent double-booking
- All dates are handled in ISO 8601 format to avoid timezone issues
- Activity log is stored both in localStorage (client-side) and Google Sheets (backend)
- Admin users can view the activity log; family users cannot
- PIN codes are optional - bookings without PINs can be edited by anyone with access
- The calendar shows 12 months ahead from the current month
- Mobile users get bottom-sheet style modals for better UX


## Tech Stack Quick explainer.
Frontend Stack:
Vanilla JavaScript: No build step, direct browser execution, easy to deploy
Tailwind CSS (CDN): Utility-first styling, responsive design, no build process
Custom Calendar: Lightweight, 12-month horizontal scroll, visual availability indicators
Backend Stack:
Google Apps Script: Serverless, free, integrates with Google Sheets
Google Sheets: Free database, human-readable, no setup
Architecture:
Static frontend + serverless backend: Zero infrastructure, deploy to GitHub Pages, scales automatically
Security Model:
Password-based access control: Simple family/admin authentication
Optional PIN codes: Per-booking protection for sensitive reservations
Session-based: No persistent cookies, sessionStorage for temporary access
These revisions align the documentation with the current implementation.

