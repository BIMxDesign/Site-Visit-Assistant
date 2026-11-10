# SitePunch — Site Punch List & Observation Report App

A mobile-first PWA for site inspections, punch list management, and professional PDF reporting.

## 🚀 Quick Start

### Prerequisites
- [Node.js 18+](https://nodejs.org/) (download and install first)

### Install & Run

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev
```

Then open `http://localhost:5173` in your browser.

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` folder — ready to deploy.

---

## 🌐 Deploy to Netlify (Free)

### Option A — Netlify Drop (Instant, No Account Setup)
1. Run `npm run build`
2. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
3. Drag the `dist/` folder onto the page
4. Your app is live instantly with a free URL!

### Option B — GitHub + Netlify (Recommended for Updates)
1. Push this project to a GitHub repository
2. Go to [app.netlify.com](https://app.netlify.com) → New site → Import from Git
3. Select your repo → Build command: `npm run build` → Publish dir: `dist`
4. Click Deploy — auto-deploys on every git push!

---

## 📱 Install as Mobile App (PWA)

### iOS (Safari)
1. Open the app URL in Safari
2. Tap the **Share** button → **Add to Home Screen**
3. Tap **Add** — the app appears on your home screen!

### Android (Chrome)
1. Open the app URL in Chrome
2. Tap the **menu (⋮)** → **Add to Home screen** (or banner appears automatically)
3. Tap **Add**

---

## ✨ Features

| Feature | Description |
|---|---|
| 📋 Projects | Create and manage multiple inspection projects |
| 🗺️ Floor Plans | Upload JPG/PNG floor plans, zoom & pan |
| 📌 Pin Locations | Tap on floor plan to drop numbered observation pins |
| 🔴 Status Colors | Open (red) · In Progress (yellow) · Resolved (green) |
| 🎤 Voice Notes | Tap mic to speak observation notes (auto-transcribed) |
| 📸 Photos | Capture or upload multiple photos per punch item |
| ✏️ Annotations | Rectangle, cloud, arrow, and pen markup tools |
| 🎨 Color Picker | 8 annotation colors + stroke width control |
| 📄 PDF Report | Professional report with cover page, photos, summary |
| 🏢 Branding | Custom company name + logo on reports |
| 📴 Offline | Works fully offline — all data stored on device |

---

## 🛠️ Tech Stack

- **React 18** + Vite
- **Tailwind CSS** — mobile-first styling
- **Konva.js** — floor plan canvas & pin placement
- **Fabric.js** — photo annotation tools
- **Dexie.js** — IndexedDB local storage
- **jsPDF** — PDF generation
- **Web Speech API** — voice-to-text
- **Vite PWA** — offline / installable
