# 🍳 Yolkshire WhatsApp Marketing Sign-up App

A mobile-first, branded web app for Yolkshire to collect opt-in sign-ups for WhatsApp broadcasts via QR codes on posters, table tents, bills, packaging, and menus.

Built with **Google Apps Script Web App** and **Google Sheets** as the database.

---

## 📁 Project Files

- **Code.gs**: Google Apps Script backend code handling:
  - Routing (/ for customer sign-up, ?page=admin for admin dashboard, ?page=export for CSV export)
  - Validation & phone number normalisation (+91 India default, e.g., 919876543210)
  - Duplicate contact detection (updates existing row instead of making duplicates)
  - Google Sheets read/write operations
  - Protected WABA-ready CSV download
- **index.html**: Customer-facing mobile-first sign-up page:
  - Warm Yolkshire branding (egg-yolk yellow accents, cream background, dark brown typography)
  - Form fields: Name, WhatsApp number (+91), explicit un-checked consent checkbox
  - Clean validation without browser-default error popups
  - Celebratory confirmation screen (*"You're in! 🥚"*)
  - Dynamic QR source tracking (e.g. ?source=QR%20Poster)
- **dmin.html**: Passphrase-protected admin dashboard:
  - Total opt-in stats and daily sign-up counter
  - Real-time search and filter table of recent contacts
  - One-click WABA CSV download
- **README.md**: This guide.

---

## 🚀 Setup & Deployment Guide

