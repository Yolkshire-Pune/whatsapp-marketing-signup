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

## 🏷️ Source Tracking & QR Code Campaigns

To track where customers sign up from, simply append ?source= to the Web App URL when generating QR codes:

| Campaign / Location | URL Parameter Example |
|---|---|
| Poster at entrance / wall | https://YOUR-APP-URL/exec?source=QR%20Poster |
| Table tent on dining tables | https://YOUR-APP-URL/exec?source=Table%20Tent |
| On printed menu | https://YOUR-APP-URL/exec?source=Menu |
| Printed on the paper bill | https://YOUR-APP-URL/exec?source=Bill |
| Takeaway box / packaging | https://YOUR-APP-URL/exec?source=Packaging |
| Instagram bio link | https://YOUR-APP-URL/exec?source=Instagram |

### Generating the QR Code:
Use any free or commercial QR code generator (e.g., [qr-code-generator.com](https://www.qr-code-generator.com/) or Canva) and paste your tagged URL.

---

## 📥 Exporting WABA-Ready CSV

1. Open your Web App admin page:
   https://YOUR-APP-URL/exec?page=admin
2. Enter your ADMIN_TOKEN passphrase.
3. Click the **Download WABA CSV** button.
4. The downloaded CSV contains:
   `csv
   name,phone
   "Rahul Sharma",919876543210
   "Priya Mehta",919812345678
   `
   - Only contacts who explicitly marked **Consent = Yes** are exported.
   - Phone numbers are formatted cleanly as international numbers (91XXXXXXXXXX) without spaces, symbols, or leading zeros.

---

## 🔒 Security & Privacy Notes

- Customer data is stored privately in your Google Sheet.
- Phone numbers shown on the admin preview screen are masked (9198****3210) for casual view safety.
- The admin dashboard and direct CSV endpoint are protected by the ADMIN_TOKEN.
- Submissions require un-checked explicit marketing consent before submission.
