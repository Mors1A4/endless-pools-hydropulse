import subprocess
import os
import sys
import json
import re
import urllib.request
import urllib.error

# Read token dynamically from environment or local git remote config (never hardcoded in source)
TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
if not TOKEN:
    try:
        url = subprocess.check_output(['git', 'config', '--get', 'remote.origin.url'], text=True).strip()
        m = re.search(r'gh[op]_[A-Za-z0-9_]+', url)
        if m:
            TOKEN = m.group(0)
    except Exception:
        pass

OWNER = "Mors1A4"
REPO = "endless-pools-hydropulse"
VERSION = "v2.0.0"

def run_cmd(cmd, cwd=None):
    print(f"Running: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    res = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True, text=True)
    if res.stdout:
        print(res.stdout)
    if res.stderr:
        print(res.stderr, file=sys.stderr)
    if res.returncode != 0:
        raise RuntimeError(f"Command failed with code {res.returncode}")
    return res.stdout

def push_git():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    
    # 1. Configure remote
    remote_url = f"https://{TOKEN}@github.com/{OWNER}/{REPO}.git"
    
    # Check remotes
    remotes = subprocess.run(["git", "remote"], cwd=root_dir, capture_output=True, text=True).stdout
    if "origin" in remotes.split():
        run_cmd(["git", "remote", "set-url", "origin", remote_url], cwd=root_dir)
    else:
        run_cmd(["git", "remote", "add", "origin", remote_url], cwd=root_dir)
        
    print("[OK] Configured remote origin")
    
    # 2. Stage and commit if changes exist
    run_cmd(["git", "add", "."], cwd=root_dir)
    status = subprocess.run(["git", "status", "--porcelain"], cwd=root_dir, capture_output=True, text=True).stdout
    if status.strip():
        run_cmd(["git", "commit", "-m", "HydroPulse v2.0.0: Endless Pools Swim Interval Companion for Pixel 8"], cwd=root_dir)
    run_cmd(["git", "branch", "-M", "main"], cwd=root_dir)
    
    # 3. Push main
    print("[+] Pushing to GitHub main branch...")
    run_cmd(["git", "push", "-u", "origin", "main", "--force"], cwd=root_dir)
    print("[OK] Pushed to https://github.com/Mors1A4/endless-pools-hydropulse")

def create_github_release():
    print(f"[+] Creating GitHub Release {VERSION}...")
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    apk_path = os.path.join(root_dir, "hydropulse.apk")
    apk_size = os.path.getsize(apk_path)
    
    headers = {
        "Authorization": f"token {TOKEN}",
        "User-Agent": "HydroPulse-Release-Agent",
        "Accept": "application/vnd.github.v3+json"
    }
    
    release_payload = json.dumps({
        "tag_name": VERSION,
        "target_commitish": "main",
        "name": f"HydroPulse {VERSION} Release",
        "body": (
            "## HydroPulse v2.0.0 Release for Google Pixel 8 & Android\n\n"
            "- **Top Start & Stop Controls**: Primary action buttons positioned at the top edge to eliminate scrolling and avoid Android back gestures.\n"
            "- **Hands-Free Voice Commands**: Poolside wet-hands control listening for 'start', 'stop', 'pause', 'resume', 'up 5', 'down 5', 'faster', 'slower'.\n"
            "- **1-to-52 Speed Notches**: Endless Pools digital click scale from Notch 1 (slowest, 3:30/100m) to Notch 52 (fastest, 1:14/100m).\n"
            "- **Independent Family Memory**: Sandboxed device storage recalls each phone's last workout independently.\n"
            "- **Free In-App Native Auto-Updater**: Native APK download with real-time progress bar and package installer trigger.\n"
            "- **Real Hardware UDP Multicast**: 100% real Endless Pools 44-byte/111-byte protocol link with CRC-32.\n"
        ),
        "draft": False,
        "prerelease": False
    }).encode("utf-8")
    
    # Check if release exists
    rel_url = f"https://api.github.com/repos/{OWNER}/{REPO}/releases/tags/{VERSION}"
    try:
        chk_req = urllib.request.Request(rel_url, headers=headers)
        res = urllib.request.urlopen(chk_req)
        existing_rel = json.loads(res.read())
        upload_url = existing_rel["upload_url"].split("{")[0]
        release_id = existing_rel["id"]
        print(f"[OK] Release {VERSION} already exists (ID: {release_id})")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            create_url = f"https://api.github.com/repos/{OWNER}/{REPO}/releases"
            post_req = urllib.request.Request(create_url, data=release_payload, headers={**headers, "Content-Type": "application/json"})
            res = urllib.request.urlopen(post_req)
            new_rel = json.loads(res.read())
            upload_url = new_rel["upload_url"].split("{")[0]
            release_id = new_rel["id"]
            print(f"[OK] Created Release {VERSION} (ID: {release_id})")
        else:
            raise

    # Upload hydropulse.apk asset
    print(f"[+] Uploading {apk_path} ({apk_size:,} bytes) to release...")
    with open(apk_path, "rb") as f:
        apk_data = f.read()

    asset_upload_url = f"{upload_url}?name=hydropulse.apk"
    upload_headers = {
        **headers,
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Length": str(len(apk_data))
    }
    
    # Delete existing asset if present
    assets_url = f"https://api.github.com/repos/{OWNER}/{REPO}/releases/{release_id}/assets"
    try:
        assets_res = urllib.request.urlopen(urllib.request.Request(assets_url, headers=headers))
        assets_list = json.loads(assets_res.read())
        for a in assets_list:
            if a["name"] == "hydropulse.apk":
                del_url = f"https://api.github.com/repos/{OWNER}/{REPO}/releases/assets/{a['id']}"
                del_req = urllib.request.Request(del_url, headers=headers, method="DELETE")
                urllib.request.urlopen(del_req)
                print(f"[OK] Deleted old asset {a['id']}")
    except Exception as e:
        print("Asset check note:", e)
        
    upload_req = urllib.request.Request(asset_upload_url, data=apk_data, headers=upload_headers)
    upload_res = urllib.request.urlopen(upload_req)
    asset_data = json.loads(upload_res.read())
    print(f"[SUCCESS] Uploaded APK asset: {asset_data.get('browser_download_url')}")

if __name__ == "__main__":
    push_git()
    create_github_release()
