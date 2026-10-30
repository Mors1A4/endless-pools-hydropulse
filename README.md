# HydroPulse: Next-Generation Swim Workout App for Endless Pools®

**HydroPulse** is a modern, commercial-grade swim workout and interval training application designed for Endless Pools swimming machines (Fastlane, Original Series, E-Series Swim Spas). It is engineered specifically to replace the abandoned, broken **Fit@Home®** application on modern Android flagships like the **Google Pixel 8** (Android 14 & 15).

- **GitHub Repository**: [https://github.com/Mors1A4/endless-pools-hydropulse](https://github.com/Mors1A4/endless-pools-hydropulse)
- **Current Release**: **v2.0.0** (`hydropulse.apk`)

---

## Key Features in v2.0.0

- **Top Start & Stop Controls**: Primary action buttons (`START SWIM WORKOUT`, `STOP SWIM`, `PAUSE`) are positioned at the very top edge of the screen, completely eliminating scrolling and preventing accidental touches on Android's bottom navigation bar or back button.
- **Hands-Free Voice Commands (Wet Hands)**: Speak code words poolside without touching the screen:
  - `"Start"` / `"Go"` &rarr; begins workout.
  - `"Stop"` / `"Halt"` &rarr; cuts motor immediately.
  - `"Pause"` / `"Resume"` &rarr; toggles current flow and timer.
  - `"Up 5"` / `"Down 5"` &rarr; shifts current speed by 5 notches.
  - `"Faster"` / `"Slower"` &rarr; shifts current speed by 1 notch.
- **1-to-52 Speed Notches (Click Scale)**: Replaces confusing minutes/100m pace with the official Endless Pools digital click scale from Notch 1 (slowest, 3:30/100m) to Notch 52 (fastest, 1:14/100m).
- **Pixel 8 & Android 14/15 Certified**: Native foreground service with `WifiManager.MulticastLock` ensuring UDP multicast broadcasts (`239.255.0.1:45654`) and control commands (`port 9750`) are never dropped.
- **Independent Family Workout Memory**: Sandboxed local device storage automatically recalls each family member's exact workout on their own phone (Dad's phone remembers his workout, Mum's phone remembers hers).
- **Free Git-Hosted In-App Auto-Updates**: Free in-app updates hosted via GitHub Releases (`/releases/latest`) with live download progress bar (`0% -> 100%`) and native `PackageInstaller` (`FileProvider`).
- **Simplistic Water Theme**: High-contrast, clean aquatic styling with zero neon, zero emojis, and zero icons.
- **Poolside HUD**: Giant 40% screen-height countdown digits legible from 2–3 meters away through fogged, water-sprayed goggles.
- **Turnkey Commercial Pitch Deck**: Complete executive acquisition brief formatted for presentation to Watkins Wellness / Endless Pools executives.

---

## Quick Start & Running

### 1. Build & Install Native APK on Pixel 8
Connect your Pixel 8 via USB (or wireless adb) and run:
```cmd
adb install -r hydropulse.apk
```
*Or build from source:*
```cmd
build-android.bat
```

### 2. Run in Browser (Desktop / Phone Web)
```bash
cd app
npm run dev
```

### 3. Optional Local LAN WebSocket Bridge (for PC/Mac web testing)
```bash
python bridge/bridge.py
```
Bridges local web browser WebSockets with the pool's UDP Multicast network on `239.255.0.1:45654` and `9750`.
