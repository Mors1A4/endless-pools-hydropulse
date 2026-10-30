#!/usr/bin/env python3
"""
Test Device Viewports & Capture Headless Chrome Screenshots
Tests:
1. Google Pixel 8 (392 x 850)
2. Samsung Galaxy S24 / S23 (360 x 780)
3. Compact Phone / Small Display Zoom (360 x 640)
4. iPhone 15 / 16 (393 x 852)
5. Large Pro Flagship (412 x 915)
6. Poolside Tablet / iPad (768 x 1024)
"""

import os
import sys
import time
import subprocess
import threading
import http.server
import socketserver

PORT = 5179
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
CONV_DIR = r"C:\Users\monty\.gemini\antigravity\brain\50b80a58-4cfb-4146-aa64-29ff2d8324dd"
OUT_DIR = os.path.join(CONV_DIR, "device_screenshots")
DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app", "dist"))

DEVICES = [
    {"name": "pixel_8", "label": "Google Pixel 8", "width": 392, "height": 850},
    {"name": "pixel_8_pro", "label": "Google Pixel 8 Pro", "width": 412, "height": 915},
    {"name": "galaxy_s24", "label": "Samsung Galaxy S24", "width": 360, "height": 780},
    {"name": "compact_phone", "label": "Compact Android (360x640)", "width": 360, "height": 640},
    {"name": "iphone_15", "label": "iPhone 15 / 16", "width": 393, "height": 852},
    {"name": "poolside_tablet", "label": "Poolside Tablet / iPad", "width": 768, "height": 1024},
]

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)
    def log_message(self, format, *args):
        pass # Suppress server logging

def start_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        httpd.serve_forever()

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"Serving {DIST_DIR} on http://127.0.0.1:{PORT}")

    t = threading.Thread(target=start_server, daemon=True)
    t.start()
    time.sleep(1) # Let server bind

    url = f"http://127.0.0.1:{PORT}"
    print(f"Using Chrome at: {CHROME_PATH}")
    print(f"Saving screenshots to: {OUT_DIR}\n")

    results = []

    for dev in DEVICES:
        filename = f"{dev['name']}_{dev['width']}x{dev['height']}.png"
        filepath = os.path.join(OUT_DIR, filename)
        
        cmd = [
            CHROME_PATH,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            f"--window-size={dev['width']},{dev['height']}",
            f"--screenshot={filepath}",
            url
        ]

        print(f"Testing {dev['label']} ({dev['width']}x{dev['height']})...", end=" ")
        try:
            res = subprocess.run(cmd, capture_output=True, timeout=15)
            if os.path.exists(filepath):
                size = os.path.getsize(filepath)
                print(f"[OK] {filename} ({size:,} bytes)")
                results.append((dev, filepath, size))
            else:
                print(f"[FAILED] File not generated")
        except Exception as e:
            print(f"[ERROR] {e}")

    print(f"\nSuccessfully captured {len(results)}/{len(DEVICES)} device screenshots!")

if __name__ == "__main__":
    main()
