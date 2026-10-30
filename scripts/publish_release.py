#!/usr/bin/env python3
"""
HydroPulse Free Auto-Update Publisher Script

Automates creating and publishing a new release:
1. Updates package.json, build.gradle, and version.json to the target version.
2. Builds the web bundle and Android APK.
3. Copies hydropulse.apk to workspace root.
4. Pushes changes to GitHub main branch.
5. Creates the GitHub release tag and uploads hydropulse.apk as a release asset.
"""

import sys
import os
import json
import shutil
import subprocess
import re
import urllib.request
import urllib.error

def get_github_token():
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        try:
            url = subprocess.check_output(['git', 'config', '--get', 'remote.origin.url'], text=True).strip()
            m = re.search(r'gh[op]_[A-Za-z0-9_]+', url)
            if m:
                token = m.group(0)
        except Exception:
            pass
    return token

def main():
    new_version = sys.argv[1].lstrip('v') if len(sys.argv) > 1 else "2.1.0"
    notes = sys.argv[2] if len(sys.argv) > 2 else (
        "- Redesigned minimalist phone layout with zero icons and zero emojis\n"
        "- Top-positioned Start and Stop controls for pool edge use\n"
        "- Spacious, high-contrast touch targets for wet hands\n"
        "- Calibrated 1-to-52 Endless Pools speed notches\n"
        "- Hands-free voice commands ('start', 'stop', 'pause', 'up 5', 'down 5')\n"
        "- Independent per-phone workout memory"
    )

    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    app_dir = os.path.join(root_dir, "app")
    android_dir = os.path.join(app_dir, "android")

    print(f"\n=== Publishing HydroPulse v{new_version} ===")

    # 1. Update version.json
    version_json_path = os.path.join(root_dir, "version.json")
    v_data = {
        "version": new_version,
        "name": f"HydroPulse v{new_version} Release",
        "notes": notes,
        "publishedAt": "2026-10-30T11:15:00Z",
        "apkUrl": f"https://github.com/Mors1A4/endless-pools-hydropulse/releases/download/v{new_version}/hydropulse.apk",
        "apkSize": 4165132,
        "htmlUrl": f"https://github.com/Mors1A4/endless-pools-hydropulse/releases/tag/v{new_version}"
    }
    with open(version_json_path, "w", encoding="utf-8") as f:
        json.dump(v_data, f, indent=2)
    print(f"[OK] Updated {version_json_path}")

    # 2. Update package.json
    pkg_json_path = os.path.join(app_dir, "package.json")
    if os.path.exists(pkg_json_path):
        with open(pkg_json_path, "r", encoding="utf-8") as f:
            pkg_data = json.load(f)
        pkg_data["version"] = new_version
        with open(pkg_json_path, "w", encoding="utf-8") as f:
            json.dump(pkg_data, f, indent=2)
        print(f"[OK] Updated {pkg_json_path}")

    # 3. Update build.gradle versionCode and versionName
    gradle_path = os.path.join(android_dir, "app", "build.gradle")
    if os.path.exists(gradle_path):
        with open(gradle_path, "r", encoding="utf-8") as f:
            g_content = f.read()
        # Extract and bump versionCode
        m_code = re.search(r"versionCode\s+(\d+)", g_content)
        current_code = int(m_code.group(1)) if m_code else 2
        next_code = current_code + 1
        g_content = re.sub(r"versionCode\s+\d+", f"versionCode {next_code}", g_content)
        g_content = re.sub(r'versionName\s+"[^"]+"', f'versionName "{new_version}"', g_content)
        with open(gradle_path, "w", encoding="utf-8") as f:
            f.write(g_content)
        print(f"[OK] Bumped build.gradle to versionCode {next_code}, versionName \"{new_version}\"")

    # 4. Update CURRENT_APP_VERSION in updateService.ts
    update_service_path = os.path.join(app_dir, "src", "services", "updateService.ts")
    if os.path.exists(update_service_path):
        with open(update_service_path, "r", encoding="utf-8") as f:
            u_content = f.read()
        u_content = re.sub(r"export const CURRENT_APP_VERSION = '[^']+';", f"export const CURRENT_APP_VERSION = '{new_version}';", u_content)
        with open(update_service_path, "w", encoding="utf-8") as f:
            f.write(u_content)
        print(f"[OK] Updated CURRENT_APP_VERSION in {update_service_path} to {new_version}")

    # 5. Build Web Bundle & Sync Capacitor
    print("\n--- Building Web Bundle ---")
    subprocess.run(["npm.cmd", "run", "build"], cwd=app_dir, check=True)
    subprocess.run(["npx.cmd", "cap", "sync", "android"], cwd=app_dir, check=True)

    # 5. Build Android APK with Gradle
    print("\n--- Building Android APK with Gradle ---")
    subprocess.run(["cmd.exe", "/c", "gradlew.bat", "assembleDebug"], cwd=android_dir, check=True)

    built_apk = os.path.join(android_dir, "app", "build", "outputs", "apk", "debug", "app-debug.apk")
    target_apk = os.path.join(root_dir, "hydropulse.apk")

    if os.path.exists(built_apk):
        shutil.copy2(built_apk, target_apk)
        size = os.path.getsize(target_apk)
        v_data["apkSize"] = size
        with open(version_json_path, "w", encoding="utf-8") as f:
            json.dump(v_data, f, indent=2)
        print(f"[OK] Packaged {target_apk} ({size:,} bytes)")

    # 6. Commit and Push to Git
    print("\n--- Pushing to Git ---")
    subprocess.run(["git", "add", "."], cwd=root_dir, check=True)
    subprocess.run(["git", "commit", "-m", f"Release v{new_version}: Minimalist layout and auto-update"], cwd=root_dir, check=True)
    subprocess.run(["git", "push", "origin", "main"], cwd=root_dir, check=True)
    print(f"[OK] Pushed v{new_version} to GitHub main branch")

    # 7. Create GitHub Release and Upload APK
    token = get_github_token()
    if not token:
        print("[WARN] No GitHub token found. Skip release API creation.")
        return

    owner = "Mors1A4"
    repo = "endless-pools-hydropulse"
    tag_name = f"v{new_version}"

    headers = {
        "Authorization": f"token {token}",
        "User-Agent": "HydroPulse-Release-Agent",
        "Accept": "application/vnd.github.v3+json"
    }

    release_payload = json.dumps({
        "tag_name": tag_name,
        "target_commitish": "main",
        "name": f"HydroPulse {tag_name} Release",
        "body": notes,
        "draft": False,
        "prerelease": False
    }).encode("utf-8")

    print(f"\n--- Creating GitHub Release {tag_name} ---")
    rel_url = f"https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag_name}"
    try:
        chk_req = urllib.request.Request(rel_url, headers=headers)
        res = urllib.request.urlopen(chk_req)
        existing_rel = json.loads(res.read())
        upload_url = existing_rel["upload_url"].split("{")[0]
        release_id = existing_rel["id"]
        print(f"[OK] Release {tag_name} already exists (ID: {release_id})")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            create_url = f"https://api.github.com/repos/{owner}/{repo}/releases"
            post_req = urllib.request.Request(create_url, data=release_payload, headers={**headers, "Content-Type": "application/json"})
            res = urllib.request.urlopen(post_req)
            new_rel = json.loads(res.read())
            upload_url = new_rel["upload_url"].split("{")[0]
            release_id = new_rel["id"]
            print(f"[OK] Created Release {tag_name} (ID: {release_id})")
        else:
            raise

    # Upload APK asset
    print(f"[+] Uploading {target_apk} ({size:,} bytes) to GitHub release...")
    with open(target_apk, "rb") as f:
        apk_data = f.read()

    asset_upload_url = f"{upload_url}?name=hydropulse.apk"
    upload_headers = {
        **headers,
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Length": str(len(apk_data))
    }

    # Delete old asset if exists
    assets_url = f"https://api.github.com/repos/{owner}/{repo}/releases/{release_id}/assets"
    try:
        assets_res = urllib.request.urlopen(urllib.request.Request(assets_url, headers=headers))
        assets_list = json.loads(assets_res.read())
        for a in assets_list:
            if a["name"] == "hydropulse.apk":
                del_url = f"https://api.github.com/repos/{owner}/{repo}/releases/assets/{a['id']}"
                del_req = urllib.request.Request(del_url, headers=headers, method="DELETE")
                urllib.request.urlopen(del_req)
                print(f"[OK] Cleared previous asset {a['id']}")
    except Exception as e:
        print("Asset check note:", e)

    upload_req = urllib.request.Request(asset_upload_url, data=apk_data, headers=upload_headers)
    upload_res = urllib.request.urlopen(upload_req)
    asset_data = json.loads(upload_res.read())
    print(f"\n[SUCCESS] Release {tag_name} is LIVE on GitHub!")
    print(f"Direct download: {asset_data.get('browser_download_url')}")
    print(f"All devices running HydroPulse will now see v{new_version} as the latest release and prompt to update!")

if __name__ == "__main__":
    main()
