import urllib.request
import urllib.error
import json
import subprocess
import os
import sys
import re

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

def get_headers():
    return {
        "Authorization": f"token {TOKEN}",
        "User-Agent": "HydroPulse-Release-Agent",
        "Accept": "application/vnd.github.v3+json"
    }

def create_or_get_repo():
    url = f"https://api.github.com/repos/{OWNER}/{REPO}"
    req = urllib.request.Request(url, headers=get_headers())
    try:
        res = urllib.request.urlopen(req)
        data = json.loads(res.read())
        print(f"[OK] Repository already exists: {data.get('html_url')}")
        return data
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"[+] Creating repository {OWNER}/{REPO} on GitHub...")
            create_url = "https://api.github.com/user/repos"
            payload = json.dumps({
                "name": REPO,
                "description": "HydroPulse: Modern Endless Pools Swim Workout & Interval Companion App for Google Pixel 8 & Android",
                "private": False,
                "has_issues": True,
                "has_projects": False,
                "has_wiki": False
            }).encode("utf-8")
            post_req = urllib.request.Request(
                create_url,
                data=payload,
                headers={**get_headers(), "Content-Type": "application/json"}
            )
            res = urllib.request.urlopen(post_req)
            data = json.loads(res.read())
            print(f"[OK] Repository created successfully: {data.get('html_url')}")
            return data
        else:
            raise

if __name__ == "__main__":
    create_or_get_repo()
