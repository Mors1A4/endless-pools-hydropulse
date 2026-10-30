import subprocess
import time
import os
import threading
import http.server
import socketserver

PORT = 5181
DIST_HTML = r"c:\Users\monty\Documents\AB\pool\app\dist\index.html"
DIST_DIR = r"c:\Users\monty\Documents\AB\pool\app\dist"

with open(DIST_HTML, "r", encoding="utf-8") as f:
    html = f.read()

diag_js = """
<script>
window.addEventListener('load', () => {
  setTimeout(() => {
    const data = {
      winW: window.innerWidth,
      bodyW: document.body.scrollWidth,
      headerW: document.querySelector('header')?.scrollWidth,
      cardW: document.querySelector('main > div')?.scrollWidth,
    };
    const bad = [];
    document.querySelectorAll('*').forEach(e => {
      if (e.scrollWidth > 350) {
        bad.push(e.tagName + '.' + (typeof e.className === 'string' ? e.className.split(' ')[0] : '') + ':' + e.scrollWidth);
      }
    });
    data.bad = bad;
    document.title = 'DIAG:' + JSON.stringify(data);
  }, 500);
});
</script>
"""

with open(DIST_HTML, "w", encoding="utf-8") as f:
    f.write(html.replace("</head>", diag_js + "</head>"))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
t = threading.Thread(target=httpd.serve_forever, daemon=True)
t.start()
time.sleep(0.5)

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
cmd = [
    CHROME,
    "--headless=new",
    "--disable-gpu",
    "--window-size=392,850",
    "--virtual-time-budget=2000",
    "--dump-dom",
    f"http://127.0.0.1:{PORT}"
]

try:
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    for line in res.stdout.splitlines():
        if "DIAG:" in line or "<title>" in line:
            print("TITLE LINE:", line)
finally:
    httpd.shutdown()
    with open(DIST_HTML, "w", encoding="utf-8") as f:
        f.write(html)
