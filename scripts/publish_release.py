#!/usr/bin/env python3
"""
HydroPulse Free Auto-Update Publisher Script

Automates creating a new release:
1. Updates package.json and version.json to new version.
2. Builds the Android APK with Gradle.
3. Copies hydropulse.apk into the root folder.
4. Outputs the exact git tag and gh release command for 100% free hosting.
"""

import sys
import os
import json
import shutil
import subprocess

def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/publish_release.py <version> [release_notes]")
        print("Example: python scripts/publish_release.py 1.0.1 'Added high cadence interval alerts'")
        sys.exit(1)

    new_version = sys.argv[1].lstrip('v')
    notes = sys.argv[2] if len(sys.argv) > 2 else f"HydroPulse v{new_version} swim engine updates."

    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    app_dir = os.path.join(root_dir, "app")
    android_dir = os.path.join(app_dir, "android")

    print(f"\n=== Publishing HydroPulse v{new_version} ===")

    # 1. Update version.json
    version_json_path = os.path.join(root_dir, "version.json")
    v_data = {
        "version": new_version,
        "name": f"HydroPulse v{new_version}",
        "notes": notes,
        "publishedAt": "2026-10-30T10:00:00Z",
        "apkUrl": f"https://github.com/Mors1A4/endless-pools-hydropulse/releases/download/v{new_version}/hydropulse.apk",
        "apkSize": 4135076,
        "htmlUrl": "https://github.com/Mors1A4/endless-pools-hydropulse/releases"
    }
    with open(version_json_path, "w", encoding="utf-8") as f:
        json.dump(v_data, f, indent=2)
    print(f"[OK] Updated {version_json_path}")

    # 2. Update updateService.ts version constant
    update_service_path = os.path.join(app_dir, "src", "services", "updateService.ts")
    if os.path.exists(update_service_path):
        with open(update_service_path, "r", encoding="utf-8") as f:
            content = f.read()
        import re
        content = re.sub(r"export const CURRENT_APP_VERSION = '[^']+';", f"export const CURRENT_APP_VERSION = '{new_version}';", content)
        with open(update_service_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"[OK] Updated CURRENT_APP_VERSION in {update_service_path}")

    # 3. Build Web & Sync Capacitor
    print("\n--- Building Web Bundle ---")
    subprocess.run(["npm.cmd", "run", "build"], cwd=app_dir, check=True)
    subprocess.run(["npx.cmd", "cap", "sync", "android"], cwd=app_dir, check=True)

    # 4. Build APK with Gradle
    print("\n--- Building Android APK ---")
    subprocess.run(["cmd.exe", "/c", "gradlew.bat", "assembleDebug"], cwd=android_dir, check=True)

    built_apk = os.path.join(android_dir, "app", "build", "outputs", "apk", "debug", "app-debug.apk")
    target_apk = os.path.join(root_dir, "hydropulse.apk")

    if os.path.exists(built_apk):
        shutil.copy2(built_apk, target_apk)
        size = os.path.getsize(target_apk)
        v_data["apkSize"] = size
        with open(version_json_path, "w", encoding="utf-8") as f:
            json.dump(v_data, f, indent=2)
        print(f"[OK] Copied APK to {target_apk} ({size:,} bytes)")

    print("\n=== Release Build Complete! ===")
    print(f"To host on GitHub for free auto-updates:")
    print(f"  1. git commit -am 'Release v{new_version}'")
    print(f"  2. git tag v{new_version}")
    print(f"  3. git push origin main --tags")
    print(f"  4. gh release create v{new_version} hydropulse.apk --title 'HydroPulse v{new_version}' --notes '{notes}'")
    print("\nAny Pixel 8 or phone running HydroPulse will now auto-detect and update to this release!\n")

if __name__ == "__main__":
    main()
