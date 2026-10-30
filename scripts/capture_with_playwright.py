#!/usr/bin/env python3
import subprocess
import time
import os
import threading
import http.server
import socketserver

PORT = 5183
DIST_DIR = r"c:\Users\monty\Documents\AB\pool\app\dist"
CONV_DIR = r"C:\Users\monty\.gemini\antigravity\brain\50b80a58-4cfb-4146-aa64-29ff2d8324dd"
OUT_DIR = os.path.join(CONV_DIR, "device_screenshots")

DEVICES = [
    {"name": "pixel_8", "label": "Google Pixel 8", "size": "392, 850"},
    {"name": "pixel_8_pro", "label": "Google Pixel 8 Pro", "size": "412, 915"},
    {"name": "galaxy_s24", "label": "Samsung Galaxy S24", "size": "360, 780"},
    {"name": "compact_phone", "label": "Compact Android", "size": "360, 640"},
    {"name": "iphone_15", "label": "iPhone 15 / 16", "size": "393, 852"},
    {"name": "poolside_tablet", "label": "Poolside Tablet / iPad", "size": "768, 1024"},
]

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    print(f"HTTP server serving {DIST_DIR} on http://127.0.0.1:{PORT}")
    time.sleep(1)

    url = f"http://127.0.0.1:{PORT}"

    try:
        for dev in DEVICES:
            out_file = os.path.join(OUT_DIR, f"{dev['name']}.png")
            print(f"Capturing {dev['label']} ({dev['size']})...")
            
            cmd = [
                "npx.cmd",
                "playwright",
                "screenshot",
                "--channel", "chrome",
                "--viewport-size", dev["size"],
                "--wait-for-timeout", "1000",
                url,
                out_file
            ]
            
            subprocess.run(cmd, check=True)
            size = os.path.getsize(out_file)
            print(f"  [OK] {dev['name']}.png ({size:,} bytes)")

    finally:
        httpd.shutdown()
        print("\nAll Playwright screenshots captured successfully!")

if __name__ == "__main__":
    main()
