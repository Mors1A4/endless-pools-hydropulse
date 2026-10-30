import subprocess
import time
import os
import json
import base64
import urllib.request
import threading
import http.server
import socketserver
import websocket

PORT = 5182
DEBUG_PORT = 9225
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
DIST_DIR = r"c:\Users\monty\Documents\AB\pool\app\dist"
CONV_DIR = r"C:\Users\monty\.gemini\antigravity\brain\50b80a58-4cfb-4146-aa64-29ff2d8324dd"
OUT_DIR = os.path.join(CONV_DIR, "device_screenshots")

DEVICES = [
    {"name": "pixel_8", "label": "Google Pixel 8", "width": 392, "height": 850, "scale": 2.625},
    {"name": "pixel_8_pro", "label": "Google Pixel 8 Pro", "width": 412, "height": 915, "scale": 3.0},
    {"name": "galaxy_s24", "label": "Samsung Galaxy S24", "width": 360, "height": 780, "scale": 3.0},
    {"name": "compact_phone", "label": "Compact Android (360x640)", "width": 360, "height": 640, "scale": 2.0},
    {"name": "iphone_15", "label": "iPhone 15 / 16", "width": 393, "height": 852, "scale": 3.0},
    {"name": "poolside_tablet", "label": "Poolside Tablet / iPad", "width": 768, "height": 1024, "scale": 2.0},
]

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    
    # 1. Start HTTP Server
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    print(f"HTTP server serving {DIST_DIR} on http://127.0.0.1:{PORT}")

    # 2. Launch Chrome Headless with Remote Debugging
    chrome_cmd = [
        CHROME_PATH,
        "--headless=new",
        "--disable-gpu",
        f"--remote-debugging-port={DEBUG_PORT}",
        "about:blank"
    ]
    proc = subprocess.Popen(chrome_cmd)
    time.sleep(2)

    try:
        # Get target WebSocket URL
        target_url = f"http://127.0.0.1:{DEBUG_PORT}/json"
        with urllib.request.urlopen(target_url) as r:
            targets = json.loads(r.read().decode())
        ws_url = targets[0]["webSocketDebuggerUrl"]
        print(f"Connected to Chrome CDP at: {ws_url}")

        ws = websocket.create_connection(ws_url)
        msg_id = 1

        def send_cmd(method, params=None):
            nonlocal msg_id
            payload = {"id": msg_id, "method": method, "params": params or {}}
            msg_id += 1
            ws.send(json.dumps(payload))
            while True:
                resp = json.loads(ws.recv())
                if resp.get("id") == payload["id"]:
                    return resp.get("result", {})

        # Enable Page & DOM
        send_cmd("Page.enable")
        send_cmd("DOM.enable")

        for dev in DEVICES:
            print(f"\n--- Emulating {dev['label']} ({dev['width']}x{dev['height']}) ---")
            
            # Set exact mobile emulation metrics
            send_cmd("Emulation.setDeviceMetricsOverride", {
                "width": dev["width"],
                "height": dev["height"],
                "deviceScaleFactor": 1,
                "mobile": True,
                "fitWindow": False
            })

            # Set user agent
            send_cmd("Emulation.setUserAgentOverride", {
                "userAgent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            })

            # Navigate to local web app
            send_cmd("Page.navigate", {"url": f"http://127.0.0.1:{PORT}"})
            time.sleep(1.2) # Allow React render

            # Capture screenshot
            ss_res = send_cmd("Page.captureScreenshot", {
                "format": "png",
                "quality": 95,
                "captureBeyondViewport": False
            })

            b64_data = ss_res.get("data", "")
            if b64_data:
                out_file = os.path.join(OUT_DIR, f"{dev['name']}_{dev['width']}x{dev['height']}.png")
                with open(out_file, "wb") as f:
                    f.write(base64.b64decode(b64_data))
                file_size = os.path.getsize(out_file)
                print(f"[OK] Captured {out_file} ({file_size:,} bytes)")
            else:
                print(f"[FAIL] No screenshot data returned for {dev['name']}")

        ws.close()

    finally:
        proc.terminate()
        httpd.shutdown()
        print("\nFinished device screenshot capture session.")

if __name__ == "__main__":
    main()
