# 🍳 Yolkshire WhatsApp Marketing Sign-up App

A mobile-first, branded web app for Yolkshire to collect opt-in sign-ups for WhatsApp broadcasts via QR codes on posters, table tents, bills, packaging, and menus.

Powered by **Cloudflare Workers** + **Cloudflare D1 (Serverless SQLite)** with automated GitHub Actions CI/CD.

---

## 📁 Project Architecture

- **`src/worker.js`**: Cloudflare Worker backend:
  - Serves static assets (`/` for customer sign-up, `/admin` for dashboard)
  - `POST /submit`: Validates phone, deduplicates via D1 upsert, saves records
  - `GET /api/stats`: Protected JSON BI API with date ranges (`today`, `last7days`, `last30days`, `thismonth`, `all`)
  - `GET /export`: Protected WABA-ready CSV download (`Phone,Given Name,Family Name,Branch`)
  - Full CORS support
- **`schema.sql`**: Cloudflare D1 SQL schema with phone uniqueness constraint & indexing
- **`public/index.html`**: Branded customer signup form (Poppins font, Yolkshire palette, auto `+91` prefix, branch select)
- **`public/admin.html`**: Authenticated dashboard with branch statistics, filters, search, and CSV export
- **`.github/workflows/deploy.yml`**: Auto-deploys to Cloudflare Workers on `git push origin main`
- **`wrangler.toml`**: Cloudflare Worker & D1 binding configuration

---

## 🚀 Setup & Deployment Guide

### 1. Cloudflare Account & D1 Setup
1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com).
2. Install dependencies locally (optional if deploying via GitHub):
   ```bash
   npm install
   ```
3. Create your D1 Database:
   ```bash
   npx wrangler d1 create yolkshire-signups
   ```
4. Copy the output `database_id` into your **`wrangler.toml`**:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "yolkshire-signups"
   database_id = "<YOUR_DATABASE_ID>"
   ```
5. Apply the database schema:
   ```bash
   npx wrangler d1 execute yolkshire-signups --remote --file=./schema.sql
   ```

### 2. Configure Secrets (Admin Security)
Set your private dashboard passphrase securely:
```bash
npx wrangler secret put ADMIN_TOKEN
```
*(Enter your desired passphrase when prompted. This is never stored in git or exposed to anyone).*

### 3. Setup GitHub Actions Auto-Deploy
In your GitHub repository (`Yolkshire-Pune/whatsapp-marketing-signup`):
1. Go to **Settings** > **Secrets and variables** > **Actions**.
2. Add the following Repository Secrets:
   - `CLOUDFLARE_API_TOKEN`: Cloudflare API token with `Workers:Edit` and `D1:Edit` permissions.
   - `CLOUDFLARE_ACCOUNT_ID`: Found on your Cloudflare dashboard sidebar.
3. Push to `main` — GitHub Actions will auto-build and deploy your site!

### 4. Custom Domain (e.g. `signup.yolkshire.com`)
1. In Cloudflare Dashboard, go to **Workers & Pages** > select `yolkshire-wa-signup`.
2. Click **Settings** > **Domains & Routes** > **Add** > **Custom Domain**.
3. Enter `signup.yolkshire.com` (or `wa.yolkshire.com`).
4. Cloudflare automatically issues and manages the SSL certificate.

---

## 🏷️ Branch & Source Tracking (QR Codes)

Append `?branch=` and `?source=` to your domain for tracking:

| Location / Branch | QR Code Destination URL Example |
|---|---|
| Kothrud — Table Tent | `https://signup.yolkshire.com/?branch=Kothrud&source=Table%20Tent` |
| Aundh — Menu | `https://signup.yolkshire.com/?branch=Aundh&source=Menu` |
| Salunkhe Vihar — Poster | `https://signup.yolkshire.com/?branch=Salunkhe%20Vihar&source=QR%20Poster` |
| Wadgaon Sheri — Bill | `https://signup.yolkshire.com/?branch=Wadgaon%20Sheri&source=Bill` |
| Pimple Saudagar — Packaging | `https://signup.yolkshire.com/?branch=Pimple%20Saudagar&source=Packaging` |
| PYC — Table Tent | `https://signup.yolkshire.com/?branch=PYC&source=Table%20Tent` |
| Wakad — Poster | `https://signup.yolkshire.com/?branch=Wakad&source=QR%20Poster` |
| Bavdhan — Bill | `https://signup.yolkshire.com/?branch=Bavdhan&source=Bill` |

---

## 📥 Exporting WABA-Ready CSV

1. Open `https://signup.yolkshire.com/admin` (or `https://<worker>.workers.dev/admin`).
2. Enter your `ADMIN_TOKEN` passphrase.
3. Click **Download WABA CSV** (or access `/export?token=YOUR_TOKEN`).
4. CSV Output format:
   ```csv
   Phone,Given Name,Family Name,Branch
   "919876543210","Rahul","Sharma","Kothrud"
   "919812345678","Priya","Mehta","Aundh"
   ```

---

## 📊 Central Yolkshire BI Dashboard API

Pull live sign-up data into your central reporting tools:

- **Endpoint**: `https://signup.yolkshire.com/api/stats?token=YOUR_TOKEN&range=last7days`
- **Supported Ranges**: `today`, `last7days`, `last30days`, `thismonth`, `all`
- **Sample JSON**:
  ```json
  {
    "success": true,
    "brand": "Yolkshire",
    "metric": "whatsapp_marketing_optins",
    "timeRange": "last7days",
    "generatedAt": "2026-09-05T15:00:00",
    "totalOptIns": 142,
    "totalAllTime": 560,
    "branchBreakdown": {
      "Kothrud": 54,
      "Aundh": 38,
      "Salunkhe Vihar": 26,
      "Bavdhan": 24
    },
    "dailyTrend": {
      "2026-09-01": 18,
      "2026-09-02": 24
    }
  }
  ```
