# SitePunch License & Telemetry Manager (WordPress Plugin)

Connects your standalone **SitePunch Mobile PWA** with your **WordPress marketing website**.

---

## What This Plugin Does
1. **Captures Customer & Project Telemetry on Payment**:
   - Customer Full Name, Email, and Phone Number
   - Unlocked Project Name & UUID
   - Device Stats: How many total projects and reports the user currently has in their app
   - PayPal Transaction ID / Order ID & Amount Paid
2. **WordPress Admin Dashboard View**:
   - A dedicated **"SitePunch Licenses"** admin screen displaying all customer purchases and revenue.
3. **One-Click CSV Export**:
   - Download your entire paying customer list anytime for accounting, support, or email marketing.
4. **Secure REST API**:
   - Listens on `POST /wp-json/sitepunch/v1/log-license` with an `X-SitePunch-Key` security header.

---

## How to Install on Your WordPress Website

### Option A: Upload via WordPress Admin (Easiest)
1. Zip the `sitepunch-license-manager` folder (or upload the single `sitepunch-license-manager.php` file).
2. Log into your WordPress Admin (`https://yourdomain.com/wp-admin`).
3. Go to **Plugins > Add New > Upload Plugin**.
4. Choose the zip file and click **Install Now**, then click **Activate**.

### Option B: Upload via FTP / cPanel
1. Upload the `sitepunch-license-manager` folder to `/wp-content/plugins/` on your web server.
2. In WordPress Admin, go to **Plugins** and click **Activate** under **SitePunch License & Telemetry Manager**.

---

## How to Connect to SitePunch App
1. In SitePunch, go to **Settings > About & Billing > PayPal & WordPress Integration**.
2. Enter your WordPress website URL (e.g. `https://yourdomain.com`).
3. Ensure the **API Secret Key** matches the key shown in **WP Admin > SitePunch Licenses** (default: `sitepunch_secret_key_8829`).
4. Whenever a user pays for a project in SitePunch, their customer details and project telemetry will instantly appear in your WordPress dashboard!
