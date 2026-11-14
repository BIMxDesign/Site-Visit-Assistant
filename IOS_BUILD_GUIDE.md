# Apple iPhone Native Application Setup Guide
**App Name:** Site Visit Assistant  
**Bundle ID:** `com.sitevisitassistant.app`  
**Xcode Workspace Location:** `ios/App/App.xcodeproj`

---

## 1. What Was Created
- **Capacitor iOS Platform (`/ios` folder):** A full native Xcode project configured specifically for iOS (iPhone & iPad).
- **Camera & Photo Library Permissions:** Configured in `ios/App/App/Info.plist` for defect photo capture and key plan imports.
- **Native Plugins Configured:**
  - `@capacitor/status-bar`: Styled for dark/translucent iOS navigation.
  - `@capacitor/keyboard`: Smooth form entry on mobile screens.
  - `@capacitor/splash-screen`: Native launch screen transition.
  - `@capacitor/haptics`: iOS tactile vibration feedback.
- **Safe Area Support:** The app already includes `env(safe-area-inset-top)` and `viewport-fit=cover` for iPhone notch and Dynamic Island devices.

---

## 2. Requirements for Building & Testing on iPhone
Apple requires **macOS with Xcode** to compile and code-sign native iOS binaries:
1. A Mac (MacBook, Mac Mini, iMac, or Mac in Cloud / GitHub Actions).
2. [Xcode](https://developer.apple.com/xcode/) installed from the Mac App Store (free).
3. Apple ID (free personal account to test on your own iPhone; Apple Developer account to distribute on TestFlight or App Store).

---

## 3. How to Run & Build on a Mac

### Step 1: Open the Project in Xcode
Transfer or clone your project directory to the Mac, then run:
```bash
npx cap open ios
```
*(Or manually double-click `ios/App/App.xcodeproj` in Finder).*

### Step 2: Configure Code Signing
1. In Xcode, select the root **App** project in the left navigator.
2. Select the **App** target under **Targets**.
3. Click the **Signing & Capabilities** tab.
4. Check **Automatically manage signing**.
5. Under **Team**, select your Apple ID account (add it under Xcode > Settings > Accounts if needed).

### Step 3: Run on Your Physical iPhone or Simulator
1. Connect your iPhone via USB / Wi-Fi (or choose an iPhone simulator from the device menu at the top).
2. Press the **Play (▶ Run)** button in Xcode.
3. The app compiles and installs natively onto your iPhone!

---

## 4. Syncing Web Updates to iOS
Whenever you make updates to the React app:
```bash
npm run build:ios
```
This runs `vite build` and immediately syncs the bundled web assets and plugins into the `ios/` Xcode project.