### Step 1: Create the Google Sheet
1. Go to [Google Sheets](https://sheets.new) and create a new spreadsheet.
2. Name it: **Yolkshire WhatsApp Opt-ins**.
3. Rename the first tab/sheet at the bottom to: **WhatsApp Opt-ins**.
4. (Optional) In row 1, add these headers:
   Timestamp | Name | Phone | Consent | Source | Status
   *(If you leave it blank, the script will automatically create these headers on first run).*
5. Copy the **Spreadsheet ID** from your browser's address bar:
   https://docs.google.com/spreadsheets/d/**<SPREADSHEET_ID>**/edit

---

### Step 2: Create the Apps Script Project
1. In Google Sheets, click **Extensions** > **Apps Script** (or open [script.google.com](https://script.google.com) and create a new project).
2. Name the project: **Yolkshire WhatsApp Sign-up**.
3. In the left panel, replace the contents of Code.gs with the code from **[Code.gs](./Code.gs)**.
4. Click the **+** icon next to *Files* > Select **HTML**:
   - File name: index (Google will make it index.html).
   - Paste the contents from **[index.html](./index.html)**.
5. Click the **+** icon next to *Files* > Select **HTML**:
   - File name: dmin (Google will make it dmin.html).
   - Paste the contents from **[dmin.html](./admin.html)**.
6. Click the Save icon 💾.

---

### Step 3: Configure Script Properties (Database & Security)
> **Privacy Note:** Do not hardcode your passphrase or share it. You set it exclusively inside your own private Google Apps Script settings where no one else (and no AI assistant) has access to it.

1. In the Apps Script editor (logged in as **`vaishali@yolkshire.com`**), click **Project Settings** (gear icon on the left menu).
2. Scroll down to **Script Properties** and click **Add script property**:
   - Property: `SHEET_ID`
   - Value: `<Your Google Spreadsheet ID from Step 1>`
3. Click **Add script property** again:
   - Property: `ADMIN_TOKEN`
   - Value: `<Set any private passphrase of your choice>`
4. Click **Save script properties**.

---

### Step 4: Deploy as a Web App
1. Make sure you are logged into Google as **`vaishali@yolkshire.com`**.
2. Click **Deploy** (top right blue button) > **New deployment**.
3. Click the gear icon next to *Select type* > choose **Web app**.
4. Configure the deployment:
   - **Description**: `Yolkshire WhatsApp Sign-up v1`
   - **Execute as**: `Me (vaishali@yolkshire.com)`
   - **Who has access**: `Anyone` *(Crucial: customers need to access the signup form without having a Google account)*
5. Click **Deploy**.
6. Grant permissions when prompted by Google (click *Advanced* > *Go to Yolkshire WhatsApp Sign-up (unsafe)* > *Allow*).
7. Copy the **Web App URL** provided (ends in `/exec`).

---

## 🏷️ Branch & Source Tracking (QR Codes)

To track both the **Branch** and the **Location / Medium**, append `?branch=` and `?source=` to your Web App URL when printing QR codes:

| Location / Branch | URL Parameter Example |
|---|---|
| Kothrud — Table Tent | `https://YOUR-APP-URL/exec?branch=Kothrud&source=Table%20Tent` |
| Aundh — Menu | `https://YOUR-APP-URL/exec?branch=Aundh&source=Menu` |
| Salunkhe Vihar — Poster | `https://YOUR-APP-URL/exec?branch=Salunkhe%20Vihar&source=QR%20Poster` |
| Wadgaon Sheri — Bill | `https://YOUR-APP-URL/exec?branch=Wadgaon%20Sheri&source=Bill` |
| Pimple Saudagar — Packaging | `https://YOUR-APP-URL/exec?branch=Pimple%20Saudagar&source=Packaging` |
| PYC — Table Tent | `https://YOUR-APP-URL/exec?branch=PYC&source=Table%20Tent` |
| Wakad — Poster | `https://YOUR-APP-URL/exec?branch=Wakad&source=QR%20Poster` |
| Bavdhan — Bill | `https://YOUR-APP-URL/exec?branch=Bavdhan&source=Bill` |

*(If a customer scans without a `?branch=` parameter, they can choose from the 8 official branches in the dropdown on the form).*

---

## 📥 Exporting WABA-Ready CSV

1. Open your Web App admin page:
   `https://YOUR-APP-URL/exec?page=admin`
2. Enter your secret `ADMIN_TOKEN`.
3. Click the **Download WABA CSV** button.
4. The downloaded CSV follows the exact platform specification:
   ```csv
   Phone,Given Name,Family Name,Branch
   919876543210,"Rahul","Sharma","Kothrud"
   919812345678,"Priya","Mehta","Aundh"
   ```
   - **Phone**: Formatted in international digits (`91XXXXXXXXXX`) without spaces, symbols, or leading zeros.
   - **Order / Deduplication**: Guaranteed unique phone numbers. If duplicate sign-ups occur, the first occurrence is preserved.
   - **Custom Variables**: Includes `Given Name`, `Family Name`, and `Branch` ready for personalized WhatsApp broadcast campaigns.

---

## 📊 Central Yolkshire BI Dashboard API

You can pull real-time sign-up and branch performance directly into your central Yolkshire BI dashboard using the JSON API endpoint:

- **Endpoint**:
  `https://YOUR-APP-URL/exec?page=api&token=YOUR_ADMIN_TOKEN&range=last7days`
- **Supported Ranges**: `today`, `last7days`, `last30days`, `thismonth`, `all`
- **Sample JSON Response**:
  ```json
  {
    "success": true,
    "brand": "Yolkshire",
    "metric": "whatsapp_marketing_optins",
    "timeRange": "last7days",
    "generatedAt": "2026-09-04 23:00:00",
    "totalOptIns": 142,
    "totalAllTime": 560,
    "branchBreakdown": {
      "Kothrud": 54,
      "Aundh": 38,
      "Viman Nagar": 26,
      "FC Road": 24
    },
    "dailyTrend": {
      "2026-08-29": 18,
      "2026-08-30": 24
    }
  }
  ```

---

## 🔒 Security & Privacy Notes

- Customer data is stored privately in your Google Sheet under `vaishali@yolkshire.com`.
- Phone numbers shown on the admin preview screen are masked (`9198****3210`) for safety.
- The admin dashboard, direct CSV endpoint, and BI API are protected by your private `ADMIN_TOKEN` configured in Script Properties.
- Customers must explicitly check the un-checked marketing consent box before submitting.
