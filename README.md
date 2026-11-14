# Site Visit Assistant 📋🏗️

> **Simply on-site reports for Architects and Contractors**  
> A high-performance, mobile-first Progressive Web App (PWA) and native iOS application for site walkthroughs, key plan defect pinning, observation tracking, and professional PDF report generation.

---

## 🌟 Highlights

- **100% Offline & Local-First:** All drawing blueprints, punch list observations, site photos, and notes are stored securely on-device using IndexedDB. No cloud dependency or account required.
- **Dual Platform:** Run as an offline **Progressive Web App (PWA)** in Safari/Chrome or compile natively for **iOS (iPhone & iPad)** with Capacitor.
- **Smart Mobile Experience:** Optimized with Apple Liquid Glass UI, notch/Dynamic Island safe-area support, and intelligent keyboard clearance that prevents fields from ever hiding behind the virtual typing pad.
- **Key Plan & Blueprint Markup:** Upload image or PDF drawing sheets, drop pinpoint numbered markers, and attach defect photos with arrows, clouds, boxes, and pen markup.
- **Professional PDF Reports:** Generate clean, branded field observation reports with covers, executive summaries, attendee lists, observation grids, and high-res annotated photos.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js 18+](https://nodejs.org/) (LTS recommended)
- [npm](https://www.npmjs.com/) (bundled with Node)

### Installation

```bash
# 1. Clone or download the repository
git clone https://github.com/YOUR_USERNAME/site-visit-assistant.git
cd site-visit-assistant

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 📦 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts Vite local development server on `localhost:5173` |
| `npm run build` | Compiles production-ready web assets into `dist/` |
| `npm run preview` | Previews the production build locally |
| `npm run build:ios` | Builds web assets and synchronizes them with the native iOS Xcode project |
| `npm run cap:sync` | Syncs web assets and native plugins into the `ios/` folder |
| `npm run cap:open:ios` | Opens the iOS project in Xcode on macOS |
| `npm run package:mac` | Builds standalone macOS desktop package (`.dmg` / `.zip`) |

---

## 🌐 Free Web Hosting & PWA Distribution

### Option 1 — Deploy with GitHub Pages (Automated via GitHub Actions)
This repository includes a pre-configured GitHub Actions workflow (`.github/workflows/deploy.yml`):

1. Push your repository to GitHub.
2. In your GitHub repository, navigate to **Settings** → **Pages**.
3. Under **Build and deployment** → **Source**, select **GitHub Actions**.
4. GitHub will automatically build and publish your app at:
   ```
   https://<YOUR-USERNAME>.github.io/<REPO-NAME>/
   ```

### Option 2 — Deploy to Netlify
1. Run `npm run build`.
2. Drag and drop the `dist/` folder onto [app.netlify.com/drop](https://app.netlify.com/drop).
3. Your app is live instantly with an HTTPS domain!

---

## 📱 Installing on Mobile Devices (PWA)

Anyone can install the app directly on their mobile device without an App Store account:

### iPhone & iPad (Safari)
1. Open your live app URL in **Safari**.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** in the top right.
5. The app launches full-screen with offline persistence, just like a native app.

### Android (Chrome)
1. Open the app URL in **Chrome**.
2. Tap the menu (**⋮**) in the top right.
3. Tap **Install app** or **Add to Home screen**.

---

## 🍎 Compiling for Native iOS (Xcode)

To run natively on iPhone/iPad via Xcode on macOS:

1. In Terminal on your Mac:
   ```bash
   npm install
   npm run build:ios
   npm run cap:open:ios
   ```
2. Connect your iPhone via USB, select your device in the top bar, and press **Play (▶ Run)** (`Cmd + R`).
3. On your iPhone: Go to **Settings** → **General** → **VPN & Device Management** and tap **Trust**.

---

## ✨ Features

| Category | Features Included |
|---|---|
| **Project Management** | Multiple active and archived projects, project stats, client details, project cloning, JSON backup export & restore |
| **Site Visits (Reports)** | Multi-phase walkthroughs, weather conditions, date/time logging, alphabetical & chronological attendee tracking |
| **Key Plans & Blueprints** | Single & multi-page PDF sheet selection via PDF.js, image upload, pinch-to-zoom, pan, numbered defect pins |
| **Defect Observations** | Status badges (*Open*, *In Progress*, *Resolved*), custom priority levels, due dates, assignee tagging, list view |
| **Photo Annotations** | Camera capture, photo library picker, high-resolution canvas editor, arrows, cloud callouts, boxes, text, multi-color palette |
| **Voice Dictation** | Speech-to-text voice recognition for rapid site notes hands-free |
| **Export Engine** | High-definition PDF generation with custom company logo, accent theme colors, ZIP photo archives, and CSV exports |
| **Security & Privacy** | 100% offline local IndexedDB storage; no third-party tracking; data never leaves your device unless explicitly exported |

---

## 🛠️ Built With

- **Frontend:** [React 18](https://react.dev/), [Vite 5](https://vitejs.dev/), [Tailwind CSS](https://tailwindcss.com/)
- **Native Platform:** [Capacitor 8](https://capacitorjs.com/) (iOS Native Shell & Plugins)
- **Local Database:** [Dexie.js](https://dexie.org/) (IndexedDB wrapper)
- **Drawing & Markup:** [Konva.js](https://konvajs.org/) / [react-konva](https://github.com/konvajs/react-konva), [Fabric.js](http://fabricjs.com/)
- **PDF Engine:** [jsPDF](https://github.com/parallax/jsPDF), [PDF.js](https://mozilla.github.io/pdf.js/)
- **State Management:** [Zustand](https://github.com/pmndrs/zustand)
- **Icons:** [Lucide React](https://lucide.dev/)
- **PWA Service Worker:** [Vite Plugin PWA](https://vite-pwa-org.netlify.app/) / [Workbox](https://developer.chrome.com/docs/workbox/)

---

## 📄 License

Private & Proprietary. All rights reserved.
