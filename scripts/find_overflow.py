import subprocess
import time
import json
import urllib.request
import http.server
import socketserver
import threading

PORT = 5180
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
DIST_DIR = r"c:\Users\monty\Documents\AB\pool\app\dist"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

def start_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        httpd.serve_forever()

t = threading.Thread(target=start_server, daemon=True)
t.start()
time.sleep(0.5)

# Launch Chrome with remote debugging
DEBUG_PORT = 9222
cmd = [
    CHROME_PATH,
    "--headless=new",
    "--disable-gpu",
    f"--remote-debugging-port={DEBUG_PORT}",
    f"--window-size=392,850",
    f"http://127.0.0.1:{PORT}"
]

proc = subprocess.Popen(cmd)
time.sleep(2)

try:
    # Query DevTools targets
    targets_url = f"http://127.0.0.1:{DEBUG_PORT}/json"
    with urllib.request.urlopen(targets_url) as resp:
        targets = json.loads(resp.read().decode())
    
    page = targets[0]
    ws_url = page.get("webSocketDebuggerUrl")
    print("Page target found:", page.get("url"))

except Exception as e:
    print("DevTools query error:", e)
finally:
    proc.terminate()
