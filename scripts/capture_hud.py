import subprocess
import time
import os
import threading
import http.server
import socketserver

PORT = 5184
DIST_DIR = r"c:\Users\monty\Documents\AB\pool\app\dist"
CONV_DIR = r"C:\Users\monty\.gemini\antigravity\brain\50b80a58-4cfb-4146-aa64-29ff2d8324dd"
OUT_DIR = os.path.join(CONV_DIR, "device_screenshots")

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
    time.sleep(1)

    url = f"http://127.0.0.1:{PORT}"
    out_file = os.path.join(OUT_DIR, "pixel_8_hud.png")

    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 392, "height": 850})
        page.goto(url)
        page.wait_for_timeout(500)
        # Click START SWIM button
        page.click("text=START SWIM")
        page.wait_for_timeout(1000)
        page.screenshot(path=out_file)
        browser.close()

    print(f"Captured HUD: {out_file} ({os.path.getsize(out_file)} bytes)")

if __name__ == "__main__":
    main()
