# HydroPulse: Free Git-Hosted Auto-Update System & Device Profile Guide

This guide explains how **HydroPulse** enables:
1. **Per-Phone Workout Memory** (independent auto-restore for you vs. your mum).
2. **100% Free Auto-Updates** using standard GitHub Releases and raw Git hosting with zero backend server costs.

---

## 1. Per-Phone Memory & Swimmer Profiles

### How It Remembers Settings on Each Phone
Every Android device isolates `localStorage` within the app's secure private sandbox:
- **Your Pixel 8**: Automatically remembers your last configured pace, workout duration, warm-up setting, and break choices.
- **Your Mum's Phone**: When HydroPulse is installed on your mum's phone, it maintains its own independent storage. It will always open with her last workout.

### 1-Tap Swimmer Profiles
Right at the top of the **Workout Setup** screen, HydroPulse provides instant swimmer profile buttons:
`[ Me ]  [ Mum ]  [ + New Swimmer ]`

| Profile | Default Pace | Duration | Warm-up Ramp | Break | Cool-down |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Me** | 1:40 / 100m (100s) | 20 min | Yes (2:15 flow) | 1 min pause | Off |
| **Mum** | 2:15 / 100m (135s) | 15 min | Yes (2:45 flow) | 1 min pause | 1 min easy |

- **Instant Switching**: Tapping `[ Mum ]` immediately repopulates all sliders, pace chips, and interval toggles to her exact preferences.
- **Auto-Persistence**: Any adjustments made while "Mum" is active are auto-saved to her profile on that phone.
- **Shared Phone Friendly**: If you and your mum share a single Pixel 8 poolside, you never need to reconfigure sliders—just tap your name!

---

## 2. Free Git-Hosted Auto-Update Architecture

The update system requires **zero monthly server fees** and works entirely over public Git hosting:

```
+-------------------------------------------------------------+
|                     GitHub Releases / Git                   |
|  - Free, unlimited bandwidth via GitHub CDN (Fastly / AWS)  |
|  - Public API: api.github.com/repos/{owner}/{repo}/releases |
|  - Fallback: raw.githubusercontent.com/.../version.json     |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                 Pixel 8 Native HydroPulse App               |
|                                                             |
|  1. App Launch: Checks for newer semver (e.g. v1.0.1)       |
|  2. If New Version Found: Prompts with Update Modal         |
|  3. User taps [ UPDATE AND INSTALL NOW ]                    |
|  4. Native Plugin downloads APK to app cache                |
|  5. FileProvider generates secure content:// URI            |
|  6. Launches Android PackageInstaller Intent                |
|  7. Android updates app preserving all workouts & profiles  |
+-------------------------------------------------------------+
```

### Features
- **Auto-Check on App Launch**: Silently checks GitHub when opened and displays an update prompt if a newer release exists.
- **Fallback Manifest**: If the GitHub API hits rate limits, the app automatically falls back to `https://raw.githubusercontent.com/{owner}/{repo}/main/version.json`.
- **In-App Package Installer**: Uses Android's `FileProvider` and `Intent.ACTION_VIEW` (`application/vnd.android.package-archive`) to trigger Android's native update prompt.
- **Browser Fallback**: Also provides a `[ Direct APK Link ]` button if the user prefers downloading through Chrome or external browser.
- **Customizable Git Repository**: In **Settings -> Software Updates**, users can customize the GitHub repository slug (e.g. `your-username/endless-pools-hydropulse`).

---

## 3. How to Publish an Update (1-Step Workflow)

We have provided an automated release script in `scripts/publish_release.py`.

To release a new update (e.g., version `1.0.1`):

```bash
python scripts/publish_release.py 1.0.1 "Added custom interval alert chime"
```

This single command will:
1. Bump the version in `version.json` and `updateService.ts`.
2. Build the production web bundle and sync Capacitor.
3. Compile the release APK via Gradle into `hydropulse.apk`.
4. Output the exact `git` and `gh` commands to publish:

```bash
git commit -am "Release v1.0.1"
git tag v1.0.1
git push origin main --tags
gh release create v1.0.1 hydropulse.apk --title "HydroPulse v1.0.1" --notes "Added custom interval alert chime"
```

Once pushed, every Pixel 8 running HydroPulse will immediately detect the new version on next launch and prompt to update!
