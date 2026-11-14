# Site Visit Assistant 📋🏗️

> **Simply on-site reports for Architects and Contractors**  
> A high-performance, offline-first Progressive Web App (PWA) and native Desktop Application (macOS & Windows) for architectural walkthroughs, key plan defect pinning, observation tracking, and professional PDF report generation.

---

## 🌟 Highlights

- **100% Offline & Local-First:** All drawing blueprints, punch list observations, site photos, and notes are stored securely on-device using IndexedDB. Works completely without an internet connection.
- **Progressive Web App (PWA):** Installs directly onto your macOS, Windows PC, laptop, or tablet in one click with desktop window controls overlay and full offline cache.
- **Native Desktop Builds:** Packageable as a standalone native desktop app for **macOS (`.dmg` / `.zip`)** and **Windows (`.exe` NSIS installer & portable)** via Electron.
- **Protected Offline Storage:** Built-in persistent storage integration (`navigator.storage.persist()`) protects projects, blueprints, and photos from browser disk cleanup.
- **Key Plan & Blueprint Markup:** Upload image or multi-page PDF architectural drawings, drop pinpoint numbered markers, and attach defect photos with arrows, clouds, boxes, and pen markup.
- **Hands-Free Voice Dictation:** Integrated microphone speech-to-text dictation with automatic pause/silence flush and multi-sentence transcription.
- **Professional PDF Reports:** Generate clean, branded field observation reports with covers, executive summaries, attendee lists, observation grids, and high-res annotated photos.
- **Cloud Backup & Restore:** 1-click single-file and all-projects JSON backups with support for Google Drive, OneDrive, and local filesystem export.

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

| Command | Platform | Description |
|---|---|---|
| `npm run dev` | All | Starts Vite local development server on `localhost:5173` |
| `npm run build` | PWA / Web | Compiles optimized offline PWA production assets into `dist/` |
| `npm run preview` | PWA / Web | Previews production PWA build locally |
| `npm run package:mac` | macOS | Builds native macOS desktop package (`.dmg` & `.zip`) |
| `npm run package:mac:dmg` | macOS | Builds standalone macOS `.dmg` installer |
| `npm run package:mac:zip` | macOS | Builds macOS `.zip` portable application |
| `npm run package:win` | Windows | Builds native Windows desktop package (`.exe` installer & portable) |
| `npm run package:win:nsis` | Windows | Builds Windows NSIS setup installer (`.exe`) |
| `npm run package:win:portable` | Windows | Builds standalone portable Windows executable |
| `npm run package:all` | Mac & Win | Packages releases for both macOS and Windows simultaneously |

---

## 🌐 Deploying the PWA (Free Web Hosting)

### Option 1 — GitHub Pages (Automated via GitHub Actions)
This repository includes a pre-configured GitHub Actions workflow (`.github/workflows/deploy.yml`):

1. Push your repository to GitHub.
2. Go to **Settings** → **Pages** in your GitHub repository.
3. Under **Build and deployment** → **Source**, select **GitHub Actions**.
4. GitHub automatically builds and publishes the PWA:
   ```
   https://<YOUR-USERNAME>.github.io/<REPO-NAME>/
   ```

### Option 2 — Netlify (Instant Drop)
1. Run `npm run build`.
2. Drag and drop the `dist/` folder onto [app.netlify.com/drop](https://app.netlify.com/drop).
3. Your PWA is live immediately with an HTTPS URL.

---

## 💻 Installing as a Desktop App (PWA)

### macOS & Windows (Chrome, Edge, Brave)
1. Open your deployed PWA URL in Google Chrome, Microsoft Edge, or Brave.
2. Click the **Install App** button in the top header or the install icon in your browser's address bar.
3. Click **Install**.
4. The application now runs in its own dedicated, native desktop window with a custom icon in your macOS Dock or Windows Taskbar, functioning 100% offline.

### macOS (Safari)
1. Open the PWA URL in Safari (macOS Sonoma 14+).
2. Click **File** → **Add to Dock**.
3. Launch directly from your Mac Dock with full offline capability.

---

## 🖥️ Building Native Desktop Installers (Electron)

### macOS Application
Run on macOS:
```bash
# Build DMG installer
npm run package:mac:dmg

# Output is saved to:
# release/Site Visit Assistant-1.0.0-universal.dmg
```

### Windows Application
Run on Windows:
```bash
# Build NSIS Setup Installer & Portable Executable
npm run package:win

# Output is saved to:
# release/Site Visit Assistant-Setup-1.0.0-x64.exe
```

---

## ✨ Features

| Category | Features Included |
|---|---|
| **Platform** | Standalone Desktop (macOS & Windows) & Progressive Web App (PWA) with offline caching |
| **Offline Engine** | Dexie.js (IndexedDB) with persistent storage lock; no external cloud database required |
| **Project Management** | Multiple active and archived projects, project stats, client details, project cloning, JSON backup export & restore |
| **Site Visits (Reports)** | Multi-phase walkthroughs, weather conditions, date/time logging, alphabetical & chronological attendee tracking |
| **Key Plans & Blueprints** | Single & multi-page PDF sheet selection via PDF.js, image upload, pinch-to-zoom, pan, numbered defect pins |
| **Defect Observations** | Status badges (*Open*, *In Progress*, *Resolved*), custom categories/trades, priority levels, due dates, assignee tagging |
| **Photo Annotations** | Camera capture, photo library picker, high-resolution canvas editor, arrows, cloud callouts, boxes, text, multi-color palette |
| **Voice Dictation** | Multi-sentence speech-to-text voice recognition with silence flush and seamless pause handling |
| **Export Engine** | High-definition PDF generation with custom company logo, accent theme colors, ZIP photo archives, and CSV exports |
| **Security & Privacy** | 100% local device storage; no third-party tracking; data never leaves your device unless explicitly exported |

---

## 🛠️ Built With

- **Frontend:** [React 18](https://react.dev/), [Vite 5](https://vitejs.dev/), [Tailwind CSS](https://tailwindcss.com/)
- **Desktop Shell:** [Electron 33](https://www.electronjs.org/) & [electron-builder](https://www.electron.build/)
- **PWA Service Worker:** [Vite Plugin PWA](https://vite-pwa-org.netlify.app/) & [Workbox](https://developer.chrome.com/docs/workbox/)
- **Local Database:** [Dexie.js](https://dexie.org/) (IndexedDB wrapper)
- **Drawing & Markup:** [Konva.js](https://konvajs.org/) / [react-konva](https://github.com/konvajs/react-konva), [Fabric.js](http://fabricjs.com/)
- **PDF Engine:** [jsPDF](https://github.com/parallax/jsPDF), [PDF.js](https://mozilla.github.io/pdf.js/)
- **State Management:** [Zustand](https://github.com/pmndrs/zustand)
- **Icons:** [Lucide React](https://lucide.dev/)

---

## 📄 License

Private & Proprietary. All rights reserved.
